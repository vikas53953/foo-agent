// Spec: 05-1 §0.7 (a new card is announced through the message list's polite live region: "{sender} sent {card name}:
// {title}", gated cards add ", needs you"; the card names are the §0.7 table, `cards.<type>.card_name`), 05-1 §0.1 (gated =
// Approval §5.5 and Payment §5.6). Card types whose name key has not landed yet keep the 04 §1.8 row line (G-M5-40).
import { cardTitle } from '../../shared/cards';
import { t } from '../../shared/copy/t';
import type { CardRow, CardType, DraftPayload, SecretPayload } from '../../shared/types';

/** 05-1 §0.7 narrator card names, for the card types that carry one in M5. */
const CARD_NAME: Partial<Record<CardType, () => string>> = {
  choice: () => t('cards.choice.card_name'),
  tiles: () => t('cards.tiles.card_name'),
  approval: () => t('cards.approval.card_name'),
  draft: () => t('cards.draft.card_name'),
  secret: () => t('cards.secret.card_name'),
};

/** 05-1 §0.1: the only cards whose tap authorises an action; they add ", needs you" while they wait on the user. */
const GATED: ReadonlySet<CardType> = new Set(['approval', 'payment']);
const WAITING: ReadonlySet<string> = new Set(['PENDING', 'HELD']);

/** The {title} part of the card's accessible name "{card name}: {title}" (05-1 §0.7; Draft 05-2 §5.7.4, Secret §5.8). */
function titleOf(card: CardRow, name: string): string {
  if (card.type === 'draft') {
    const p = card.payload as unknown as DraftPayload;
    const label = t('cards.draft.label', { channel: t('cards.draft.right_label.email'), name: p.to?.name ?? '' });
    return label.startsWith(name) ? label.slice(name.length).replace(/^:\s*/, '') : label;
  }
  if (card.type === 'secret') return (card.payload as unknown as SecretPayload).name;
  return cardTitle(card.payload);
}

/** The arrival line for a card row, or null when the card type has no §0.7 name yet (the caller keeps the row line). */
export function cardArrival(card: CardRow, sender: string): string | null {
  const name = CARD_NAME[card.type]?.();
  if (!name) return null;
  const vars = { sender, cardName: name, title: titleOf(card, name) };
  return GATED.has(card.type) && WAITING.has(card.state) ? t('cards.common.arrival_gated', vars) : t('cards.common.arrival', vars);
}
