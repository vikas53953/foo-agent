// Spec: 02-2 §F13.3 / X-119 card registry (one component per `cards.type`); 05-3 §5.22–§5.24 are the M2 cards. Every other
// type keeps the M1 placeholder (its title in the card frame) until its milestone (05: M5 and later). M5 (CR-0009): choice,
// tiles, approval, draft and secret (stubs from T1; T2, T4, T5, T6 fill them).
import type { CardRow } from '../../shared/types';
import { Approval } from './Approval';
import type { CardTime } from './CardFrame';
import { Choice } from './Choice';
import { Draft } from './Draft';
import { FileCard } from './FileCard';
import { LinkPreview } from './LinkPreview';
import { OptionTiles } from './OptionTiles';
import { PlaceCard } from './PlaceCard';
import { SecretBox } from './SecretBox';
import { TableCard } from './TableCard';

export { hasCardView, M2_CARD_TYPES, M5_CARD_TYPES } from './cardViews';

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
    case 'choice':
      return <Choice card={card} time={time} />;
    case 'tiles':
      return <OptionTiles card={card} time={time} />;
    case 'approval':
      return <Approval card={card} time={time} />;
    case 'draft':
      return <Draft card={card} time={time} />;
    case 'secret':
      return <SecretBox card={card} time={time} />;
    default:
      return null;
  }
}
