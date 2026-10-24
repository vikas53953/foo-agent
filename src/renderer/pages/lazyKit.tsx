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
type SpendCapModule = typeof import('../cards/SpendCap');
type SignInModule = typeof import('../cards/SignIn');

let kitBlock: KitBlockModule | null = null;
let pageBlock: PageBlockModule | null = null;
let kitCard: KitCardModule | null = null;
let aiPageCard: AiPageCardModule | null = null;
let keptView: KeptViewModule | null = null;
let spendCap: SpendCapModule | null = null;
let signIn: SignInModule | null = null;
const loadKitBlock = () => import('../kit/KitBlock').then((m) => (kitBlock = m));
const loadPageBlock = () => import('../page/PageBlock').then((m) => (pageBlock = m));
const loadKitCard = () => import('../kit/KitCard').then((m) => (kitCard = m));
const loadAiPageCard = () => import('../page/AiPageCard').then((m) => (aiPageCard = m));
const loadKeptView = () => import('../keep/KeptView').then((m) => (keptView = m));
// The spend-cap card shows only once AI spend reaches the cap, so it leaves the first script too (AT-322 budget).
const loadSpendCap = () => import('../cards/SpendCap').then((m) => (spendCap = m));
// CR-0057: the Sign-in card shows only inside a job that reaches a sign-in page, so it leaves the first script as well.
const loadSignIn = () => import('../cards/SignIn').then((m) => (signIn = m));

const LazyKitBlock = lazy(() => loadKitBlock().then((m) => ({ default: m.KitBlock })));
const LazyPageBlock = lazy(() => loadPageBlock().then((m) => ({ default: m.PageBlock })));
const LazyKitCard = lazy(() => loadKitCard().then((m) => ({ default: m.KitCard })));
const LazyAiPageCard = lazy(() => loadAiPageCard().then((m) => ({ default: m.AiPageCard })));
const LazyKeptView = lazy(() => loadKeptView().then((m) => ({ default: m.KeptView })));
const LazySpendCap = lazy(() => loadSpendCap().then((m) => ({ default: m.SpendCap })));
const LazySignIn = lazy(() => loadSignIn().then((m) => ({ default: m.SignInCard })));

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

export function SpendCap(props: ComponentProps<SpendCapModule['SpendCap']>) {
  const [loaded] = useState(() => spendCap);
  if (loaded) return <loaded.SpendCap {...props} />;
  return (
    <Suspense fallback={null}>
      <LazySpendCap {...props} />
    </Suspense>
  );
}

export function SignInCard(props: ComponentProps<SignInModule['SignInCard']>) {
  const [loaded] = useState(() => signIn);
  if (loaded) return <loaded.SignInCard {...props} />;
  return (
    <Suspense fallback={null}>
      <LazySignIn {...props} />
    </Suspense>
  );
}

/** Fetches the kit and page scripts once launch work is done (called beside preloadPages). */
export function preloadKit(): void {
  for (const load of [loadKitBlock, loadPageBlock, loadKitCard, loadAiPageCard, loadKeptView, loadSpendCap, loadSignIn])
    void load().catch(() => undefined);
}
