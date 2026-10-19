// Spec: 08-5 §4.1 SetupCardPayload (card type `setup`, X-119: welcome, ai_finder, name, face, apps; root `card-setup` with
// `data-row-id` = `setupCard`). The AI step (CR-0020) draws `ai_finder`; the other first-run cards are M12's and keep no view.
import type { CardRow, SetupCardPayload } from '../../../shared/types';
import type { CardTime } from '../CardFrame';
import { AiFinder } from './AiFinder';

export function SetupCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SetupCardPayload;
  return p.setupCard === 'ai_finder' ? <AiFinder card={card} time={time} /> : null;
}
