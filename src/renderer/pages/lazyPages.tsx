// Spec: 10-acceptance-2 §C.8 AT-322 (the renderer entry chunk ≤ 500 KB minified; a lazily loaded page shows its skeleton
// within 150ms), 06 §0.5 Loading (static skeleton rows once data is not ready within 150ms), CR-0021 (P1 T10). Settings and
// Memory leave the first script: each loads on first open (or earlier, when the window is idle after launch) behind a
// page frame that turns into the §0.5 skeleton at `delay-loading`.
import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import { Skeleton } from '../ui/Skeleton';
import styles from './PageLoading.module.css';

const loadMemory = () => import('../screens/Memory');
const loadSettings = () => import('../screens/settings/SettingsPage');

const LazyMemory = lazy(() => loadMemory().then((m) => ({ default: m.MemoryPage })));
const LazySettings = lazy(() => loadSettings().then((m) => ({ default: m.SettingsPage })));

type MemoryProps = ComponentProps<typeof import('../screens/Memory').MemoryPage>;
type SettingsProps = ComponentProps<typeof import('../screens/settings/SettingsPage').SettingsPage>;

export function MemoryPage(props: MemoryProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazyMemory {...props} />
    </Suspense>
  );
}

export function SettingsPage(props: SettingsProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LazySettings {...props} />
    </Suspense>
  );
}

/** Fetches the page scripts ahead of the first open, once launch work is done; a failed fetch retries on open. */
export function preloadPages(): void {
  void loadMemory().catch(() => undefined);
  void loadSettings().catch(() => undefined);
}

/** The page frame while its script loads: empty at first, the §0.5 skeleton once `delay-loading` (150ms) has passed. */
export function PageLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), motion['delay-loading']);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={styles.page} aria-busy="true">
      {slow && (
        <div data-testid={TID.screenLoading} className={styles.column} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.row}>
              <Skeleton shape="bar" width="70%" />
              <Skeleton shape="bar" width="30%" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
