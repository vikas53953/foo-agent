// Spec: 08-2 §6.2 (adapter interface), §6.3 (CLI common rules, argv per provider), §6.4 (stream parsing), §6.5 (probe,
// AI_PROTOCOL_VIOLATION), §6.6 (detect / verify), §6.7 (classification), §6.9 (≤ 4 CLI children), 08-4 §30.1 (cheap-model
// unknown-model retry), §30.4 (fallbacks), §30.7 (no late text), §30.8 (system file written before spawn, deleted in
// finally), §30.10 (CLIs vision=false: a turn with image parts is AI_NO_VISION, not sent).
import type { ProviderId } from '../../shared/types';
import type { Result } from '../../shared/errors';
import { fail } from '../../shared/errors';
import type {
  AiAdapter,
  AiErrorKind,
  Capabilities,
  DetectResult,
  RawAiError,
  TurnRequest,
  TurnResult,
  TurnSink,
  VerifyResult,
} from './types';
import type { AdapterDeps } from './deps';
import { ProcessHost, safeTurnId, scratchDir } from './ProcessHost';
import { parseCapabilities, probeCli, type CliId, type CliProbe } from './probe';
import { NULL_USAGE, type StreamParser } from './parsers';
import { classifyError, resetAtFor, RE_UNKNOWN_MODEL } from './classify';
import { approxTokens, isCheapPurpose } from './models';
import { detectProvider } from './detect';
import { verifyWith } from './verify';
import path from 'node:path';

export interface BuiltCommand {
  args: string[];
  stdin: string;
  /** claude-cli: the system file to write before spawn and delete after. */
  systemFile?: { path: string; text: string };
  parser: StreamParser;
}

export interface CliSpec {
  id: CliId;
  build(req: TurnRequest, probe: CliProbe, ctx: { scratch: string; model: string | undefined }): BuiltCommand;
  /** 08-4 §30.1: a cheap turn that fails with an unknown-model error is retried once without the model flag. */
  unknownModelRetry: boolean;
}

/** COMBINED stdin (08-4 §30.4): system + blank line + prompt. */
export function combined(system: string, prompt: string): string {
  return system.trim() === '' ? prompt : `${system}\n\n${prompt}`;
}

export function failResult(kind: AiErrorKind, resetAt?: number): TurnResult {
  const r: TurnResult = { text: '', usage: NULL_USAGE, stopReason: 'error', errorKind: kind };
  if (resetAt !== undefined) r.resetAt = resetAt;
  return r;
}

export function cancelledResult(): TurnResult {
  return { text: '', usage: NULL_USAGE, stopReason: 'cancelled' };
}

/** Links an outer signal to a fresh controller (so `cancel(turnId)` can abort one turn). */
export function linkedController(signal: AbortSignal): { ctl: AbortController; unlink: () => void } {
  const ctl = new AbortController();
  const on = (): void => ctl.abort();
  if (signal.aborted) ctl.abort();
  else signal.addEventListener('abort', on, { once: true });
  return { ctl, unlink: () => signal.removeEventListener('abort', on) };
}

export class CliAdapter implements AiAdapter {
  readonly billing = 'plan' as const;
  private readonly host: ProcessHost;
  private probed: CliProbe | null = null;
  private probedFor: string | null = null;
  private binary: string | null = null;
  private cheapIsDefault = false;
  private readonly turns = new Map<string, AbortController>();

  constructor(
    private readonly spec: CliSpec,
    private readonly deps: AdapterDeps,
  ) {
    this.host = new ProcessHost(deps);
  }

  get id(): ProviderId {
    return this.spec.id;
  }

  async detect(): Promise<DetectResult> {
    const r = await detectProvider(this.spec.id, this.deps);
    this.binary = r.binaryPath ?? null;
    if (r.binaryPath !== this.probedFor) this.probed = null;
    return r;
  }

  /** Cached per binary; re-run on a version change by calling `reprobe()` (the engine compares versions). */
  async probe(): Promise<Capabilities> {
    return (await this.probeFull()).caps;
  }

  async probeFull(): Promise<CliProbe> {
    const bin = await this.bin();
    if (!bin) return { ...parseCapabilities(this.spec.id, '', null), usable: false };
    if (this.probed && this.probedFor === bin) return this.probed;
    this.probed = await probeCli(this.spec.id, bin, this.host);
    this.probedFor = bin;
    this.cheapIsDefault = false;
    return this.probed;
  }

  reprobe(): void {
    this.probed = null;
  }

  verify(signal: AbortSignal): Promise<VerifyResult> {
    return verifyWith(this, this.deps, signal);
  }

  async runTurn(req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult> {
    if (req.attachments?.length) return failResult('AI_NO_VISION'); // 08-4 §30.10: CLIs are vision=false in v1
    const bin = await this.bin();
    if (!bin) return failResult('AI_CLI_INCOMPATIBLE');
    const probe = await this.probeFull();
    if (!probe.usable) return failResult('AI_CLI_INCOMPATIBLE');

    const { ctl, unlink } = linkedController(signal);
    this.turns.set(req.turnId, ctl);
    let release: (() => void) | undefined;
    try {
      try {
        release = await this.deps.cliLimiter.acquire(ctl.signal);
      } catch {
        return cancelledResult();
      }
      let model = probe.caps.modelFlag ? req.model : undefined;
      if (this.cheapIsDefault && model !== undefined && model === this.cheapModelName()) model = undefined;
      let r = await this.once(bin, req, probe, model, sink, ctl.signal);
      if (r.retryWithoutModel && this.spec.unknownModelRetry && model !== undefined) {
        this.cheapIsDefault = true;
        r = await this.once(bin, req, probe, undefined, sink, ctl.signal);
      }
      return r.result;
    } finally {
      release?.();
      unlink();
      this.turns.delete(req.turnId);
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.turns.get(turnId)?.abort();
  }

  estimate(req: TurnRequest): { tokensIn: number; tokensOutMax: number; costPaise: number | null } {
    return {
      tokensIn: approxTokens(req.system) + approxTokens(req.prompt), // attachmentText is already prompt part 9 (08-4 §30.10)
      tokensOutMax: req.maxOutputTokens,
      costPaise: null, // plan billing: no per-turn price
    };
  }

  classifyError(e: RawAiError): AiErrorKind {
    return classifyError(e, 'plan');
  }

  /** Signing in from foo is verified at the M3 spike (08-2 §6.6 `[verify]`); until then J2 sends the user to the app. */
  async signIn(_signal: AbortSignal): Promise<Result<{ email?: string }>> {
    // TODO(M3 spike / M12): spawn `claude auth login` / `codex login` / `gemini` first-run per 08-2 §6.6 once captured.
    return fail('AI_CLI_INCOMPATIBLE', 'signIn not available before the M3 spike');
  }

  private cheapModelName(): string | undefined {
    const row = this.deps.pricing.models[this.spec.id];
    return this.deps.providerSettings?.(this.spec.id)?.cheapModel ?? row.cheapModel ?? undefined;
  }

  private async bin(): Promise<string | null> {
    if (this.binary) return this.binary;
    await this.detect();
    return this.binary;
  }

  private async once(
    bin: string,
    req: TurnRequest,
    probe: CliProbe,
    model: string | undefined,
    sink: TurnSink,
    signal: AbortSignal,
  ): Promise<{ result: TurnResult; retryWithoutModel?: boolean }> {
    const scratch = scratchDir(this.deps.paths.LOCAL, this.spec.id);
    const cmd = this.spec.build(req, probe, { scratch, model });
    let violation: string | undefined;
    let sessionSent: string | undefined;
    const stopTurn = new AbortController();
    const onOuter = (): void => stopTurn.abort();
    signal.addEventListener('abort', onOuter, { once: true });
    if (signal.aborted) stopTurn.abort();
    try {
      await this.deps.fs.mkdirp(scratch);
      if (cmd.systemFile) await this.deps.fs.writeText(cmd.systemFile.path, cmd.systemFile.text);
      const out = await this.host.run({
        providerId: this.spec.id,
        bin,
        args: cmd.args,
        stdin: cmd.stdin,
        timeoutMs: req.timeoutMs,
        signal: stopTurn.signal,
        onLine: (line) => {
          if (violation) return;
          for (const ev of cmd.parser.push(line)) {
            if (ev.type === 'violation') {
              violation = ev.what;
              stopTurn.abort(); // discard the turn (08-2 §6.5)
              return;
            }
            if (ev.type === 'text' && req.stream) sink.onText(ev.delta);
            if (ev.type === 'session' && ev.id !== sessionSent) {
              sessionSent = ev.id;
              sink.onSession(ev.id);
            }
          }
        },
      });
      const parsed = cmd.parser.result();
      violation ??= parsed.violation;
      if (violation) return { result: failResult('AI_PROTOCOL_VIOLATION') };
      if (out.timedOut) return { result: failResult('AI_TIMEOUT') };
      if (out.cancelled || signal.aborted) return { result: cancelledResult() };
      if (out.spawnError) return { result: failResult('AI_CLI_INCOMPATIBLE') };
      if (parsed.incompatible) return { result: failResult('AI_CLI_INCOMPATIBLE') };

      const okExit = out.exitCode === 0;
      if (okExit && (parsed.stopReason === 'end' || parsed.stopReason === 'max_tokens')) {
        const r: TurnResult = { text: parsed.text, usage: parsed.usage, stopReason: parsed.stopReason };
        if (parsed.sessionId) r.sessionId = parsed.sessionId;
        if (parsed.modelReported) r.modelReported = parsed.modelReported;
        return { result: r };
      }
      const raw: RawAiError = {
        providerId: this.spec.id,
        message: parsed.errorText ?? `exit ${String(out.exitCode)}`,
        stderr: out.stderr,
        exitCode: out.exitCode,
      };
      if (this.deps.isOnline) raw.online = this.deps.isOnline();
      if (this.spec.unknownModelRetry && model !== undefined && isCheapPurpose(req.purpose) && RE_UNKNOWN_MODEL.test(`${raw.message}\n${out.stderr}`))
        return { result: failResult('AI_CLI_INCOMPATIBLE'), retryWithoutModel: true };
      let kind = parsed.errorKind ?? this.classifyError(raw);
      // Exit 0 with no terminal envelope in JSON mode: the stream did not follow the format.
      if (kind === 'UNKNOWN' && okExit && parsed.stopReason === null) kind = 'AI_CLI_INCOMPATIBLE';
      return { result: failResult(kind, kind === 'AI_LIMIT' ? resetAtFor(raw, this.deps.clock.now(), this.deps.timeZone) : undefined) };
    } finally {
      signal.removeEventListener('abort', onOuter);
      if (cmd.systemFile) {
        try {
          await this.deps.fs.remove(cmd.systemFile.path);
        } catch {
          /* swept on engine start (08-4 §30.8) */
        }
      }
    }
  }
}

/** 08-4 §30.8: on engine start every `sys-*.md` in the scratch folders is deleted. */
export async function sweepSystemFiles(deps: Pick<AdapterDeps, 'fs' | 'paths'>): Promise<void> {
  const root = path.join(deps.paths.LOCAL, 'ai-scratch');
  let dirs: string[];
  try {
    dirs = await deps.fs.list(root);
  } catch {
    return;
  }
  for (const d of dirs) {
    let files: string[];
    try {
      files = await deps.fs.list(path.join(root, d));
    } catch {
      continue;
    }
    for (const f of files) if (/^sys-.*\.md$/.test(f)) await deps.fs.remove(path.join(root, d, f)).catch(() => undefined);
  }
}

export function systemFilePath(scratch: string, turnId: string): string {
  return path.join(scratch, `sys-${safeTurnId(turnId)}.md`);
}
