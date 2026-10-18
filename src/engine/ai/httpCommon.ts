// Spec: 08-4 §30.3 (key-mode calls: stream SSE, common HTTP rules 401/403 → AI_KEY_INVALID, 429 → AI_LIMIT with
// retry-after → resetAt, 5xx/529 → AI_SERVICE_DOWN, body > 1 MB → PROTOCOL_INVALID), §30.7 (timeout: abort, no late
// text), §30.10 (images before the prompt, base64 PNG, Σ bytes ≤ 20 MB else PROTOCOL_INVALID before sending),
// 08-2 §6.3.1 (key only in the request header, never logged), §6.4 (only terminal envelopes count for usage).
import type { ProviderId } from '../../shared/types';
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
import { LineReader } from './ProcessHost';
import type { StreamParser } from './parsers';
import { classifyError, parseRetryAfter, resetAtFor, type Billing } from './classify';
import { cancelledResult, failResult, linkedController } from './cliCommon';
import { approxTokens, paramsFor, priceOf, resolveModel } from './models';
import { verifyWith } from './verify';

export const MAX_BODY_BYTES = 1_000_000;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface HttpCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  parser: StreamParser;
}

export interface PreparedImage {
  b64: string;
}

/** Reads the prepared PNGs (08-0 §G.18); null when the sum is over 20 MB (a preparation bug). */
export async function loadImages(req: TurnRequest, deps: Pick<AdapterDeps, 'fs'>): Promise<PreparedImage[] | null> {
  const list = req.attachments ?? [];
  if (list.reduce((s, a) => s + a.bytes, 0) > MAX_ATTACHMENT_BYTES) return null;
  const out: PreparedImage[] = [];
  for (const a of list) out.push({ b64: (await deps.fs.readFile(a.path)).toString('base64') });
  return out;
}

function errCode(e: unknown): string | undefined {
  const c = (e as { cause?: { code?: unknown }; code?: unknown } | undefined) ?? {};
  const code = (c.cause as { code?: unknown } | undefined)?.code ?? c.code;
  return typeof code === 'string' ? code : undefined;
}

export interface HttpRunOptions {
  providerId: ProviderId;
  billing: Billing;
  /** Override for one provider (Ollama: a refused localhost connection is "not answering", not offline). */
  classify?: (raw: RawAiError) => AiErrorKind;
}

/** One HTTP turn: POST, stream lines into the parser, map the outcome to a TurnResult. */
export async function runHttpTurn(
  deps: AdapterDeps,
  opts: HttpRunOptions,
  call: HttpCall,
  req: TurnRequest,
  sink: TurnSink,
  signal: AbortSignal,
): Promise<TurnResult> {
  const ctl = new AbortController();
  let timedOut = false;
  let tooBig = false;
  let body: ReadableStreamDefaultReader<Uint8Array> | undefined;
  // Abort the request and the body read (a body that ignores the signal must not keep the turn alive).
  const stopAll = (): void => {
    ctl.abort();
    body?.cancel().catch(() => undefined);
  };
  const onAbort = (): void => stopAll();
  if (signal.aborted) return cancelledResult();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = deps.clock.setTimeout(() => {
    timedOut = true;
    stopAll();
  }, req.timeoutMs);
  const classify = (raw: RawAiError): AiErrorKind => (opts.classify ?? ((r) => classifyError(r, opts.billing)))(raw);
  const stopped = (): boolean => timedOut || signal.aborted || tooBig;
  const finishAbort = (): TurnResult | null => {
    if (tooBig) return failResult('PROTOCOL_INVALID');
    if (timedOut) return failResult('AI_TIMEOUT');
    if (signal.aborted) return cancelledResult();
    return null;
  };

  try {
    let res: Response;
    try {
      res = await deps.fetch(call.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...call.headers },
        body: JSON.stringify(call.body),
        signal: ctl.signal,
      });
    } catch (e) {
      const a = finishAbort();
      if (a) return a;
      const raw: RawAiError = { providerId: opts.providerId, message: 'fetch failed' };
      const code = errCode(e);
      if (code) raw.code = code;
      if (deps.isOnline) raw.online = deps.isOnline();
      return failResult(classify(raw));
    }

    if (!res.ok) {
      let text = '';
      try {
        text = (await res.text()).slice(0, 4000);
      } catch {
        /* body unreadable */
      }
      const raw: RawAiError = { providerId: opts.providerId, http: res.status, message: text.slice(0, 200) };
      const ra = parseRetryAfter(res.headers.get('retry-after'));
      if (ra !== undefined) raw.retryAfterSec = ra;
      const kind = classify(raw);
      return failResult(kind, kind === 'AI_LIMIT' ? resetAtFor(raw, deps.clock.now(), deps.timeZone) : undefined);
    }

    const reader = new LineReader((line) => {
      if (stopped()) return;
      for (const ev of call.parser.push(line)) if (ev.type === 'text' && req.stream && !stopped()) sink.onText(ev.delta);
    });
    let bytes = 0;
    try {
      if (res.body) {
        const r = res.body.getReader();
        body = r;
        for (;;) {
          if (stopped()) break;
          const { done, value } = await r.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BODY_BYTES) {
            tooBig = true;
            ctl.abort();
            await r.cancel().catch(() => undefined);
            break;
          }
          reader.push(Buffer.from(value));
        }
      }
      if (!stopped()) {
        reader.end();
        reader.push('\n'); // dispatch a final SSE event without a trailing blank line
      }
    } catch {
      const a = finishAbort();
      if (a) return a;
      return failResult(classify({ providerId: opts.providerId, message: 'stream interrupted', code: 'ECONNRESET' }));
    }
    const a = finishAbort();
    if (a) return a;

    const parsed = call.parser.result();
    if (parsed.violation) return failResult('AI_PROTOCOL_VIOLATION');
    if (parsed.stopReason === 'end' || parsed.stopReason === 'max_tokens') {
      const out: TurnResult = { text: parsed.text, usage: parsed.usage, stopReason: parsed.stopReason };
      if (parsed.modelReported) out.modelReported = parsed.modelReported;
      return out;
    }
    if (parsed.incompatible) return failResult('PROTOCOL_INVALID');
    if (parsed.stopReason === null) return failResult('UNKNOWN'); // stream ended without its terminal event
    const raw: RawAiError = { providerId: opts.providerId, message: parsed.errorText ?? 'error' };
    const kind = parsed.errorKind ?? classify(raw);
    return failResult(kind, kind === 'AI_LIMIT' ? resetAtFor(raw, deps.clock.now(), deps.timeZone) : undefined);
  } finally {
    deps.clock.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

// ------------------------------------------------------------------------------------------------ the adapter shell

export interface HttpProviderSpec {
  id: ProviderId;
  billing: Billing;
  /** Model for this turn; undefined → the turn cannot be sent. */
  model(req: TurnRequest): string | undefined;
  /** Whether `model` accepts image parts (08-4 §30.6). */
  vision(model: string): Promise<boolean>;
  /** Null key = keyless (LM Studio, Ollama). */
  needsKey: boolean;
  build(req: TurnRequest, model: string, key: string | null, images: PreparedImage[]): HttpCall;
  detect(): Promise<DetectResult>;
  costPaise(req: TurnRequest, model: string | undefined, tokensIn: number): number | null;
  classify?: (raw: RawAiError) => AiErrorKind;
}

export class HttpAdapter implements AiAdapter {
  private readonly turns = new Map<string, AbortController>();
  constructor(
    private readonly spec: HttpProviderSpec,
    private readonly deps: AdapterDeps,
  ) {}

  get id(): ProviderId {
    return this.spec.id;
  }
  get billing(): Billing {
    return this.spec.billing;
  }

  detect(): Promise<DetectResult> {
    return this.spec.detect();
  }

  async probe(): Promise<Capabilities> {
    const m = this.spec.model({ purpose: 'verify' } as TurnRequest);
    return {
      stdinPrompt: false,
      systemPromptFile: false,
      appendSystemPrompt: false,
      resume: false,
      disableTools: 'none', // no tools are ever passed (08-2 §6.3)
      jsonStream: true,
      modelFlag: true,
      vision: m ? await this.spec.vision(m) : false,
    };
  }

  verify(signal: AbortSignal): Promise<VerifyResult> {
    return verifyWith(this, this.deps, signal);
  }

  async runTurn(req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult> {
    const model = this.spec.model(req);
    if (!model) return failResult('UNKNOWN');
    if (req.attachments?.length && !(await this.spec.vision(model))) return failResult('AI_NO_VISION');
    const images = await loadImages(req, this.deps).catch(() => null);
    if (images === null) return failResult('PROTOCOL_INVALID');
    let key: string | null = null;
    if (this.spec.needsKey) {
      key = await this.deps.getKey(this.spec.id).catch(() => null);
      if (!key) return failResult('AI_KEY_INVALID');
    }
    const { ctl, unlink } = linkedController(signal);
    this.turns.set(req.turnId, ctl);
    try {
      const opts: HttpRunOptions = { providerId: this.spec.id, billing: this.spec.billing };
      if (this.spec.classify) opts.classify = this.spec.classify;
      return await runHttpTurn(this.deps, opts, this.spec.build(req, model, key, images), req, sink, ctl.signal);
    } finally {
      unlink();
      this.turns.delete(req.turnId);
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.turns.get(turnId)?.abort();
  }

  estimate(req: TurnRequest): { tokensIn: number; tokensOutMax: number; costPaise: number | null } {
    const tokensIn = approxTokens(req.system) + approxTokens(req.prompt);
    return { tokensIn, tokensOutMax: req.maxOutputTokens, costPaise: this.spec.costPaise(req, this.spec.model(req), tokensIn) };
  }

  classifyError(e: RawAiError): AiErrorKind {
    return this.spec.classify ? this.spec.classify(e) : classifyError(e, this.spec.billing);
  }
}

/** Key-provider price of a turn in paise, rounded up (08-4 §30.2); null when the model has no price row. */
export function keyCostPaise(
  deps: Pick<AdapterDeps, 'pricing'>,
  id: ProviderId,
  model: string | undefined,
  tokensIn: number,
  tokensOutMax: number,
): number | null {
  const p = priceOf(deps.pricing, id, model);
  if (!p) return null;
  const usd = (tokensIn * p.inPerMTokUsd + tokensOutMax * p.outPerMTokUsd) / 1_000_000;
  return Math.ceil(usd * deps.pricing.usdToInr * 100);
}

/** 08-4 §30.1: req.model → settings → pricing default (cheap tier per purpose). */
export function keyModel(deps: Pick<AdapterDeps, 'pricing' | 'providerSettings'>, id: ProviderId, req: TurnRequest): string | undefined {
  if (req.model) return req.model;
  return resolveModel(id, paramsFor(req.purpose).tier, deps.pricing, deps.providerSettings?.(id));
}
