// Spec: 08-4 §26.6 (typed answers to Choice cards, F-076: the text trimmed, NFKC, case-folded, surrounding quotes and a
// trailing "." or "!" removed; then in order: 1 digit / `option {n}` / ordinals in English, Hinglish, Devanagari and
// Gurmukhi with an optional the/one/wala/vaala → 2 label or detail equality (case and punctuation ignored) → 3 the token
// rule (stop-words out, tokens of ≥ 2 graphemes, exactly one option holds them all) → 4 a reaction 1️⃣–4️⃣ → 5 skip words,
// only when the card shows Skip → 6 the multi-select split on `,` / and / aur / और → 7 a tie is not an answer: "Did you
// mean {a} or {b}?" with the first two matching labels), 08-2 §5.2.3 (answersCard), 05-1 §5.3.4 (every way of answering
// gives the same summary; two open cards → the newest), §5.3 purposes file_in / photo_notice (no Skip, no Best fit),
// §5.3.6 + CR-0009 G-M5-09 (the toast's first button answers Best fit, resolved_by 'toast'). Pure.
import type { CardAnswer, ChoicePayload } from '../../shared/types';

type Option = { id: string; label: string; detail?: string };

/** What the parser reads from a Choice or tiles card (the payload, plus the row's id and age for `pickCard`). */
export interface AnswerableCard {
  purpose: ChoicePayload['purpose'] | 'fold_which';
  options: Option[];
  multi?: boolean;
  /** A stepper card's questions after the first (implementation-notes M5-T5); such a card is answered on the card only. */
  steps?: unknown[];
  id?: string;
  createdAt?: number;
}

export type TypedResult = { kind: 'answer'; answer: CardAnswer } | { kind: 'tie'; a: string; b: string } | { kind: 'none' };

const NONE: TypedResult = { kind: 'none' };

const ORDINALS = [
  ['first', 'pehla', 'पहला', 'ਪਹਿਲਾ'],
  ['second', 'doosra', 'दूसरा', 'ਦੂਜਾ'],
  ['third', 'teesra', 'तीसरा', 'ਤੀਜਾ'],
  ['fourth', 'chautha', 'चौथा', 'ਚੌਥਾ'],
] as const;
const ORDINAL_RE = new RegExp(`^(?:the\\s+)?(${ORDINALS.flat().join('|')})(?:\\s+(?:one|wala|vaala))?$`, 'u');
const STOP_WORDS = new Set(['the', 'one', 'that', 'wala', 'vaala', 'wali', 'please', 'pls', 'ok', 'ka', 'ki', 'ko', 'वाला', 'वाली']);
const SKIP_WORDS = new Set(['skip', 'skip it', 'rehne do', 'छोड़ो', 'ਛੱਡੋ'].map((w) => w.normalize('NFKC')));
const MULTI_SPLIT = /,|\s+and\s+|\s+aur\s+|\s+और\s+/u;
const KEYCAPS = ['1⃣', '2⃣', '3⃣', '4⃣'];

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemes = (s: string) => [...segmenter.segment(s)].length;

/** §26.6 opening line. */
export function normalise(text: string): string {
  let s = text.trim().normalize('NFKC').toLowerCase();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '').trim();
  return s.replace(/[.!]$/u, '').trim();
}

/** Rule 2's comparison form: punctuation out, spaces collapsed. */
const bare = (s: string) =>
  normalise(s)
    .replace(/\p{P}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const fold = (s: string) => s.normalize('NFKC').toLowerCase();

/** The card shows Skip (05-1 §5.3: not on file_in or photo_notice cards). */
export const showsSkip = (card: Pick<AnswerableCard, 'purpose'>) => card.purpose !== 'file_in' && card.purpose !== 'photo_notice';
/** The card has a Best fit row (05-1 §5.3: file_in and photo_notice have none). */
export const hasBestFit = showsSkip;

const isStepper = (card: AnswerableCard) => (card.steps?.length ?? 0) > 0;

type One = { kind: 'one'; id: string } | { kind: 'tie'; a: string; b: string } | { kind: 'none' };

/** Rules 1–3 on one already-normalised piece of text. */
function resolveOne(s: string, options: Option[]): One {
  // Rule 1.
  const digit = /^(?:option\s+)?([1-4])$/u.exec(s)?.[1];
  const ordinal = ORDINAL_RE.exec(s)?.[1];
  const n = digit ? Number(digit) : ordinal ? ORDINALS.findIndex((row) => (row as readonly string[]).includes(ordinal)) + 1 : 0;
  if (n > 0) return n <= options.length ? { kind: 'one', id: options[n - 1]!.id } : { kind: 'none' };
  // Rule 2.
  const b = bare(s);
  if (b) {
    const eq = options.find((o) => bare(o.label) === b || (o.detail !== undefined && bare(o.detail) === b));
    if (eq) return { kind: 'one', id: eq.id };
  }
  // Rule 3.
  const tokens = s
    .split(/\s+/u)
    .map((tok) => tok.replace(/^\p{P}+|\p{P}+$/gu, ''))
    .filter((tok) => tok && !STOP_WORDS.has(tok) && graphemes(tok) >= 2);
  if (!tokens.length) return { kind: 'none' };
  const hits = options.filter((o) => {
    const hay = fold(`${o.label} ${o.detail ?? ''}`);
    return tokens.every((tok) => hay.includes(tok));
  });
  if (hits.length === 1) return { kind: 'one', id: hits[0]!.id };
  if (hits.length > 1) return { kind: 'tie', a: hits[0]!.label, b: hits[1]!.label };
  return { kind: 'none' };
}

/** `answersCard(m, card)` (08-2 §5.2.3): the typed text as an answer, a tie, or nothing. */
export function typedAnswer(text: string, card: AnswerableCard): TypedResult {
  if (isStepper(card)) return NONE;
  const s = normalise(text);
  if (!s) return NONE;
  if (card.multi) {
    // Rule 6: every part resolves by rules 1–3, or the text is not an answer.
    const ids: string[] = [];
    let partsOk = true;
    for (const part of s.split(MULTI_SPLIT).map((p) => p.trim())) {
      const r = part ? resolveOne(part, card.options) : NONE;
      if (r.kind !== 'one') {
        partsOk = false;
        break;
      }
      if (!ids.includes(r.id)) ids.push(r.id);
    }
    if (partsOk && ids.length) return { kind: 'answer', answer: { optionIds: ids } };
    return showsSkip(card) && SKIP_WORDS.has(s) ? { kind: 'answer', answer: { skip: true } } : NONE;
  }
  const r = resolveOne(s, card.options);
  if (r.kind === 'one') return { kind: 'answer', answer: { optionId: r.id } };
  if (r.kind === 'tie') return r;
  // Rule 5 (rule 4 is `reactionAnswer`).
  if (showsSkip(card) && SKIP_WORDS.has(s)) return { kind: 'answer', answer: { skip: true } };
  return NONE;
}

/** Rule 4: a reaction 1️⃣–4️⃣ on the card (Art. 6: reactions answer Choice cards only). */
export function reactionAnswer(emoji: string, card: AnswerableCard): TypedResult {
  if (isStepper(card)) return NONE;
  const n = KEYCAPS.indexOf(emoji.replace(/️/gu, '')) + 1;
  if (n < 1 || n > card.options.length) return NONE;
  const id = card.options[n - 1]!.id;
  return { kind: 'answer', answer: card.multi ? { optionIds: [id] } : { optionId: id } };
}

/**
 * 05-1 §5.3.4: of the open cards the text answers, the newest one takes it; a tie on the first card that reacts to the text
 * is that message's outcome. null: no card is answered and the message falls through to steer or intake (08-2 §5.2).
 */
export function pickCard<C extends AnswerableCard>(text: string, cards: C[]): { card: C; result: TypedResult } | null {
  const newestFirst = [...cards].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  for (const card of newestFirst) {
    const result = typedAnswer(text, card);
    if (result.kind !== 'none') return { card, result };
  }
  return null;
}

/** 05-1 §5.3.6 + G-M5-09: the toast's first button answers the card with its Best fit (option 1). */
export function toastAnswer(card: AnswerableCard): { answer: CardAnswer; resolvedBy: 'toast' } | null {
  if (!hasBestFit(card) || isStepper(card) || !card.options[0]) return null;
  const id = card.options[0].id;
  return { answer: card.multi ? { optionIds: [id] } : { optionId: id }, resolvedBy: 'toast' };
}
