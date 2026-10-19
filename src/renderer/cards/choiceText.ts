// Spec: 05-1 §5.3.2 (answered summary "{question} → {answer}"; multi-select "{A}, {B} and {C}", commas then "and" before the
// last, no Oxford comma; typed free text "{question} → {typed text}"; skipped "Skipped. I'll go with {Best fit}."; cancelled
// "{question} → no answer"; superseded "These options changed. See the new ones below."; steer "{question} → you changed the
// plan" (08-4 §26.5 item 3)), §5.3.5 (Narrator "You chose {answer}."), §5.4.2 (tiles summaries as §5.3.2), 05-1 §5.3.1
// Stepper (implementation-notes M5-T5: questions after the first live in `payload.steps`; the answer is one id per question).
// Pure.
import type { ChoicePayload } from '../../shared/types';

export type ChoiceOption = ChoicePayload['options'][number];
export interface ChoiceQuestion {
  question: string;
  options: ChoiceOption[];
  multi?: boolean;
}

/** The payload as the card draws it. */
export type ChoiceView = ChoicePayload;

/** The card's one question (a stepper's other questions are their own cards, 08-1 §4.5). */
export function questionOf(p: ChoiceView): ChoiceQuestion {
  return { question: p.question, options: p.options ?? [], multi: p.multi ?? false };
}

const AND = new Intl.ListFormat('en-IN', { type: 'conjunction' });
/** "A", "A and B", "A, B and C" (en-IN list form: no Oxford comma). */
export const joinAnd = (items: string[]): string => AND.format(items);

const labelOf = (q: ChoiceQuestion, id: string) => q.options.find((o) => o.id === id)?.label ?? '';

/** The answer words: the typed text, the option's label, or a multi-select's labels joined. */
export function answerText(p: ChoiceView, answer: unknown): string {
  const q = questionOf(p);
  const a = (answer ?? {}) as { optionId?: string; optionIds?: string[]; text?: string };
  if (typeof a.text === 'string') return a.text;
  if (a.optionId) return labelOf(q, a.optionId);
  if (a.optionIds) return joinAnd(a.optionIds.map((id) => labelOf(q, id)));
  return '';
}

/** The chosen option ids of the first question (read-only expanded view ticks). */
export function chosenIds(answer: unknown): string[] {
  const a = (answer ?? {}) as { optionId?: string; optionIds?: string[] };
  return a.optionId ? [a.optionId] : (a.optionIds ?? []);
}
