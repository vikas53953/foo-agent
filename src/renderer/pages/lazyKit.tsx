// Spec: 04 §13.5 (kit surface), §13.6 (AI page), 10-acceptance-2 §C.8 AT-322 (the renderer's first script stays in its
// budget and holds no zod), CR-0022, X-180. The kit and the sealed page validate every message with the zod catalog, so
// they load lazily, the way P1 T10 loads Settings and Memory: once their script has arrived (the idle preload, or the first
// reply that holds a fence) they render in the same commit, with no fallback in between.
import { lazy, Suspense, useState, type ComponentProps } from 'react';

type KitBlockModule = typeof import('../kit/KitBlock');
type PageBlockModule = typeof import('../page/PageBlock');
type KitCardModule = typeof import('../kit/KitCard');
type AiPageCardModule = typeof import('../page/AiPageCard');
type KeptViewModule = typeof import('../keep/KeptView');

let kitBlock: KitBlockModule | null = null;
let pageBlock: PageBlockModule | null = null;
let kitCard: KitCardModule | null = null;
let aiPageCard: AiPageCardModule | null = null;
let keptView: KeptViewModule | null = null;
const loadKitBlock = () => import('../kit/KitBlock').then((m) => (kitBlock = m));
const loadPageBlock = () => import('../page/PageBlock').then((m) => (pageBlock = m));
const loadKitCard = () => import('../kit/KitCard').then((m) => (kitCard = m));
const loadAiPageCard = () => import('../page/AiPageCard').then((m) => (aiPageCard = m));
const loadKeptView = () => import('../keep/KeptView').then((m) => (keptView = m));

const LazyKitBlock = lazy(() => loadKitBlock().then((m) => ({ default: m.KitBlock })));
const LazyPageBlock = lazy(() => loadPageBlock().then((m) => ({ default: m.PageBlock })));
const LazyKitCard = lazy(() => loadKitCard().then((m) => ({ default: m.KitCard })));
const LazyAiPageCard = lazy(() => loadAiPageCard().then((m) => ({ default: m.AiPageCard })));
const LazyKeptView = lazy(() => loadKeptView().then((m) => ({ default: m.KeptView })));

export function KitBlock(props: ComponentProps<KitBlockModule['KitBlock']>) {
  const [loaded] = useState(() => kitBlock);
  if (loaded) return <loaded.KitBlock {...props} />;
  return (
    <Suspense fallback={null}>
      <LazyKitBlock {...props} />
    </Suspense>
  );
}

export function PageBlock(props: ComponentProps<PageBlockModule['PageBlock']>) {
  const [loaded] = useState(() => pageBlock);
  if (loaded) return <loaded.PageBlock {...props} />;
  return (
    <Suspense fallback={null}>
      <LazyPageBlock {...props} />
    </Suspense>
  );
}

export function KitCard(props: ComponentProps<KitCardModule['KitCard']>) {
  const [loaded] = useState(() => kitCard);
  if (loaded) return <loaded.KitCard {...props} />;
  return (
    <Suspense fallback={null}>
      <LazyKitCard {...props} />
    </Suspense>
  );
}

export function AiPageCard(props: ComponentProps<AiPageCardModule['AiPageCard']>) {
  const [loaded] = useState(() => aiPageCard);
  if (loaded) return <loaded.AiPageCard {...props} />;
  return (
    <Suspense fallback={null}>
      <LazyAiPageCard {...props} />
    </Suspense>
  );
}

export function KeptView(props: ComponentProps<KeptViewModule['KeptView']>) {
  const [loaded] = useState(() => keptView);
  if (loaded) return <loaded.KeptView {...props} />;
  return (
    <Suspense fallback={null}>
      <LazyKeptView {...props} />
    </Suspense>
  );
}

/** Fetches the kit and page scripts once launch work is done (called beside preloadPages). */
export function preloadKit(): void {
  for (const load of [loadKitBlock, loadPageBlock, loadKitCard, loadAiPageCard, loadKeptView]) void load().catch(() => undefined);
}
