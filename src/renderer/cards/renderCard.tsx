// Spec: 02-2 §F13.3 / X-119 card registry (one component per `cards.type`), 05-1 §0.1 (`registry.ts` maps CardType →
// component: checklist→Checklist, plan→Plan, stuck→Stuck, error→ErrorCard, spend_cap→SpendCap, job_link→JobLink, …);
// 05-3 §5.22–§5.24 are the M2 cards, M4 adds the job cards (05-1 §5.2, 05-3 §5.12, §5.18.2, §5.19–§5.21). Every other type
// keeps the M1 placeholder (its title in the card frame) until its milestone (05: M5 and later). The height estimates stay in
// registry.ts; this map is the component half of the registry (implementation-notes "M4 T5"). M5 (CR-0009): choice, tiles,
// approval, draft and secret (stubs from T1; T2, T4, T5, T6 fill them). M9: §5.10 Sign-in.
import type { ComponentType } from 'react';
import type { CardRow, CardType } from '../../shared/types';
import type { CardTime } from './CardFrame';
import { Approval } from './Approval';
import { Checklist } from './Checklist';
import { Choice } from './Choice';
import { Draft } from './Draft';
import { ErrorCard } from './ErrorCard';
import { FileCard } from './FileCard';
import { JobLink } from './JobLink';
import { LinkPreview } from './LinkPreview';
import { OptionTiles } from './OptionTiles';
import { Plan } from './Plan';
import { PlaceCard } from './PlaceCard';
import { SecretBox } from './SecretBox';
import { SetupCard } from './setup/SetupCard';
import { SignInCard } from './SignIn';
import { SpendCap } from './SpendCap';
import { Stuck } from './Stuck';
import { TableCard } from './TableCard';
// M8
import { ConnectCard } from './Connect';

type CardComponent = ComponentType<{ card: CardRow; time: CardTime }>;

/** The card types built so far → their component; the rest are later milestones' (05). */
export const CARD_VIEWS: Partial<Record<CardType, CardComponent>> = {
  table: TableCard,
  file: FileCard,
  link_preview: LinkPreview,
  place: PlaceCard,
  checklist: Checklist,
  plan: Plan,
  stuck: Stuck,
  error: ErrorCard,
  spend_cap: SpendCap,
  job_link: JobLink,
  // M5 (CR-0009)
  choice: Choice,
  tiles: OptionTiles,
  approval: Approval,
  draft: Draft,
  secret: SecretBox,
  // AI step (CR-0020): the first-run AI finder (06-1 §2.2); the other setup cards are M12's.
  setup: SetupCard,
  // M8 T2: the Connect card (05-3 §5.11).
  connect: ConnectCard,
  // M9 T6: the Sign-in card (05-3 §5.10).
  signin: SignInCard,
};

/** G-M4-10: the purchase variant of the Spend-cap card is M10's; until then it keeps the placeholder. */
export const hasCardView = (type: CardType, card?: CardRow) =>
  !!CARD_VIEWS[type] &&
  !(type === 'spend_cap' && card?.payload.which === 'purchase') &&
  !(type === 'setup' && card?.payload.setupCard !== 'ai_finder');

export function CardView({ card, time }: { card: CardRow; time: CardTime }) {
  const View = CARD_VIEWS[card.type];
  return View ? <View card={card} time={time} /> : null;
}
