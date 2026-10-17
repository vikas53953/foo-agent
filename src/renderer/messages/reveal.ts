// Spec: 03-shell-2 §3.7.3.1 (Click / Enter on a Doing-now row: open the job's chat if different and scroll to its checklist
// card, which flashes --accent-soft for 2 s). The request outlives the chat switch, so it is held here until that chat's
// MessageList has the rows to scroll to.
export const REVEAL_EVENT = 'foo:reveal-job';

let pending: { chatId: string; jobId: string } | null = null;

export function requestReveal(chatId: string, jobId: string): void {
  pending = { chatId, jobId };
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT));
}

/** The pending job to reveal in `chatId`, consumed by the caller. */
export function takeReveal(chatId: string): string | null {
  if (!pending || pending.chatId !== chatId) return null;
  const { jobId } = pending;
  pending = null;
  return jobId;
}
