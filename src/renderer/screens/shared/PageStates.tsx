// Spec: 06 §0.5 Common states every Page, Dialog and Overlay ships: First time / Empty (the EmptyState block, `data-state`
// first_time / empty / filter_empty), Loading (nothing for 150ms, then static skeleton rows of `--bg-sunken` `--r-xs`
// at real row heights, no shimmer; after 2s one line "Still loading…" `--t-small` `--fg-3`; `screen-loading`), Error (the
// C16 shape: what happened, what is safe, one fix button, in the content column; no paths, no codes; `screen-error`).
// One switch over those states; `ready` draws the children.
import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { Button } from '../../ui/Button';
import { EmptyState, type EmptyStateProps } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { Skeleton } from '../../ui/Skeleton';
import { startLoadingClock, type LoadingPhase } from './loadingClock';
import styles from './PageStates.module.css';

export type PageState = 'ready' | 'loading' | 'error' | 'first_time' | 'empty' | 'filter_empty';

export interface PageError {
  whatHappened: string;
  whatIsSafe: string;
  action: { label: string; onClick: () => void };
}

export interface PageStatesProps {
  state: PageState;
  /** The empty-state block for first_time / empty / filter_empty (its `state` comes from `state`). */
  empty?: Omit<EmptyStateProps, 'state'>;
  error?: PageError;
  /** How many skeleton rows, and their height (a token, e.g. "var(--s9)"); default 3 settings-row heights. */
  skeletonRows?: number;
  rowHeight?: string;
  children?: ReactNode;
}

export function PageStates({ state, empty, error, skeletonRows, rowHeight, children }: PageStatesProps) {
  switch (state) {
    case 'ready':
      return <>{children}</>;
    case 'loading':
      return <Loading rows={skeletonRows ?? 3} rowHeight={rowHeight} />;
    case 'error':
      return error ? <ErrorBlock {...error} /> : null;
    default:
      return empty ? <EmptyState {...empty} state={state} /> : null;
  }
}

function Loading({ rows, rowHeight }: { rows: number; rowHeight?: string }) {
  const [phase, setPhase] = useState<LoadingPhase>('wait');
  useEffect(() => startLoadingClock(setPhase), []);
  if (phase === 'wait') return null;
  return (
    <div className={styles.loading} data-testid={TID.screenLoading} data-state={phase} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} shape="bar" width="100%" height={rowHeight ?? 'calc(var(--s8) + var(--s1))'} />
      ))}
      {phase === 'still' && (
        <p className={styles.still} role="status">
          {t('screen.common.still_loading')}
        </p>
      )}
    </div>
  );
}

function ErrorBlock({ whatHappened, whatIsSafe, action }: PageError) {
  return (
    <div className={styles.error} data-testid={TID.screenError} role="alert">
      <Icon name="ErrorCircle" size={20} className={styles.errorIcon} />
      <div className={styles.errorText}>
        <p className={styles.what}>{whatHappened}</p>
        <p className={styles.safe}>{whatIsSafe}</p>
        <Button variant="secondary" size="md" onClick={action.onClick}>
          {action.label}
        </Button>
      </div>
    </div>
  );
}
