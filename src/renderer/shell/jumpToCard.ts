// Spec: 05-1 §0 keyboard table / 09 §9.17.1 [X-09, X-21] (Ctrl+J anywhere in a chat: focus jumps to the oldest card in this
// chat that needs the user: pending gated card, choice, sign-in, secret, plan, stuck, bill in `waiting`; none → Narrator
// "Nothing needs you here."), 03-shell-1 §3.4.4 (a HELD approval or payment waits on the user too, G-M5-36). Pure; ShellKeys
// runs it.
import type { CardRow } from '../../shared/types';

/** Per card type, the `cards.state` values (08-0 §G.2) in which the card waits on the user. */
const NEEDS_YOU: Partial<Record<CardRow['type'], readonly string[]>> = {
  approval: ['PENDING', 'HELD'],
  payment: ['PENDING', 'HELD'],
  choice: ['asking'],
  tiles: ['asking'],
  signin: ['waiting'],
  secret: ['asking'],
  plan: ['pending'],
  stuck: ['asking'],
  bill: ['waiting'],
};

export function needsYou(card: CardRow, now: number): boolean {
  return (
    (NEEDS_YOU[card.type]?.includes(card.state) ?? false) && card.deletedAt === null && (card.expiresAt === null || card.expiresAt > now)
  );
}

/** The oldest card in `chatId` that needs the user, or null. */
export function oldestNeedsYouCard(cards: Iterable<CardRow>, chatId: string, now: number): CardRow | null {
  let oldest: CardRow | null = null;
  for (const c of cards)
    if (
      c.chatId === chatId &&
      needsYou(c, now) &&
      (!oldest || c.createdAt < oldest.createdAt || (c.createdAt === oldest.createdAt && c.id < oldest.id))
    )
      oldest = c;
  return oldest;
}
