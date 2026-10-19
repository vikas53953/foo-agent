// Spec: 04-2 §22.4 ("Move to secret box": the Secret box is posted with the value already in its masked field; the value is
// held in memory only until the user chooses, never rendered, stored or logged), 05-2 §5.8.5 rule 1 (the value travels
// renderer → main in one IPC call). The hand-over from the composer to the card it posted: one value per card id. The card
// row can arrive (card:upsert) before or after `secret:offer` answers, so the card both reads and listens. A value no card
// takes is dropped after {@link PREFILL_TTL_MS} or when the composer leaves the chat (04-2 §22.4 "not kept anywhere").
const waiting = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();
const listeners = new Map<string, (value: string) => void>();

export const PREFILL_TTL_MS = 60_000;

const drop = (cardId: string) => {
  const w = waiting.get(cardId);
  if (w) clearTimeout(w.timer);
  waiting.delete(cardId);
};

export function prefillSecret(cardId: string, value: string): void {
  const l = listeners.get(cardId);
  if (l) return l(value);
  drop(cardId);
  waiting.set(cardId, { value, timer: setTimeout(() => waiting.delete(cardId), PREFILL_TTL_MS) });
}

/** The composer left the chat: nothing waits for a card any more. */
export function clearSecretPrefill(): void {
  for (const id of [...waiting.keys()]) drop(id);
}

/** The value the composer moved into this card, if any (read in the field's initial state). */
export function peekSecretPrefill(cardId: string): string | null {
  return waiting.get(cardId)?.value ?? null;
}

/** The card is mounted: forget what it already holds and take a value that arrives later. */
export function listenSecretPrefill(cardId: string, onValue: (value: string) => void): () => void {
  drop(cardId);
  listeners.set(cardId, onValue);
  return () => {
    if (listeners.get(cardId) === onValue) listeners.delete(cardId);
  };
}
