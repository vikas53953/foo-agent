// Spec: 08-3 §22.3 (the fake AI: FOO_FAKE_AI JSON Lines script; match purpose / promptIncludes / chatId, tried in file
// order, first unused or once:false line answers; delayMs on the injected Clock; usage default; error; no match →
// FAKE_AI_NO_MATCH and `{ "noMatch": true }`; every request appended to {DATA}\test\turns.jsonl), 08-4 §30.10 row fake
// (`match.attachments` count; turns.jsonl records attachments as { bytes, sha256 }, never the bytes), 08-0 §B.4 "Test AI".
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { ErrorKind } from '../../shared/types';
import type { AdapterDeps } from './deps';
import type {
  AiAdapter,
  AiErrorKind,
  AiUsage,
  Capabilities,
  DetectResult,
  RawAiError,
  TurnRequest,
  TurnResult,
  TurnSink,
  VerifyResult,
} from './types';
import { cancelledResult, failResult } from './cliCommon';
import { classifyError } from './classify';
import { verifyWith } from './verify';
import { approxTokens } from './models';

const usageSchema = z.object({
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  cacheRead: z.number().nullable(),
  cacheWrite: z.number().nullable(),
  costUsd: z.number().nullable(),
  planUsedPct: z.number().nullable().optional(),
});

export const fakeLineSchema = z.object({
  match: z.object({
    purpose: z.string(),
    promptIncludes: z.string().optional(),
    chatId: z.string().optional(),
    attachments: z.number().int().nonnegative().optional(),
  }),
  reply: z.string().default(''),
  usage: usageSchema.optional(),
  delayMs: z.number().nonnegative().optional(),
  error: z.string().optional(),
  once: z.boolean().optional(),
});
export type FakeLine = z.infer<typeof fakeLineSchema>;

export const FAKE_DEFAULT_USAGE: AiUsage = { tokensIn: 0, tokensOut: 0, cacheRead: null, cacheWrite: null, costUsd: null };

/** Parses the script; a bad line throws with its 1-based number (the test should fail loudly). */
export function parseFakeScript(text: string): (FakeLine | null)[] {
  return text.split(/\r?\n/).map((raw, i) => {
    if (raw.trim() === '') return null;
    try {
      return fakeLineSchema.parse(JSON.parse(raw));
    } catch (e) {
      throw new Error(`FOO_FAKE_AI line ${i + 1}: ${(e as Error).message}`, { cause: e });
    }
  });
}

/** 1-based index of the line that answers, or null. Marks `once` lines used. */
export function matchFakeLine(lines: (FakeLine | null)[], used: Set<number>, req: TurnRequest): number | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const m = l.match;
    if (m.purpose !== req.purpose) continue;
    if (m.promptIncludes !== undefined && !req.prompt.includes(m.promptIncludes)) continue;
    if (m.chatId !== undefined && m.chatId !== req.chatId) continue;
    if (m.attachments !== undefined && m.attachments !== (req.attachments?.length ?? 0)) continue;
    const once = l.once ?? true;
    if (once && used.has(i)) continue;
    if (once) used.add(i);
    return i + 1;
  }
  return null;
}

export class FakeAdapter implements AiAdapter {
  readonly id = 'fake' as const;
  /** No bill for the test provider; `local` is the ₹0 kind (implementation-notes M3). */
  readonly billing = 'local' as const;
  private lines: (FakeLine | null)[] | null = null;
  private readonly used = new Set<number>();
  private readonly turns = new Map<string, AbortController>();

  constructor(private readonly deps: AdapterDeps) {}

  async detect(): Promise<DetectResult> {
    return this.deps.env.FOO_FAKE_AI ? { found: true, state: 'ready' } : { found: false, state: 'not_installed' };
  }

  async probe(): Promise<Capabilities> {
    return {
      stdinPrompt: true,
      systemPromptFile: true,
      appendSystemPrompt: true,
      resume: false,
      disableTools: 'flag',
      jsonStream: true,
      modelFlag: false,
      vision: true, // scripted (08-4 §30.6): `match.attachments` decides
    };
  }

  verify(signal: AbortSignal): Promise<VerifyResult> {
    return verifyWith(this, this.deps, signal);
  }

  async runTurn(req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult> {
    const lines = await this.script();
    const matchedLine = matchFakeLine(lines, this.used, req);
    await this.record(req, matchedLine);
    if (matchedLine === null) return failResult('FAKE_AI_NO_MATCH');
    const line = lines[matchedLine - 1]!;

    const ctl = new AbortController();
    const onAbort = (): void => ctl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    this.turns.set(req.turnId, ctl);
    try {
      if (signal.aborted) return cancelledResult();
      if (line.delayMs) {
        const done = await new Promise<boolean>((resolve) => {
          const t = this.deps.clock.setTimeout(() => resolve(true), line.delayMs!);
          ctl.signal.addEventListener('abort', () => {
            this.deps.clock.clearTimeout(t);
            resolve(false);
          });
        });
        if (!done) return cancelledResult();
      }
      if (line.error) return failResult(line.error as ErrorKind as AiErrorKind);
      if (req.stream && line.reply) sink.onText(line.reply);
      return { text: line.reply, usage: line.usage ?? FAKE_DEFAULT_USAGE, stopReason: 'end' };
    } finally {
      signal.removeEventListener('abort', onAbort);
      this.turns.delete(req.turnId);
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.turns.get(turnId)?.abort();
  }

  estimate(req: TurnRequest): { tokensIn: number; tokensOutMax: number; costPaise: number | null } {
    return { tokensIn: approxTokens(req.system) + approxTokens(req.prompt), tokensOutMax: req.maxOutputTokens, costPaise: 0 };
  }

  classifyError(e: RawAiError): AiErrorKind {
    return classifyError(e, 'local');
  }

  private async script(): Promise<(FakeLine | null)[]> {
    if (this.lines) return this.lines;
    const p = this.deps.env.FOO_FAKE_AI;
    this.lines = p ? parseFakeScript(await this.deps.fs.readText(p)) : [];
    return this.lines;
  }

  private async record(req: TurnRequest, matchedLine: number | null): Promise<void> {
    const dir = path.join(this.deps.paths.DATA, 'test');
    await this.deps.fs.mkdirp(dir);
    const row: Record<string, unknown> = {
      turnId: req.turnId,
      purpose: req.purpose,
      system: req.system,
      prompt: req.prompt,
      matchedLine,
    };
    if (req.attachments?.length) {
      const atts: { bytes: number; sha256: string | null }[] = [];
      for (const a of req.attachments) {
        let sha256: string | null = null;
        try {
          sha256 = createHash('sha256')
            .update(await this.deps.fs.readFile(a.path))
            .digest('hex');
        } catch {
          /* unreadable: recorded as null */
        }
        atts.push({ bytes: a.bytes, sha256 });
      }
      row.attachments = atts;
    }
    if (matchedLine === null) row.noMatch = true;
    await this.deps.fs.appendText(path.join(dir, 'turns.jsonl'), JSON.stringify(row) + '\n');
  }
}

export function createFake(deps: AdapterDeps): FakeAdapter {
  return new FakeAdapter(deps);
}
