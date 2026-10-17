// Spec: 03-shell-2 §3.6.7 (loading > 150 ms: 40 --bg-raised circle with the F7 ring 20 --accent, --s2 above the oldest
// message, Narrator "Loading older messages"; failure: system line "I couldn't load older messages." + "Try again"; start of
// history: the 04 §19.5 start_of_chat line, --t-caption --fg-3, 24 above the first date separator), 02-2 §F13.4.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button, Spinner } from '../_m1b-stubs';
import styles from './LoadOlder.module.css';

export function LoadOlder({ state, onRetry }: { state: 'idle' | 'loading' | 'failed'; onRetry: () => void }) {
  if (state === 'loading')
    return (
      <div className={styles.loading} data-testid={TID.threadLoadOlder} data-state="loading" role="status">
        <span className={styles.circle}>
          <Spinner size={20} label={t('thread.load_older.loading')} />
        </span>
      </div>
    );
  if (state === 'failed')
    return (
      <div className={styles.failed} data-testid={TID.threadLoadOlder} data-state="failed">
        <span>{t('thread.load_older.failed')}</span>
        <Button variant="link" size="sm" data-testid={TID.threadLoadOlderRetry} onClick={onRetry}>
          {t('thread.load_older.retry')}
        </Button>
      </div>
    );
  return null;
}

export function StartOfChat({ label, messageId }: { label: string; messageId?: string }) {
  return (
    <div className={styles.start} data-testid={TID.threadMarker} data-state="start_of_chat" data-message-id={messageId}>
      {label}
    </div>
  );
}
