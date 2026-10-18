// Spec: 02-2 §F13.3 / X-119 card registry (one component per `cards.type`); 05-3 §5.22–§5.24 are the M2 cards; §5.10 Sign-in is M9's. Every other
// type keeps the M1 placeholder (its title in the card frame) until its milestone (05: M5 and later).
import type { CardRow, CardType } from '../../shared/types';
import type { CardTime } from './CardFrame';
import { FileCard } from './FileCard';
import { LinkPreview } from './LinkPreview';
import { PlaceCard } from './PlaceCard';
import { SignInCard } from './SignIn';
import { TableCard } from './TableCard';

/** The card types M2 draws; the rest are later milestones' (05). */
export const M2_CARD_TYPES: readonly CardType[] = ['table', 'file', 'link_preview', 'place', 'signin'];

export const hasCardView = (type: CardType) => M2_CARD_TYPES.includes(type);

export function CardView({ card, time }: { card: CardRow; time: CardTime }) {
  switch (card.type) {
    case 'table':
      return <TableCard card={card} time={time} />;
    case 'file':
      return <FileCard card={card} time={time} />;
    case 'link_preview':
      return <LinkPreview card={card} time={time} />;
    case 'place':
      return <PlaceCard card={card} time={time} />;
    case 'signin':
      return <SignInCard card={card} time={time} />;
    default:
      return null;
  }
}
