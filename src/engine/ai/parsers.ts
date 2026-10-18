// Spec: 08-2 §6.4 (stream parsing per adapter: text deltas, final/usage, session id, failure envelope; only terminal
// envelopes count for usage, a missing metric is null), §6.5 (a tool/command in a CLI turn is AI_PROTOCOL_VIOLATION),
// §6.7 (unparseable stream after 3 lines → AI_CLI_INCOMPATIBLE), 08-4 §30.3 (key-mode SSE: OpenAI Responses,
// Anthropic Messages, Google streamGenerateContent), §30.4 (plain text mode). Pure functions over lines, fixture-tested.
import type { AiErrorKind, AiUsage } from './types';

export const NULL_USAGE: AiUsage = { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null };

export type ParserEvent =
  | { type: 'text'; delta: string }
  | { type: 'session'; id: string }
  | { type: 'violation'; what: string }
  | { type: 'error'; message: string };

export interface ParsedTurn {
  text: string;
  sessionId?: string;
  usage: AiUsage;
  modelReported?: string;
  /** null = no terminal envelope was seen. */
  stopReason: 'end' | 'max_tokens' | 'error' | null;
  errorText?: string;
  /** A kind the envelope itself names (e.g. Anthropic `overloaded_error`). */
  errorKind?: AiErrorKind;
  violation?: string;
  /** 3 unparseable lines before any parsed one (08-2 §6.7). */
  incompatible: boolean;
}

export interface StreamParser {
  push(line: string): ParserEvent[];
  result(): ParsedTurn;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);

/** JSON-lines bookkeeping shared by every JSON parser. */
class JsonLines {
  bad = 0;
  good = 0;
  parse(line: string): Obj | undefined {
    const t = line.trim();
    if (t === '') return undefined;
    try {
      const v = obj(JSON.parse(t));
      if (v) {
        this.good++;
        return v;
      }
    } catch {
      /* counted below */
    }
    if (this.good === 0) this.bad++;
    return undefined;
  }
  get incompatible(): boolean {
    return this.good === 0 && this.bad >= 3;
  }
}

// ------------------------------------------------------------------------------------------------ claude-cli

/** claude -p --output-format stream-json --verbose [--include-partial-messages] (08-2 §6.4 row claude-cli). */
export function createClaudeParser(): StreamParser {
  const j = new JsonLines();
  let deltaText = '';
  let assistantText = '';
  let finalText: string | undefined;
  let sawDeltas = false;
  let sessionId: string | undefined;
  let model: string | undefined;
  let usage: AiUsage = NULL_USAGE;
  let stop: ParsedTurn['stopReason'] = null;
  let maxTokens = false;
  let errorText: string | undefined;
  let violation: string | undefined;

  return {
    push(line) {
      const ev: ParserEvent[] = [];
      const o = j.parse(line);
      if (!o) return ev;
      const sid = str(o.session_id);
      if (sid && sid !== sessionId) {
        sessionId = sid;
        ev.push({ type: 'session', id: sid });
      }
      switch (o.type) {
        case 'system':
          model = str(o.model) ?? model;
          break;
        case 'stream_event': {
          const e = obj(o.event);
          if (e?.type === 'content_block_delta') {
            const d = obj(e.delta);
            if (d?.type === 'text_delta' && typeof d.text === 'string') {
              sawDeltas = true;
              deltaText += d.text;
              ev.push({ type: 'text', delta: d.text });
            }
          } else if (e?.type === 'content_block_start') {
            const b = obj(e.content_block);
            if (b?.type === 'tool_use' || b?.type === 'server_tool_use') violation ??= `tool_use:${str(b.name) ?? ''}`;
          } else if (e?.type === 'message_delta') {
            if (obj(e.delta)?.stop_reason === 'max_tokens') maxTokens = true;
          }
          break;
        }
        case 'assistant': {
          const m = obj(o.message);
          model = str(m?.model) ?? model;
          if (m?.stop_reason === 'max_tokens') maxTokens = true;
          const content = Array.isArray(m?.content) ? (m.content as unknown[]) : [];
          let t = '';
          for (const c of content) {
            const b = obj(c);
            if (b?.type === 'text' && typeof b.text === 'string') t += b.text;
            if (b?.type === 'tool_use' || b?.type === 'server_tool_use') violation ??= `tool_use:${str(b.name) ?? ''}`;
          }
          if (t) {
            assistantText += t;
            if (!sawDeltas) ev.push({ type: 'text', delta: t });
          }
          break;
        }
        case 'result': {
          const u = obj(o.usage);
          usage = {
            tokensIn: num(u?.input_tokens),
            tokensOut: num(u?.output_tokens),
            cacheRead: num(u?.cache_read_input_tokens),
            cacheWrite: num(u?.cache_creation_input_tokens),
            costUsd: num(o.total_cost_usd),
          };
          if (o.is_error === true) {
            stop = 'error';
            errorText = str(o.result) ?? str(o.error) ?? str(o.subtype) ?? 'error';
            ev.push({ type: 'error', message: errorText });
          } else {
            finalText = str(o.result);
            stop = maxTokens || o.stop_reason === 'max_tokens' ? 'max_tokens' : 'end';
          }
          break;
        }
      }
      return ev;
    },
    result() {
      const r: ParsedTurn = {
        text: finalText ?? (sawDeltas ? deltaText : assistantText),
        usage,
        stopReason: stop,
        incompatible: j.incompatible,
      };
      if (sessionId) r.sessionId = sessionId;
      if (model) r.modelReported = model;
      if (errorText) r.errorText = errorText;
      if (violation) r.violation = violation;
      return r;
    },
  };
}

// ------------------------------------------------------------------------------------------------ codex-cli

/** Items that mean the CLI acted on its own (08-2 §6.3: `command_execution`; file/MCP items treated the same). */
const CODEX_VIOLATIONS = new Set(['command_execution', 'file_change', 'mcp_tool_call']);

/** codex exec --json (08-2 §6.4 row codex-cli; agent_message text by prefix-diff). */
export function createCodexParser(): StreamParser {
  const j = new JsonLines();
  const items = new Map<string, string>();
  const order: string[] = [];
  let sessionId: string | undefined;
  let usage: AiUsage = NULL_USAGE;
  let stop: ParsedTurn['stopReason'] = null;
  let errorText: string | undefined;
  let violation: string | undefined;

  return {
    push(line) {
      const ev: ParserEvent[] = [];
      const o = j.parse(line);
      if (!o) return ev;
      switch (o.type) {
        case 'thread.started': {
          const id = str(o.thread_id);
          if (id) {
            sessionId = id;
            ev.push({ type: 'session', id });
          }
          break;
        }
        case 'item.started':
        case 'item.updated':
        case 'item.completed': {
          const it = obj(o.item);
          const type = str(it?.type) ?? str(it?.item_type);
          if (type && CODEX_VIOLATIONS.has(type)) {
            violation ??= type;
            ev.push({ type: 'violation', what: type });
            break;
          }
          if (type === 'agent_message' && typeof it?.text === 'string') {
            const id = str(it.id) ?? `#${order.length}`;
            const prev = items.get(id);
            if (prev === undefined) order.push(id);
            const next = it.text;
            items.set(id, next);
            const base = prev ?? '';
            if (next.startsWith(base) && next.length > base.length) {
              const sep = prev === undefined && order.length > 1 ? '\n' : '';
              ev.push({ type: 'text', delta: sep + next.slice(base.length) });
            }
          }
          break;
        }
        case 'turn.completed': {
          const u = obj(o.usage);
          usage = {
            tokensIn: num(u?.input_tokens),
            tokensOut: num(u?.output_tokens),
            cacheRead: num(u?.cached_input_tokens),
            cacheWrite: null,
            costUsd: null,
          };
          stop = 'end';
          break;
        }
        case 'turn.failed':
          stop = 'error';
          errorText = str(obj(o.error)?.message) ?? 'turn.failed';
          ev.push({ type: 'error', message: errorText });
          break;
        case 'error':
          stop = 'error';
          errorText = str(o.message) ?? str(obj(o.error)?.message) ?? 'error';
          ev.push({ type: 'error', message: errorText });
          break;
      }
      return ev;
    },
    result() {
      const r: ParsedTurn = {
        text: order.map((id) => items.get(id) ?? '').join('\n'),
        usage,
        stopReason: stop,
        incompatible: j.incompatible,
      };
      if (sessionId) r.sessionId = sessionId;
      if (errorText) r.errorText = errorText;
      if (violation) r.violation = violation;
      return r;
    },
  };
}

// ------------------------------------------------------------------------------------------------ gemini-cli

/** gemini --output-format stream-json (08-2 §6.4 row gemini-cli; `tool_use` → violation like Codex). */
export function createGeminiJsonParser(): StreamParser {
  const j = new JsonLines();
  let text = '';
  let usage: AiUsage = NULL_USAGE;
  let model: string | undefined;
  let stop: ParsedTurn['stopReason'] = null;
  let errorText: string | undefined;
  let violation: string | undefined;

  return {
    push(line) {
      const ev: ParserEvent[] = [];
      const o = j.parse(line);
      if (!o) return ev;
      switch (o.type) {
        case 'init':
          model = str(o.model) ?? model;
          break;
        case 'message':
          if (o.role === 'assistant' && typeof o.content === 'string') {
            text += o.content;
            ev.push({ type: 'text', delta: o.content });
          }
          break;
        case 'tool_use':
        case 'tool_call':
          violation ??= `tool_use:${str(o.tool_name) ?? str(o.name) ?? ''}`;
          ev.push({ type: 'violation', what: violation });
          break;
        case 'error':
          errorText = str(o.message) ?? str(obj(o.error)?.message) ?? 'error';
          if (o.severity !== 'warning') stop = 'error';
          ev.push({ type: 'error', message: errorText });
          break;
        case 'result': {
          const s = obj(o.stats);
          if (s) {
            usage = {
              tokensIn: num(s.input_tokens),
              tokensOut: num(s.output_tokens),
              cacheRead: num(s.cached),
              cacheWrite: null,
              costUsd: null,
            };
          }
          if (o.status === 'error') {
            stop = 'error';
            errorText ??= str(obj(o.error)?.message) ?? 'error';
          } else if (stop !== 'error') stop = 'end';
          break;
        }
      }
      return ev;
    },
    result() {
      const r: ParsedTurn = { text, usage, stopReason: stop, incompatible: j.incompatible };
      if (model) r.modelReported = model;
      if (errorText) r.errorText = errorText;
      if (violation) r.violation = violation;
      return r;
    },
  };
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
export const stripAnsi = (s: string): string => s.replace(ANSI, '');

/** Plain text mode (08-4 §30.4 / gemini text mode): every stdout line, ANSI stripped; usage NULL; ends at exit. */
export function createPlainTextParser(): StreamParser {
  const lines: string[] = [];
  return {
    push(line) {
      const l = stripAnsi(line);
      const delta = (lines.length > 0 ? '\n' : '') + l;
      lines.push(l);
      return [{ type: 'text', delta }];
    },
    result() {
      return { text: lines.join('\n').trim(), usage: NULL_USAGE, stopReason: 'end', incompatible: false };
    },
  };
}

// ------------------------------------------------------------------------------------------------ ollama

/** POST /api/chat NDJSON (08-2 §6.4 row ollama). */
export function createOllamaParser(): StreamParser {
  const j = new JsonLines();
  let text = '';
  let usage: AiUsage = NULL_USAGE;
  let model: string | undefined;
  let stop: ParsedTurn['stopReason'] = null;
  let errorText: string | undefined;
  let violation: string | undefined;
  return {
    push(line) {
      const ev: ParserEvent[] = [];
      const o = j.parse(line);
      if (!o) return ev;
      if (typeof o.error === 'string') {
        stop = 'error';
        errorText = o.error;
        ev.push({ type: 'error', message: o.error });
        return ev;
      }
      model = str(o.model) ?? model;
      const m = obj(o.message);
      if (Array.isArray(m?.tool_calls) && m.tool_calls.length > 0) violation ??= 'tool_calls';
      const c = str(m?.content);
      if (c) {
        text += c;
        ev.push({ type: 'text', delta: c });
      }
      if (o.done === true) {
        usage = { tokensIn: num(o.prompt_eval_count), tokensOut: num(o.eval_count), cacheRead: null, cacheWrite: null, costUsd: null };
        stop = o.done_reason === 'length' ? 'max_tokens' : 'end';
      }
      return ev;
    },
    result() {
      const r: ParsedTurn = { text, usage, stopReason: stop, incompatible: j.incompatible };
      if (model) r.modelReported = model;
      if (errorText) r.errorText = errorText;
      if (violation) r.violation = violation;
      return r;
    },
  };
}

// ------------------------------------------------------------------------------------------------ SSE

export interface SseEvent {
  event?: string;
  data: string;
}

/** text/event-stream framing: `event:` / `data:` lines, blank line dispatches, `:` comments. */
export class SseReader {
  private event: string | undefined;
  private data: string[] = [];
  constructor(private readonly onEvent: (e: SseEvent) => void) {}
  line(raw: string): void {
    const line = raw.replace(/\r$/, '');
    if (line === '') return this.flush();
    if (line.startsWith(':')) return;
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
  }
  flush(): void {
    if (this.data.length > 0) {
      const e: SseEvent = { data: this.data.join('\n') };
      if (this.event !== undefined) e.event = this.event;
      this.onEvent(e);
    }
    this.event = undefined;
    this.data = [];
  }
}

/** Wraps a per-event JSON handler as a line parser. */
function sseParser(
  onJson: (type: string | undefined, o: Obj, ev: ParserEvent[]) => void,
  result: () => Omit<ParsedTurn, 'incompatible'>,
): StreamParser {
  const j = new JsonLines();
  let out: ParserEvent[] = [];
  const reader = new SseReader((e) => {
    if (e.data === '[DONE]') return;
    const o = j.parse(e.data);
    if (o) onJson(str(o.type) ?? e.event, o, out);
  });
  return {
    push(line) {
      out = [];
      reader.line(line);
      return out;
    },
    result() {
      reader.flush();
      return { ...result(), incompatible: j.incompatible };
    },
  };
}

/** OpenAI Responses API stream (08-4 §30.3 row openai-key; LM Studio through the same path). */
export function createOpenAiParser(): StreamParser {
  let text = '';
  let usage: AiUsage = NULL_USAGE;
  let model: string | undefined;
  let stop: ParsedTurn['stopReason'] = null;
  let errorText: string | undefined;
  return sseParser(
    (type, o, ev) => {
      if (type === 'response.output_text.delta' && typeof o.delta === 'string') {
        text += o.delta;
        ev.push({ type: 'text', delta: o.delta });
      } else if (type === 'response.completed' || type === 'response.incomplete') {
        const r = obj(o.response);
        model = str(r?.model) ?? model;
        const u = obj(r?.usage);
        usage = {
          tokensIn: num(u?.input_tokens),
          tokensOut: num(u?.output_tokens),
          cacheRead: num(obj(u?.input_tokens_details)?.cached_tokens),
          cacheWrite: null,
          costUsd: null,
        };
        stop = obj(r?.incomplete_details)?.reason === 'max_output_tokens' ? 'max_tokens' : 'end';
      } else if (type === 'error' || type === 'response.failed') {
        stop = 'error';
        errorText = str(o.message) ?? str(obj(obj(o.response)?.error)?.message) ?? str(obj(o.error)?.message) ?? 'error';
        ev.push({ type: 'error', message: errorText });
      }
    },
    () => {
      const r: Omit<ParsedTurn, 'incompatible'> = { text, usage, stopReason: stop };
      if (model) r.modelReported = model;
      if (errorText) r.errorText = errorText;
      return r;
    },
  );
}

const ANTHROPIC_ERROR_KIND: Record<string, AiErrorKind> = {
  overloaded_error: 'AI_SERVICE_DOWN',
  api_error: 'AI_SERVICE_DOWN',
  rate_limit_error: 'AI_LIMIT',
  authentication_error: 'AI_KEY_INVALID',
  permission_error: 'AI_KEY_INVALID',
};

/** Anthropic Messages API stream (08-4 §30.3 row anthropic-key). */
export function createAnthropicParser(): StreamParser {
  let text = '';
  let tokensIn: number | null = null;
  let cacheRead: number | null = null;
  let cacheWrite: number | null = null;
  let tokensOut: number | null = null;
  let model: string | undefined;
  let stop: ParsedTurn['stopReason'] = null;
  let errorText: string | undefined;
  let errorKind: AiErrorKind | undefined;
  let violation: string | undefined;
  return sseParser(
    (type, o, ev) => {
      if (type === 'message_start') {
        const m = obj(o.message);
        model = str(m?.model) ?? model;
        const u = obj(m?.usage);
        tokensIn = num(u?.input_tokens);
        cacheRead = num(u?.cache_read_input_tokens);
        cacheWrite = num(u?.cache_creation_input_tokens);
      } else if (type === 'content_block_start') {
        const b = obj(o.content_block);
        if (b?.type === 'tool_use') violation ??= 'tool_use';
      } else if (type === 'content_block_delta') {
        const d = obj(o.delta);
        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          text += d.text;
          ev.push({ type: 'text', delta: d.text });
        }
      } else if (type === 'message_delta') {
        tokensOut = num(obj(o.usage)?.output_tokens);
        const r = obj(o.delta)?.stop_reason;
        stop = r === 'max_tokens' ? 'max_tokens' : r === 'end_turn' || r === 'stop_sequence' ? 'end' : 'error';
      } else if (type === 'error') {
        const e = obj(o.error);
        stop = 'error';
        errorText = str(e?.message) ?? 'error';
        const k = ANTHROPIC_ERROR_KIND[str(e?.type) ?? ''];
        if (k) errorKind = k;
        ev.push({ type: 'error', message: errorText });
      }
    },
    () => {
      // Only a finished message counts: message_delta is the terminal envelope (08-2 §6.4 usage rule).
      const done = stop === 'end' || stop === 'max_tokens';
      const r: Omit<ParsedTurn, 'incompatible'> = {
        text,
        usage: done ? { tokensIn, tokensOut, cacheRead, cacheWrite, costUsd: null } : NULL_USAGE,
        stopReason: stop,
      };
      if (model) r.modelReported = model;
      if (errorText) r.errorText = errorText;
      if (errorKind) r.errorKind = errorKind;
      if (violation) r.violation = violation;
      return r;
    },
  );
}

/** Google streamGenerateContent?alt=sse (08-4 §30.3 row google-key). */
export function createGoogleParser(): StreamParser {
  let text = '';
  let usage: AiUsage = NULL_USAGE;
  let model: string | undefined;
  let stop: ParsedTurn['stopReason'] = null;
  let errorText: string | undefined;
  let violation: string | undefined;
  return sseParser(
    (_type, o, ev) => {
      const err = obj(o.error);
      if (err) {
        stop = 'error';
        errorText = str(err.message) ?? 'error';
        ev.push({ type: 'error', message: errorText });
        return;
      }
      model = str(o.modelVersion) ?? model;
      const cand = Array.isArray(o.candidates) ? obj(o.candidates[0]) : undefined;
      const parts = obj(cand?.content)?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          const po = obj(p);
          if (typeof po?.text === 'string' && po.thought !== true) {
            text += po.text;
            ev.push({ type: 'text', delta: po.text });
          }
          if (po?.functionCall) violation ??= 'functionCall';
        }
      }
      const fr = str(cand?.finishReason);
      if (fr) {
        stop = fr === 'STOP' ? 'end' : fr === 'MAX_TOKENS' ? 'max_tokens' : 'error';
        if (stop === 'error') errorText = `finishReason ${fr}`;
        const u = obj(o.usageMetadata);
        if (u)
          usage = {
            tokensIn: num(u.promptTokenCount),
            tokensOut: num(u.candidatesTokenCount),
            cacheRead: num(u.cachedContentTokenCount),
            cacheWrite: null,
            costUsd: null,
          };
      }
    },
    () => {
      const r: Omit<ParsedTurn, 'incompatible'> = { text, usage, stopReason: stop };
      if (model) r.modelReported = model;
      if (errorText) r.errorText = errorText;
      if (violation) r.violation = violation;
      return r;
    },
  );
}
