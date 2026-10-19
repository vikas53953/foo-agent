// Spec: 04-2 §22.4 ("Move to secret box": the Secret box is posted with the value already in its masked field; the value is
// held in memory only until the user chooses, never rendered, stored or logged), 05-2 §5.8.5 rule 1 (the value travels
// renderer → main in one IPC call). The hand-over from the composer to the card it posted: one value per card id. The card
// row can arrive (card:upsert) before or after `secret:offer` answers, so the card both reads and listens.
const waiting = new Map<string, string>();
const listeners = new Map<string, (value: string) => void>();

export function prefillSecret(cardId: string, value: string): void {
  const l = listeners.get(cardId);
  if (l) l(value);
  else waiting.set(cardId, value);
}

/** The value the composer moved into this card, if any (read in the field's initial state). */
export function peekSecretPrefill(cardId: string): string | null {
  return waiting.get(cardId) ?? null;
}

/** The card is mounted: forget what it already holds and take a value that arrives later. */
export function listenSecretPrefill(cardId: string, onValue: (value: string) => void): () => void {
  waiting.delete(cardId);
  listeners.set(cardId, onValue);
  return () => {
    if (listeners.get(cardId) === onValue) listeners.delete(cardId);
  };
}
