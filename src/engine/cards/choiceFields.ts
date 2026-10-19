// Spec: 08-4 §26.7 (choice-card engine fields, F-077: ids o1…o4 in order; Best fit is o1; livePrices when any option's
// label or detail holds an amount parseInr reads; effectiveReversible = AI said reversible && the job is read_only &&
// !livePrices && no option names a date or time; the payload keeps both aiReversible and reversible; the engine sets the
// purpose), 08-1 §4.5 ChoicePayload (`options[].bestFit`), 08-2 §10.3 parseInr, CR-0009 G-M5-07 (the AI's spec is checked
// with 08-4's limits before it gets here). implementation-notes M5-T5: amounts are read from each "₹…" run, and dates and
// times with a fixed pattern list (chrono-node is not a dependency); both lean to "not reversible", the safe side (no
// auto-pick). Pure.
import { parseInr } from '../../shared/format';
import type { ChoiceCardSpecAct as ChoiceCardSpec } from '../../shared/schemas';
import type { ChoicePayload, JobRow } from '../../shared/types';

const OPTION_IDS = ['o1', 'o2', 'o3', 'o4'] as const;

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DAY = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?';
const DATE_TIME = new RegExp(
  [
    '\\b\\d{1,2}:\\d{2}\\b', // 10:15
    '\\b\\d{1,2}\\s?(?:am|pm)\\b', // 7 pm
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`, // 18 Dec
    `\\b${MONTH}\\s+\\d{1,2}\\b`, // Dec 18
    `\\b${DAY}\\b`, // Fri
    '\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b', // 18/12
    '\\b(?:today|tomorrow|tonight|noon|midnight)\\b',
  ].join('|'),
  'iu',
);

/** An amount in INR in this text (each "₹…" run, or the whole text). */
export function holdsInr(text: string): boolean {
  if (parseInr(text) !== null && /₹/u.test(text)) return true;
  return [...text.matchAll(/₹\s?[\d,]+(?:\.\d{1,2})?/gu)].some((m) => parseInr(m[0].replace(/,$/u, '')) !== null);
}

export const holdsDateOrTime = (text: string) => DATE_TIME.test(text);

/** 08-4 §26.7: the ChoicePayload the engine stores for an AI's ChoiceCardSpec. */
export function choiceFields(
  spec: ChoiceCardSpec,
  job: Pick<JobRow, 'intent'> | null,
  purpose: ChoicePayload['purpose'] = 'job',
): ChoicePayload {
  const options = spec.options.slice(0, OPTION_IDS.length).map((o, i) => ({
    id: OPTION_IDS[i]!,
    label: o.label,
    ...(o.detail ? { detail: o.detail } : {}),
    ...(i === 0 ? { bestFit: true } : {}),
  }));
  const texts = options.flatMap((o) => [o.label, o.detail ?? '']);
  const livePrices = texts.some(holdsInr);
  const aiReversible = spec.reversible === true;
  const reversible = aiReversible && job?.intent === 'read_only' && !livePrices && !texts.some(holdsDateOrTime);
  return {
    purpose,
    question: spec.question,
    options,
    multi: spec.multi ?? false,
    aiReversible,
    reversible,
    livePrices,
  };
}
