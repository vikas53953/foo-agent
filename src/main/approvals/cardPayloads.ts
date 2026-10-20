// Spec: 08-1 §4.5 (the `approval`, `draft` and `secret` card payloads), 08-0 §G.7 (a Draft card is its own approval card).
// M6 T9 (M5 close-out consider 4 + 7): main reads a card's `payload` (a JSON column, `Record<string, unknown>` on CardRow)
// through these guards instead of `as unknown as` casts, so a row of the wrong type or shape is refused, never misread.
import type { ApprovalPayload, CardRow, DraftPayload, SecretPayload } from '../../shared/types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 08-1 §4.5 approval payload: the fields main reads to act on it. */
export function isApprovalPayload(p: unknown): p is ApprovalPayload {
  return isObj(p) && typeof p.approvalId === 'string' && typeof p.verb === 'string' && isObj(p.fields);
}

/** 08-1 §4.5 draft payload: the fields main reads to act on it. */
export function isDraftPayload(p: unknown): p is DraftPayload {
  return isObj(p) && typeof p.approvalId === 'string' && typeof p.channel === 'string' && typeof p.body === 'string';
}

/** 08-1 §4.5 secret payload (never a value). */
export function isSecretPayload(p: unknown): p is SecretPayload {
  return isObj(p) && typeof p.secretKind === 'string' && typeof p.name === 'string' && Array.isArray(p.fields);
}

/** The card's approval payload, or null when the card is not an approval card or its payload has the wrong shape. */
export const approvalPayloadOf = (card: CardRow): ApprovalPayload | null =>
  card.type === 'approval' && isApprovalPayload(card.payload) ? card.payload : null;

/** The card's draft payload, or null when the card is not a Draft card or its payload has the wrong shape. */
export const draftPayloadOf = (card: CardRow): DraftPayload | null =>
  card.type === 'draft' && isDraftPayload(card.payload) ? card.payload : null;

/** The card's secret payload, or null when the card is not a Secret box or its payload has the wrong shape. */
export const secretPayloadOf = (card: CardRow): SecretPayload | null =>
  card.type === 'secret' && isSecretPayload(card.payload) ? card.payload : null;
