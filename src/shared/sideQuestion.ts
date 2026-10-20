// Spec: 04 §17.5 (a side question, "Ask about this": the AI answers it from context in the same chat and never cancels or
// re-plans a running job), 08-1 §3.2 message:send `quote` (the words picked; folded into the AI text, not stored as its
// own column), CR-0022 pick 6 (X-180). R1 T6: one place for the AI text of a side question, used by main (with the quote
// the composer sent) and by the engine (the whole replied-to message when no quote came).

/** Prompt strings, not copy (08-0 §D). */
export const SIDE_ABOUT = 'Side question about this part of your earlier message (answer it; do not start, stop or change any task):';
const SIDE_ASK = 'Question:';

/** The side question as the AI reads it: the quoted words above the question. */
export function sideAiText(about: string, asked: string): string {
  return `${SIDE_ABOUT}\n> ${about.trim().split('\n').join('\n> ')}\n\n${SIDE_ASK}\n${asked}`;
}

export function isSideAiText(text: string | null): boolean {
  return !!text?.startsWith(SIDE_ABOUT);
}
