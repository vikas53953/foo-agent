// Spec: 04-2 §22.4 (paste catcher, C8, Article 8: patterns P1–P17 as JavaScript regexes with the `u` flag, `(?i)` rows with
// `i`; text checked after NFKC with zero-width characters removed; P12 needs 13–19 digits, a first digit 2–6 and Luhn; P16
// only when foo, a helper or a card in this chat asked for a code in the last 10 minutes; P17 entropy ≥ 4.0 bits/char with a
// digit and a letter, never inside a URL; Aadhaar, PAN, phone numbers and addresses are not caught), 08-0 §B.3 / 08-5 §3.4
// (`PasteCatch { start; end; kind; mask: '••••' }`), 08-0 §G.6 / 08-2 §11.4 (the Redactor is one module,
// `src/shared/redactor.ts`, used by main and the engine; R1 main re-checks what the composer's catcher saw), 08-2 §11.5
// (`composer.checkSecret`). 08-2 §11.4 pipeline (X-72, G-M5-06): 1 registry scrub (exact + normalised forms, longest first →
// [hidden]; RAM only, ≤ 256 values, LRU); 2 pattern scrub (the patterns above plus Bearer, PEM blocks, secret URL params,
// URL userinfo, 4–8 digits near an OTP word; card numbers → "•••• {last4}"); 3 context rules `toast` / `log` / `group`.
// 08-2 §7.2 (a registry hit at the final gate is a bug: the value is blanked, the turn proceeds, REDACTION_LATE_HIT is logged
// with the part number, not the value).
import type { Clock } from './clock';
import { formatInr } from './format';
import type { PasteCatch } from './types';

/** 08-0 §B.3: the mask is always exactly this, whatever the secret's length. */
export const MASK = '••••' as const;

export type PatternId =
  'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'P10' | 'P11' | 'P12' | 'P13' | 'P14' | 'P15' | 'P16' | 'P17';

/** A hit with the pattern that found it (the suggested Secret box name depends on it). Offsets are in the original text. */
export interface SecretHit extends PasteCatch {
  pattern: PatternId;
}

export interface CheckContext {
  /** P16: foo, a helper or a card in this chat asked for a code in the last 10 minutes. */
  askedForCode?: boolean;
  /** P17 exception: transaction references foo already showed in this chat (WhatsApp / UPI). */
  knownRefs?: readonly string[];
}

interface Rule {
  id: PatternId;
  kind: PasteCatch['kind'];
  re: RegExp;
  check?: (m: string) => boolean;
}

const RULES: Rule[] = [
  { id: 'P1', kind: 'ai_key', re: /\bsk-(?:proj-|ant-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/gu },
  { id: 'P2', kind: 'web_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/gu },
  { id: 'P3', kind: 'token', re: /\bya29\.[0-9A-Za-z_-]{20,}/gu },
  { id: 'P4', kind: 'token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/gu },
  { id: 'P5', kind: 'token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/gu },
  {
    id: 'P6',
    kind: 'token',
    re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/gu,
    // "pk_ only when ≥ 24 chars".
    check: (m) => !m.startsWith('pk_') || m.length >= 24,
  },
  { id: 'P7', kind: 'token', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu },
  { id: 'P8', kind: 'ai_key', re: /\b(?:hf_[A-Za-z0-9]{30,}|gsk_[A-Za-z0-9]{40,}|xai-[A-Za-z0-9]{40,}|AIzaSy[0-9A-Za-z_-]{33})\b/gu },
  { id: 'P9', kind: 'token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gu },
  { id: 'P10', kind: 'token', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/gu },
  { id: 'P11', kind: 'password', re: /\b(?:password|passwd|pwd|passcode|pass)\s*(?:is|:|=|-)\s*\S{4,}/giu },
  { id: 'P11', kind: 'password', re: /(?:पासवर्ड|ਪਾਸਵਰਡ)\s*(?:है|:|=|-)?\s*\S{4,}/gu },
  { id: 'P12', kind: 'card', re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/gu, check: isCardNumber },
  { id: 'P13', kind: 'card', re: /\b(?:cvv2?|cvc2?|security code)\b\D{0,6}\d{3,4}\b/giu },
  // GAP: GAPS.md 2026-10-17 "P14 catches a postal pin code"
  { id: 'P14', kind: 'password', re: /\b(?:upi\s*pin|mpin|atm\s*pin|pin)\b\D{0,6}\d{4,6}\b/giu },
  { id: 'P15', kind: 'otp', re: /\b(?:otp|one[ -]time (?:password|code)|verification code|login code)\b\D{0,12}\d{4,8}\b/giu },
];

/** P16: the whole message is one 4–8 digit code (spaces allowed between digit groups). */
const P16 = /^\s*(\d(?: ?\d){3,7})\s*$/u;
/** P17: a long run of key-like characters. */
const P17 = /(?<![A-Za-z0-9+/_=.-])[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9+/_=-])/gu;
/**
 * "Zero-width characters" (04-2 §22.4), read as every invisible character: Unicode default-ignorable code points (soft
 * hyphen U+00AD, U+200B–U+200F, U+2060–U+206F incl. the invisible operators U+2061–U+2064, U+FEFF, variation selectors,
 * tag characters …) and all format characters (`Cf`). Review S5: a key split by a soft hyphen was not caught.
 */
const ZERO_WIDTH = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u;

/** Luhn check over a string of digits. */
export function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** P12 extra check: 13–19 digits once spaces and dashes are removed, first digit 2–6, passes Luhn. */
export function isCardNumber(m: string): boolean {
  const digits = m.replace(/[ -]/g, '');
  return digits.length >= 13 && digits.length <= 19 && /^[2-6]/.test(digits) && luhn(digits);
}

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  const n = [...s].length;
  let h = 0;
  for (const k of counts.values()) {
    const p = k / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * NFKC with zero-width (invisible) characters removed, plus a map from each normalised UTF-16 index to the original index (so a catch
 * masks the right span of what the user sees). Normalised one code point at a time.
 */
export function normalise(text: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    if (!ZERO_WIDTH.test(ch)) {
      const n = ch.normalize('NFKC');
      for (let j = 0; j < n.length; j++) map.push(i);
      out += n;
    }
    i += ch.length;
  }
  map.push(text.length);
  return { text: out, map };
}

function insideUrl(text: string, start: number, end: number): boolean {
  let a = start;
  while (a > 0 && !/\s/u.test(text[a - 1]!)) a--;
  let b = end;
  while (b < text.length && !/\s/u.test(text[b]!)) b++;
  const word = text.slice(a, b);
  return /:\/\//u.test(word) || /^www\./iu.test(word);
}

/** Every secret in `text` (04-2 §22.4), in order, overlaps merged. Offsets point into `text` as given. */
export function findSecrets(text: string, ctx: CheckContext = {}): SecretHit[] {
  const n = normalise(text);
  const raw: { start: number; end: number; pattern: PatternId; kind: PasteCatch['kind'] }[] = [];
  for (const rule of RULES) {
    for (const m of n.text.matchAll(rule.re)) {
      if (rule.check && !rule.check(m[0])) continue;
      raw.push({ start: m.index, end: m.index + m[0].length, pattern: rule.id, kind: rule.kind });
    }
  }
  if (ctx.askedForCode) {
    const m = P16.exec(n.text);
    if (m) {
      const start = n.text.indexOf(m[1]!);
      raw.push({ start, end: start + m[1]!.length, pattern: 'P16', kind: 'otp' });
    }
  }
  for (const m of n.text.matchAll(P17)) {
    const s = m[0];
    if (entropy(s) < 4 || !/\d/u.test(s) || !/[A-Za-z]/u.test(s)) continue;
    if (insideUrl(n.text, m.index, m.index + s.length)) continue;
    if (ctx.knownRefs?.includes(s)) continue;
    raw.push({ start: m.index, end: m.index + s.length, pattern: 'P17', kind: 'token' });
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: typeof raw = [];
  for (const h of raw) {
    const last = merged[merged.length - 1];
    if (last && h.start < last.end) last.end = Math.max(last.end, h.end);
    else merged.push({ ...h });
  }
  return merged.map((h) => ({ start: n.map[h.start]!, end: n.map[h.end]!, kind: h.kind, mask: MASK, pattern: h.pattern }));
}

/** 08-2 §11.5 `composer.checkSecret`: the first catch, or null. */
export function checkSecret(text: string, ctx: CheckContext = {}): PasteCatch | null {
  const hit = findSecrets(text, ctx)[0];
  return hit ? { start: hit.start, end: hit.end, kind: hit.kind, mask: MASK } : null;
}

/** Replaces every hit with `replacement` (default the mask). Used before a draft or a stored text is written (08-2 §11.4 R2). */
export function redactSecrets(text: string, replacement: string = MASK, ctx: CheckContext = {}): { text: string; hits: number } {
  const hits = findSecrets(text, ctx);
  let out = text;
  for (const h of [...hits].reverse()) out = out.slice(0, h.start) + replacement + out.slice(h.end);
  return { text: out, hits: hits.length };
}

/** 04-2 §22.4 "Move to secret box": the suggested name slot for the Secret box card (C7, M5; its copy arrives with the card). */
export type SecretNameSlot = 'openai' | 'google' | 'card' | 'password' | 'otp' | 'key';
export function suggestedNameSlot(hit: Pick<SecretHit, 'pattern'>): SecretNameSlot {
  switch (hit.pattern) {
    case 'P1':
      return 'openai';
    case 'P2':
      return 'google';
    case 'P12':
      return 'card';
    case 'P11':
      return 'password';
    case 'P15':
    case 'P16':
      return 'otp';
    default:
      return 'key';
  }
}

/** P16 context: 10 minutes after foo, a helper or a card asked for a code (04-2 §22.4). */
export const ASKED_FOR_CODE_MS = 10 * 60_000;
const ASKS_FOR_CODE = /\b(?:otp|one[ -]time (?:password|code)|verification code|login code|code)\b|ओटीपी|ਓਟੀਪੀ/iu;

// GAP: GAPS.md 2026-10-17 "no structured asked-for-a-code flag"
/**
 * Whether the newest message that is not the user's asked for a code within the last 10 minutes. There is no field that marks
 * "asked for a code" (GAPS.md), so its text is read for the words of P15 or "code".
 */
export function askedForCode(
  messages: readonly { authorKind: string; text: string; createdAt: number; deletedAt?: number | null }[],
  now: number,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.deletedAt) continue;
    if (m.authorKind === 'user') continue;
    return now - m.createdAt <= ASKED_FOR_CODE_MS && ASKS_FOR_CODE.test(m.text);
  }
  return false;
}

// ── 08-2 §11.4 Redaction pipeline (one module for main and the engine, X-72 / G-M5-06) ──────────────────────────────────

/** The replacement for registry and pattern hits (08-2 §11.4). */
export const HIDDEN = '[hidden]';

/** Tech-log writer injected by the caller (kind, small detail; never a secret value). */
export type LogFn = (kind: string, detail?: Record<string, string | number | boolean>) => void;

/** 08-0 §G.6 `registry:add { handle, hash, len, value, normalised, ttlMs }` as main and the engine keep it. */
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

  // M9 T7
  /** The value behind a handle (a typed code, `code.submit`, 08-2 §8.4) for the engine filler only; null once gone. */
  valueOf(handle: string): string | null {
    this.purge();
    return this.entries.get(handle)?.value ?? null;
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

/** 08-2 §11.4 item 2 rows beyond the paste catcher's: `Bearer …`, PEM blocks, secret URL params, URL userinfo, OTP near its word. */
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gu;
const PEM_BLOCK = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/gu;
const URL_PARAM = /[?&](?:token|key|code|sig|signature|password|pwd|secret|auth)=([^&#\s]+)/giu;
const URL_USERINFO = /\b[a-z][a-z0-9+.-]{0,31}:\/\/([^\s/@:]+(?::[^\s/@]*)?)@/giu;
// The words confirmation, booking, reference, order, PNR, ticket, receipt and a bare "code" do not trigger (§11.4).
const OTP_WORD = /(?:\b(?:otp|one[- ]?time|verification code|security code|passcode)\b|पासकोड|ओटीपी|ਓਟੀਪੀ)/giu;
const CODE_NEAR = /(?<!\d)\d{4,8}(?!\d)/gu;

export function extraSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const re of [BEARER, PEM_BLOCK]) for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length });
  for (const re of [URL_PARAM, URL_USERINFO])
    for (const m of text.matchAll(re)) {
      const v = m[1]!;
      const start = m.index + m[0].indexOf(v);
      out.push({ start, end: start + v.length });
    }
  const near = new Set<number>(); // a code near several OTP words is one span
  for (const w of text.matchAll(OTP_WORD)) {
    const from = Math.max(0, w.index - 40);
    const to = Math.min(text.length, w.index + w[0].length + 40);
    for (const m of text.slice(from, to).matchAll(CODE_NEAR)) {
      const start = from + m.index;
      if (near.has(start)) continue;
      near.add(start);
      out.push({ start, end: start + m[0].length });
    }
  }
  return out;
}

/** 08-2 §11.4 item 3: where the text is going. No channel = stored text and AI input (steps 1–2 only). */
export type RedactChannel = 'toast' | 'log' | 'group';

export interface RedactCtx {
  channel?: RedactChannel;
  /** `toast`: the user's own addresses stay readable; every other address is third-party. */
  ownEmails?: readonly string[];
  /** `group` (b): `payments.amount_paise` of the job's succeeded payments. */
  paidAmountsPaise?: readonly number[];
  /** `group` (c): text of the private `memory_index` rows offered in this job's turns. */
  privateFacts?: readonly string[];
  /** `group` (d): address values the job's approvals shared. */
  sharedAddresses?: readonly string[];
}

const EMAIL = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,63}\b/gu;
/** A phone number: optional +country code, then 10 digits with optional spaces or dashes. */
const PHONE = /(?<![\w+•])(?:\+(\d{1,3})[ -]?)?((?:\d[ -]?){9}\d)(?![\w•])/gu;
/** Reference numbers that look like phone numbers (a PNR is 10 digits) are not phone numbers. */
const NOT_A_PHONE = /\b(?:pnr|order|booking|ref(?:erence)?|ticket|invoice|receipt|confirmation|id|no\.?)\W{0,4}$|#\s*$/iu;

/** J20 / 08-2 §11.4: "r***@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** J20 / 08-2 §11.4: "+91 98••• ••210" (country code kept; first 2 and last 3 digits of the number). */
export function maskPhone(national: string, countryCode?: string): string {
  const d = national.replace(/\D/g, '');
  return `${countryCode ? `+${countryCode} ` : ''}${d.slice(0, 2)}••• ••${d.slice(-3)}`;
}

function maskContacts(text: string, ownEmails: readonly string[]): string {
  const own = new Set(ownEmails.map((e) => e.toLowerCase()));
  let out = text.replace(EMAIL, (e) => (own.has(e.toLowerCase()) ? e : maskEmail(e)));
  out = out.replace(PHONE, (m: string, cc: string | undefined, national: string, offset: number, whole: string) => {
    if (!cc && !/^[6-9]/.test(national)) return m;
    if (NOT_A_PHONE.test(whole.slice(Math.max(0, offset - 16), offset))) return m;
    return maskPhone(national, cc);
  });
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** F11 / F19.2 forms of an amount: "₹14,600", "14,600", "14600", and each with paise ("14,600.00"). */
function amountForms(paise: number): string[] {
  const exact = formatInr(paise);
  const grouped = exact.replace(/^-?₹/, '').replace(/\.\d{2}$/, '');
  const plain = grouped.replace(/,/g, '');
  const p = (Math.abs(paise) % 100).toString().padStart(2, '0');
  const forms = [`₹${grouped}.${p}`, `₹${grouped}`, `${grouped}.${p}`, `${plain}.${p}`, grouped, plain];
  return [...new Set(forms)].sort((a, b) => b.length - a.length);
}

function groupRules(text: string, ctx: RedactCtx): string {
  let out = text;
  for (const paise of ctx.paidAmountsPaise ?? [])
    for (const f of amountForms(paise)) out = out.replace(new RegExp(`(?<![\\d.,])${escapeRe(f)}(?![\\d]|[.,]\\d)`, 'gu'), 'the amount');
  const facts = (ctx.privateFacts ?? []).filter(Boolean).map((f) => f.normalize('NFKC'));
  if (facts.length) {
    out = out.normalize('NFKC');
    for (const f of facts.sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(escapeRe(f), 'giu'), 'something private');
  }
  for (const a of [...(ctx.sharedAddresses ?? [])].filter(Boolean).sort((x, y) => y.length - x.length))
    out = out.split(a).join('the address');
  return out;
}

/**
 * The Redactor (08-2 §11.4): `redact(text, ctx)` runs the registry scrub, the pattern scrub and the context rules in that
 * order. Main and the engine each make one; each holds its copy of the registry (`registry:add` mirrors main's to the engine).
 */
export class Redactor {
  readonly registry: SecretRegistry;
  private readonly log: LogFn;

  constructor(deps: { clock: Clock; log?: LogFn; maxValues?: number; registry?: SecretRegistry }) {
    this.registry = deps.registry ?? new SecretRegistry(deps.clock, deps.maxValues);
    this.log = deps.log ?? (() => {});
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
   * Pattern scrub: the paste catcher's patterns plus the §11.4 rows it does not have ({@link extraSpans}). Card numbers →
   * "•••• {last4}", every other hit → [hidden]. Overlapping spans are merged.
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
    // One pass, so thousands of hits in a long text stay linear.
    const parts: string[] = [];
    let at = 0;
    for (const h of merged) {
      const span = text.slice(h.start, h.end);
      parts.push(text.slice(at, h.start), h.card ? `${MASK} ${span.replace(/\D/g, '').slice(-4)}` : HIDDEN);
      at = h.end;
    }
    parts.push(text.slice(at));
    return { text: parts.join(''), hits: merged.length };
  }

  /** 08-2 §11.4 steps 1–3. */
  redact(text: string, ctx: RedactCtx = {}): { text: string; hits: number } {
    const r = this.registryScrub(text, HIDDEN);
    const p = this.patternScrub(r.text);
    let out = p.text;
    if (ctx.channel === 'toast') out = maskContacts(out, ctx.ownEmails ?? []);
    if (ctx.channel === 'log') out = maskContacts(out, []);
    if (ctx.channel === 'group') out = groupRules(maskContacts(out, []), ctx);
    return { text: out, hits: r.handles.length + p.hits };
  }

  /** Steps 1–2 over any text (R2 stored text, R10 AI output before display). */
  scrub(text: string): { text: string; hits: number } {
    return this.redact(text);
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
