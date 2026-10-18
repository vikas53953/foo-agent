// Spec: 08-2 §11.4 (redaction pipeline: 1 registry scrub with normalised forms, longest first → [hidden]; registry in RAM
// only, ≤ 256 values, LRU; 2 pattern scrub, card numbers → "•••• {last4}"; choke points R3 `PromptBuilder.finalGate` and
// R10 AI output), 08-2 §7.2 (a registry hit at the final gate is a bug: the value is blanked, the turn proceeds and
// REDACTION_LATE_HIT is logged with the part number, not the value), 08-0 §G.6 (one Redactor module, src/shared/redactor.ts;
// registry:add / registry:remove mirrored from main). The patterns are the shared module's; this file adds the registry.
import type { Clock } from '../../shared/clock';
import { findSecrets } from '../../shared/redactor';

/** Tech-log writer injected by the engine (kind, small detail; never a secret value). */
export type LogFn = (kind: string, detail?: Record<string, string | number | boolean>) => void;

/** The replacement for registry and pattern hits (08-2 §11.4). */
export const HIDDEN = '[hidden]';

/** 08-0 §G.6 `registry:add { handle, hash, len, value, normalised, ttlMs }` as the engine keeps it. */
export interface RegistryEntry {
  handle: string;
  value: string;
  /** Extra forms matched as well (CR/LF stripped; card digits only and grouped 4-4-4-4). */
  normalised: string[];
  expiresAt: number | null;
  lastUsed: number;
}

/** 08-2 §11.4 item 1: the forms a value is also found under. */
export function normalisedForms(value: string): string[] {
  const forms = new Set<string>();
  const noBreaks = value.replace(/[\r\n]/g, '');
  forms.add(noBreaks);
  const digits = value.replace(/[ -]/g, '');
  if (/^\d{13,19}$/.test(digits)) {
    forms.add(digits);
    const groups = digits.match(/.{1,4}/g) ?? [];
    forms.add(groups.join(' '));
    forms.add(groups.join('-'));
  }
  forms.delete(value);
  forms.delete('');
  return [...forms];
}

/**
 * Secret values used this app run (vault values, typed codes, CVVs, pasted secrets). RAM only, never persisted, at most 256
 * entries with least-recently-used eviction; an entry with a TTL disappears once it expires.
 */
export class SecretRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  constructor(
    private readonly clock: Clock,
    private readonly maxValues = 256,
  ) {}

  /** Adds (or refreshes) a handle. `normalised` defaults to {@link normalisedForms}. */
  add(e: { handle: string; value: string; normalised?: string[]; ttlMs?: number | null }): void {
    if (!e.value) return;
    const now = this.clock.now();
    this.entries.delete(e.handle);
    this.entries.set(e.handle, {
      handle: e.handle,
      value: e.value,
      normalised: e.normalised ?? normalisedForms(e.value),
      expiresAt: e.ttlMs == null ? null : now + e.ttlMs,
      lastUsed: now,
    });
    while (this.entries.size > this.maxValues) {
      let oldest: RegistryEntry | undefined;
      for (const x of this.entries.values()) if (!oldest || x.lastUsed < oldest.lastUsed) oldest = x;
      if (!oldest) break;
      this.entries.delete(oldest.handle);
    }
  }

  /** `registry:remove { handles }`. */
  remove(handles: readonly string[]): void {
    for (const h of handles) this.entries.delete(h);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    this.purge();
    return this.entries.size;
  }

  /** Every live form with its handle, longest first. */
  forms(): { handle: string; form: string }[] {
    this.purge();
    const out: { handle: string; form: string }[] = [];
    for (const e of this.entries.values()) for (const f of [e.value, ...e.normalised]) out.push({ handle: e.handle, form: f });
    return out.sort((a, b) => b.form.length - a.form.length);
  }

  /** Marks a handle used (LRU). */
  touch(handle: string): void {
    const e = this.entries.get(handle);
    if (e) e.lastUsed = this.clock.now();
  }

  private purge(): void {
    const now = this.clock.now();
    for (const [h, e] of this.entries) if (e.expiresAt !== null && e.expiresAt <= now) this.entries.delete(h);
  }
}

/** 08-2 §11.4 item 2 rows beyond the paste catcher's: `Bearer …`, secret URL query params, URL userinfo, OTP near its word. */
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gu;
const URL_PARAM = /[?&](?:token|key|code|sig|signature|password|pwd|secret|auth)=([^&#\s]+)/giu;
const URL_USERINFO = /\b[a-z][a-z0-9+.-]*:\/\/([^\s/@:]+(?::[^\s/@]*)?)@/giu;
// The words confirmation, booking, reference, order, PNR, ticket, receipt and a bare "code" do not trigger (§11.4).
const OTP_WORD = /(?:\b(?:otp|one[- ]?time|verification code|security code|passcode)\b|पासकोड|ओटीपी|ਓਟੀਪੀ)/giu;
const CODE_NEAR = /(?<!\d)\d{4,8}(?!\d)/gu;

export function extraSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const m of text.matchAll(BEARER)) out.push({ start: m.index, end: m.index + m[0].length });
  for (const re of [URL_PARAM, URL_USERINFO])
    for (const m of text.matchAll(re)) {
      const v = m[1]!;
      const start = m.index + m[0].indexOf(v);
      out.push({ start, end: start + v.length });
    }
  for (const w of text.matchAll(OTP_WORD)) {
    const from = Math.max(0, w.index - 40);
    const to = Math.min(text.length, w.index + w[0].length + 40);
    for (const m of text.slice(from, to).matchAll(CODE_NEAR)) out.push({ start: from + m.index, end: from + m.index + m[0].length });
  }
  return out;
}

/** The engine's Redactor: registry scrub, then the patterns (08-2 §11.4 steps 1–2). */
export class Redactor {
  readonly registry: SecretRegistry;
  private readonly log: LogFn;

  constructor(deps: { clock: Clock; log: LogFn; maxValues?: number }) {
    this.registry = new SecretRegistry(deps.clock, deps.maxValues);
    this.log = deps.log;
  }

  /** Replaces every registry form found in `text`, longest first, with `replacement`; returns the handles hit. */
  private registryScrub(text: string, replacement: string): { text: string; handles: string[] } {
    let out = text;
    const handles = new Set<string>();
    for (const { handle, form } of this.registry.forms()) {
      if (!out.includes(form)) continue;
      out = out.split(form).join(replacement);
      handles.add(handle);
      this.registry.touch(handle);
    }
    return { text: out, handles: [...handles] };
  }

  /**
   * Pattern scrub: the shared module's patterns plus the §11.4 rows the paste catcher does not have ({@link extraSpans}).
   * Card numbers → "•••• {last4}", every other hit → [hidden]. Overlapping spans are merged.
   */
  private patternScrub(text: string): { text: string; hits: number } {
    const spans = [
      ...findSecrets(text).map((h) => ({ start: h.start, end: h.end, card: h.pattern === 'P12' })),
      ...extraSpans(text).map((x) => ({ ...x, card: false })),
    ].sort((x, y) => x.start - y.start || y.end - x.end);
    const merged: { start: number; end: number; card: boolean }[] = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp.start < last.end) {
        last.end = Math.max(last.end, sp.end);
        last.card = last.card && sp.card;
      } else merged.push({ ...sp });
    }
    let out = text;
    for (const h of [...merged].reverse()) {
      const span = out.slice(h.start, h.end);
      const rep = h.card ? `•••• ${span.replace(/\D/g, '').slice(-4)}` : HIDDEN;
      out = out.slice(0, h.start) + rep + out.slice(h.end);
    }
    return { text: out, hits: merged.length };
  }

  /** 08-2 §11.4 steps 1–2 over any text (R10: AI output before display). */
  scrub(text: string): { text: string; hits: number } {
    const r = this.registryScrub(text, HIDDEN);
    const p = this.patternScrub(r.text);
    return { text: p.text, hits: r.handles.length + p.hits };
  }

  /**
   * R3, 08-2 §7.2: the last pass over an assembled AI input. A registry hit here is a bug: the value is blanked (removed), the
   * turn proceeds, and `REDACTION_LATE_HIT` is logged with the part number (never the value). Pattern hits are then scrubbed
   * as in {@link scrub} (they are expected: stored text was scrubbed on write, tool results may carry key-like strings).
   */
  finalGate(text: string, part?: number | string): string {
    const r = this.registryScrub(text, '');
    if (r.handles.length) this.log('REDACTION_LATE_HIT', { part: part === undefined ? 'unknown' : String(part), hits: r.handles.length });
    return this.patternScrub(r.text).text;
  }
}
