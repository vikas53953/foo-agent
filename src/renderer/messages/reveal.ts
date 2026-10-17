// Spec: 03-shell-2 §3.7.3.1 (Click / Enter on a Doing-now row: open the job's chat if different and scroll to its checklist
// card, which flashes --accent-soft for 2 s), 04-2 §23.4 (the pending-card strip's Show: scroll the oldest waiting card to the
// centre and move focus to the card group). The request outlives the chat switch, so it is held here until that chat's
// MessageList has the rows to scroll to.
export const REVEAL_EVENT = 'foo:reveal-job';

export type RevealTarget = { kind: 'job'; jobId: string } | { kind: 'card'; cardId: string };

let pending: { chatId: string; target: RevealTarget } | null = null;

export function requestReveal(chatId: string, jobId: string): void {
  pending = { chatId, target: { kind: 'job', jobId } };
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT));
}

/** 04-2 §23.4 (builder B): scroll to a card and focus its row. */
export function requestRevealCard(chatId: string, cardId: string): void {
  pending = { chatId, target: { kind: 'card', cardId } };
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT));
}

/** The pending reveal in `chatId`, consumed by the caller. */
export function takeReveal(chatId: string): RevealTarget | null {
  if (!pending || pending.chatId !== chatId) return null;
  const { target } = pending;
  pending = null;
  return target;
}
