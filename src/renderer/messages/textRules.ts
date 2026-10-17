// Spec: 04 §2 (language tag: ≥ 30 % Devanagari letters → lang="hi", Gurmukhi → "pa"), §10.8, §10.9 (emoji-only: 1 emoji
// → display size, 2–3 → title-large, 4+ or any letter, digit or punctuation → normal bubble; a ZWJ, skin-tone or flag
// sequence is one emoji), §16.1 (auto-link patterns, verbatim), §16.2 (money re-written to "₹14,600"; digits never change,
// only grouping and symbol), 02-2 §F19.2, §10.5 (Read more past 20 lines). Pure.
import { formatInr } from '../../shared/format';

const letters = /\p{L}/gu;
const deva = /\p{Script=Devanagari}/gu;
const guru = /\p{Script=Gurmukhi}/gu;

/** 04 §2 / §12.2: the bubble's lang attribute, or undefined to inherit en-IN. */
export function scriptLang(text: string): 'hi' | 'pa' | undefined {
  const all = text.match(letters)?.length ?? 0;
  if (!all) return undefined;
  const d = (text.match(deva) ?? []).filter((c) => /\p{L}|\p{M}/u.test(c)).length;
  const g = (text.match(guru) ?? []).filter((c) => /\p{L}|\p{M}/u.test(c)).length;
  if (d / all >= 0.3 && d >= g) return 'hi';
  if (g / all >= 0.3) return 'pa';
  return undefined;
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en-IN', { granularity: 'grapheme' }) : null;

function graphemes(s: string): string[] {
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
}

/** One grapheme that is an emoji (pictographic, a keycap or a flag pair). */
export function isEmojiGrapheme(g: string): boolean {
  if (/⃣/u.test(g) || /^\p{Regional_Indicator}{2}$/u.test(g)) return true;
  return /\p{Extended_Pictographic}/u.test(g) && !/[\p{L}\p{N}\p{P}]/u.test(g);
}

/** 04 §10.9: 'xl' (one emoji), 'l' (2–3) or null (a normal bubble). */
export function emojiOnly(text: string): 'xl' | 'l' | null {
  const parts = graphemes(text.trim()).filter((g) => !/^\s+$/u.test(g));
  if (!parts.length || parts.length > 3 || !parts.every(isEmojiGrapheme)) return null;
  return parts.length === 1 ? 'xl' : 'l';
}

// ---- auto-links (§16.1; patterns verbatim, trailing .,;:!?) excluded) ----

export type AutoKind = 'url' | 'email' | 'phone' | 'date';
export interface AutoMatch {
  kind: AutoKind;
  start: number;
  end: number;
  text: string;
}

const PATTERNS: [AutoKind, RegExp][] = [
  ['url', /\bhttps?:\/\/[^\s<>()]+/g],
  ['url', /\bwww\.[^\s<>()]+\.[a-z]{2,}[^\s<>()]*/g],
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ['phone', /(?<!\d)(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g],
  ['phone', /(?<!\d)0\d{2,4}[\s-]?\d{6,8}(?!\d)/g],
  ['phone', /(?<!\d)\+(?!91)\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{0,4}(?!\d)/g],
  [
    'date',
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: \d{4})?(?:, \d{1,2}:\d{2} (?:AM|PM))?\b/g,
  ],
];

function trimTrail(text: string): string {
  return text.replace(/[.,;:!?)]+$/, '');
}

/** Non-overlapping auto-links in `text`, earliest first (a longer match wins a tie). `kinds` limits the search. */
export function findAutoLinks(text: string, kinds: readonly AutoKind[] = ['url', 'email', 'phone', 'date']): AutoMatch[] {
  const found: AutoMatch[] = [];
  for (const [kind, re] of PATTERNS) {
    if (!kinds.includes(kind)) continue;
    for (const m of text.matchAll(re)) {
      let s = m[0];
      if (kind === 'url') s = trimTrail(s);
      // The international pattern's optional last group can end on its separator ("+971 5012 3456 "): not part of the number.
      if (kind === 'phone') s = s.replace(/[\s-]+$/, '');
      if (kind === 'phone' && s.replace(/\D/g, '').length < 8) continue;
      if (kind === 'phone' && s.startsWith('+') && !s.startsWith('+91') && s.replace(/\D/g, '').length > 15) continue;
      found.push({ kind, start: m.index, end: m.index + s.length, text: s });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: AutoMatch[] = [];
  let at = -1;
  for (const f of found) {
    if (f.start < at) continue;
    out.push(f);
    at = f.end;
  }
  return out;
}

/** The address a URL auto-link opens ("www." gets https://). */
export function hrefOf(m: Pick<AutoMatch, 'kind' | 'text'>): string {
  if (m.kind === 'url') return /^https?:\/\//i.test(m.text) ? m.text : `https://${m.text}`;
  if (m.kind === 'email') return `mailto:${m.text}`;
  if (m.kind === 'phone') return `tel:${m.text.replace(/[\s-]/g, '')}`;
  return '';
}

// ---- money (§16.2) ----

const RUPEE_FORMS: RegExp[] = [
  // ₹14600, ₹ 14,600, ₹1179.50
  /₹\s?(\d[\d,]*)(\.\d{1,2})?(?![\d,]*\d)/g,
  // Rs 14600, Rs. 14,600, INR 14,600
  /\b(?:Rs\.?|INR)\s?(\d[\d,]*)(\.\d{1,2})?\b/g,
  // 14600 rupees
  /\b(\d[\d,]*)(\.\d{1,2})?\s?rupees\b/gi,
];

function toPaise(whole: string, frac: string | undefined): number | null {
  const digits = whole.replace(/,/g, '');
  if (!/^\d+$/.test(digits) || digits.length > 13) return null;
  const p = (frac ?? '').slice(1).padEnd(2, '0');
  return Number(digits) * 100 + Number(p || '0');
}

export interface MoneySpan {
  start: number;
  end: number;
  text: string;
}

/** Rupee amounts in foo's text, re-written to F19.2 ("Rs 14600" → "₹14,600"). Other currencies are left as written. */
export function findMoney(text: string): MoneySpan[] {
  const out: MoneySpan[] = [];
  for (const re of RUPEE_FORMS) {
    for (const m of text.matchAll(re)) {
      const paise = toPaise(m[1]!, m[2]);
      if (paise === null) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (out.some((o) => start < o.end && end > o.start)) continue;
      out.push({ start, end, text: formatInr(paise) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** `text` with every rupee amount in the F19.2 form. */
export function formatMoneyIn(text: string): string {
  let out = '';
  let at = 0;
  for (const s of findMoney(text)) {
    out += text.slice(at, s.start) + s.text;
    at = s.end;
  }
  return out + text.slice(at);
}

// ---- link text that names another domain (§13 Link, C-26) ----

const DOMAIN_IN_TEXT = /^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#:]\S*)?$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * 04 §13: when a link's visible text is itself a web address whose domain differs from where the link goes, the click
 * asks first (C-26). Returns the real domain to name in the dialog, or null when the link can open directly.
 */
export function otherDomain(shown: string, href: string): string | null {
  const host = hostOf(href);
  if (!host) return null;
  const m = DOMAIN_IN_TEXT.exec(shown.trim());
  if (!m) return null;
  const named = m[1]!.toLowerCase().replace(/^www\./, '');
  return named === host || host.endsWith(`.${named}`) ? null : host;
}

// ---- Read more (§10.5) ----

/** §10.5: clamp at 15 lines when the text renders taller than 20; "Read more" expands for good. */
export const READ_MORE_OVER_LINES = 20;
export const READ_MORE_SHOW_LINES = 15;
export const needsReadMore = (height: number, lineHeight: number) => height > READ_MORE_OVER_LINES * lineHeight + 1;
