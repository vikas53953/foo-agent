// Spec: 04-2 §23.4 (pending-card strip: shows when the chat has ≥ 1 card waiting for the user — Approval, Payment, Choice,
// Secret box or Sign-in — and less than 50 % of the oldest such card is in view; text per card type, "{n} things are waiting
// for you" for 2+; "{m}:{ss} left" when the soonest expiry is under 10 minutes; never an Approve, Pay or Send button), 03-shell-1
// §3.4.4 (which card states wait on the user). Pure; unit-tested.
import { cardTitle } from '../../shared/cards';
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import type { CardRow } from '../../shared/types';

type StripType = 'approval' | 'payment' | 'choice' | 'secret' | 'signin';
const WAITING: Record<StripType, readonly string[]> = {
  approval: ['PENDING', 'HELD'],
  payment: ['PENDING', 'HELD'],
  choice: ['asking'],
  secret: ['asking', 'waiting', 'pending'],
  signin: ['waiting'],
};
export const SOON_MS = 10 * 60_000;

export function waitingCards(cards: readonly CardRow[], now: number): CardRow[] {
  return cards
    .filter((c) => {
      const states = (WAITING as Record<string, readonly string[] | undefined>)[c.type];
      return !!states && states.includes(c.state) && c.deletedAt === null && (c.expiresAt === null || c.expiresAt > now);
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

export interface StripView {
  /** The oldest waiting card (the one Show scrolls to). */
  card: CardRow;
  icon: 'LockClosed' | 'Clock';
  text: string;
  /** "{m}:{ss} left" or null. */
  timeLeft: string | null;
}

export function stripView(waiting: readonly CardRow[], now: number): StripView | null {
  const card = waiting[0];
  if (!card) return null;
  const gated = card.type === 'approval' || card.type === 'payment';
  let text: string;
  if (waiting.length > 1) text = t('composer.pending.many', { n: waiting.length });
  else if (card.type === 'payment') {
    const p = card.payload;
    const paise = Number(p.totalPaise ?? p.amountPaise ?? 0);
    text = t('composer.pending.payment', { amount: formatInr(paise), payee: String(p.payee ?? '') });
  } else if (card.type === 'approval') text = t('composer.pending.approval', { text: cardTitle(card.payload) });
  else text = t('composer.pending.answer', { text: cardTitle(card.payload) });
  const soonest = Math.min(...waiting.map((c) => c.expiresAt ?? Infinity));
  let timeLeft: string | null = null;
  if (soonest - now < SOON_MS && soonest > now) {
    const s = Math.floor((soonest - now) / 1000);
    timeLeft = t('composer.pending.time_left', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
  }
  return { card, icon: gated ? 'LockClosed' : 'Clock', text, timeLeft };
}
