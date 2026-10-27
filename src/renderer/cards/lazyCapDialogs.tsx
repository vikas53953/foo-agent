// Spec: 06-3 §14 C-21 (the Raise-cap dialog, opened from the Spend-cap, Error and Plan cards) and 06-1 §2.2 (the AI
// finder's cap dialog), 10-acceptance-2 §C.8 AT-322: CR-0060 moves both dialogs' scripts out of the first script; each loads
// on its first open (or when the window is idle, with the pages) and the dialog mounts once it has arrived.
import { lazy, Suspense, type ComponentProps } from 'react';

type RaiseModule = typeof import('./RaiseCapDialog');
type SetupModule = typeof import('./setup/CapDialog');

export const loadCapDialogs = (): Promise<[RaiseModule, SetupModule]> =>
  Promise.all([import('./RaiseCapDialog'), import('./setup/CapDialog')]);
const LazyRaise = lazy(() => import('./RaiseCapDialog').then((m) => ({ default: m.RaiseCapDialog })));
const LazySetup = lazy(() => import('./setup/CapDialog').then((m) => ({ default: m.CapDialog })));

export function RaiseCapDialog(props: ComponentProps<RaiseModule['RaiseCapDialog']>) {
  return (
    <Suspense fallback={null}>
      <LazyRaise {...props} />
    </Suspense>
  );
}

export function CapDialog(props: ComponentProps<SetupModule['CapDialog']>) {
  return (
    <Suspense fallback={null}>
      <LazySetup {...props} />
    </Suspense>
  );
}
