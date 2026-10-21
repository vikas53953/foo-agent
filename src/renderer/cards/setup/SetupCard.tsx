// Spec: 08-5 §4.1 SetupCardPayload (card type `setup`, X-119: welcome, ai_finder, name, face, apps; root `card-setup` with
// `data-row-id` = `setupCard`). The AI step (CR-0020) draws `ai_finder`; CR-0026 draws `welcome`, `name` and `face`; `apps` is
// P2 T4's and keeps no view. The first-run cards load as their own script (the P1 first-script budget, AT-322): a first
// launch asks for it at once, and preloadPages warms it on every other launch, where the cards only show answered.
import { lazy, Suspense, useState } from 'react';
import type { CardRow, SetupCardPayload } from '../../../shared/types';
import type { CardTime } from '../CardFrame';
import { AiFinder } from './AiFinder';

type FirstRunModule = typeof import('./FirstRunCards');
let firstRunModule: FirstRunModule | null = null;
export const loadFirstRun = () => import('./FirstRunCards').then((m) => (firstRunModule = m));
const LazyFirstRun = lazy(() =>
  loadFirstRun().then((m) => ({
    default: ({ which, card, time }: FirstRunProps) => {
      const View = which === 'welcome' ? m.WelcomeCard : which === 'name' ? m.NameCard : m.FaceCard;
      return <View card={card} time={time} />;
    },
  })),
);
type FirstRunProps = { which: 'welcome' | 'name' | 'face'; card: CardRow; time: CardTime };

function FirstRun(props: FirstRunProps) {
  // Chosen once per mount, as lazyPages does: a card that mounted behind Suspense stays there when its script arrives.
  const [loaded] = useState(() => firstRunModule);
  if (loaded) {
    const View = props.which === 'welcome' ? loaded.WelcomeCard : props.which === 'name' ? loaded.NameCard : loaded.FaceCard;
    return <View card={props.card} time={props.time} />;
  }
  return (
    <Suspense fallback={null}>
      <LazyFirstRun {...props} />
    </Suspense>
  );
}

export function SetupCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SetupCardPayload;
  switch (p.setupCard) {
    case 'ai_finder':
      return <AiFinder card={card} time={time} />;
    case 'welcome':
    case 'name':
    case 'face':
      return <FirstRun which={p.setupCard} card={card} time={time} />;
    default:
      return null;
  }
}
