// Spec: 05 §0.1 / CR-0022 §(b) (card type `kit`: a kit surface the engine posts as its own card, e.g. from a job; states
// shown | kept), 04 §13.5 (the surface inside is drawn exactly as in a reply; its actions name the card, not a message),
// 05-1 §0.2 (card frame), X-180. R1 T2. Payload: `{ body: string }`, the A2UI messages as an ```a2ui fence holds them.
// R1 T7: Keep under the surface; a kept card (state `kept`) says "Kept" (CR-0022 pick 9).
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { CardRow } from '../../shared/types';
import { KitDropped, KitSurface } from './KitSurface';
import { useFenceSurfaces } from './model';
import { useStore } from '../store/index';
import { selectAgentName } from '../store/settings';
import { cx } from '../ui/cx';
import type { CardTime } from '../cards/CardFrame';
import card_ from '../cards/Card.module.css';

export function KitCard({ card }: { card: CardRow; time: CardTime }) {
  const agentName = useStore(selectAgentName);
  const body = typeof card.payload.body === 'string' ? card.payload.body : '';
  // A card's surface draws alone: later replies update surfaces of messages, not of cards (the card id is its host).
  const { surfaces, dropped } = useFenceSurfaces('', card.id, body, false);
  return (
    <div
      className={cx(card_.card, card_.wide)}
      data-testid={TID.cardKit}
      data-card-id={card.id}
      data-card-type={card.type}
      data-card-state={card.state}
      data-state={card.state}
      role="group"
      aria-label={t('kit.surface.accessible_name', { agentName })}
    >
      {surfaces.map((s, i) => (
        <KitSurface
          key={s.id}
          surface={s}
          host={{ chatId: card.chatId, cardId: card.id }}
          agentName={agentName}
          blockDropped={i === surfaces.length - 1 ? dropped : 0}
          keep={{ kept: card.state === 'kept' }}
        />
      ))}
      {surfaces.length === 0 && dropped > 0 && <KitDropped />}
    </div>
  );
}
