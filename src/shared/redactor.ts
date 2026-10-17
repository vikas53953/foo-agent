// Spec: 04-2 §22.4 (paste catcher, C8, Article 8: patterns P1–P17 as JavaScript regexes with the `u` flag, `(?i)` rows with
// `i`; text checked after NFKC with zero-width characters removed; P12 needs 13–19 digits, a first digit 2–6 and Luhn; P16
// only when foo, a helper or a card in this chat asked for a code in the last 10 minutes; P17 entropy ≥ 4.0 bits/char with a
// digit and a letter, never inside a URL; Aadhaar, PAN, phone numbers and addresses are not caught), 08-0 §B.3 / 08-5 §3.4
// (`PasteCatch { start; end; kind; mask: '••••' }`), 08-0 §G.6 / 08-2 §11.4 (the Redactor is one module,
// `src/shared/redactor.ts`, used by main and the engine; R1 main re-checks what the composer's catcher saw), 08-2 §11.5
// (`composer.checkSecret`). M2 builds the pattern part shared by the composer and main; the SecretRegistry and the context
// rules of §11.4 arrive with the engine (M3).
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
  { id: 'P14', kind: 'password', re: /\b(?:upi\s*pin|mpin|atm\s*pin|pin)\b\D{0,6}\d{4,6}\b/giu },
  { id: 'P15', kind: 'otp', re: /\b(?:otp|one[ -]time (?:password|code)|verification code|login code)\b\D{0,12}\d{4,8}\b/giu },
];

/** P16: the whole message is one 4–8 digit code (spaces allowed between digit groups). */
const P16 = /^\s*(\d(?: ?\d){3,7})\s*$/u;
/** P17: a long run of key-like characters. */
const P17 = /(?<![A-Za-z0-9+/_=.-])[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9+/_=-])/gu;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/u;

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
 * NFKC with zero-width characters removed, plus a map from each normalised UTF-16 index to the original index (so a catch
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

/**
 * Whether the newest message that is not the user's asked for a code within the last 10 minutes. There is no field that marks
 * "asked for a code" (implementation-notes GAP), so its text is read for the words of P15 or "code".
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
