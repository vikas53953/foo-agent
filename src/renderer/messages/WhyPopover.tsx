// Spec: 04 §19.6 ("Why am I getting this?" popover: reason by source, "Stop these" / "Keep them"). Loaded on first open
// from AnswerExtras (AT-322 first-script budget).
import { formatDate } from '../../shared/format';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { MessageWhy } from '../../shared/types';
import { invoke } from '../ipc/client';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import styles from './Bubble.module.css';

export function whyReason(why: MessageWhy, o: { timeZone: string; now: number }): string {
  const v = why.vars;
  const date = v.at ? formatDate(Number(v.at), 'date', o) : (v.date ?? '');
  switch (why.source) {
    case 'routine_asked':
      return t('bubble.why.reason.routine_asked', { date, title: v.title ?? '' });
    case 'routine_suggested':
      return t('bubble.why.reason.routine_suggested', { date, title: v.title ?? '' });
    case 'suggestion':
      return t('bubble.why.reason.suggestion', { what: v.what ?? '' });
    case 'habit_offer':
      return t('bubble.why.reason.habit_offer', { count: Number(v.count ?? 0) });
    case 'housekeeping':
      return t('bubble.why.reason.housekeeping');
    case 'cap_warning':
      return t('bubble.why.reason.cap_warning');
  }
}

// GAP: GAPS.md 2026-10-17 "Stop these has no setting for every reason"
/**
 * What "Stop these" can do in M2 (GAPS.md): a routine is paused with routine:pause; the cap warning turns
 * `money.warnAt80` off. Suggestion kinds, habit offers and housekeeping messages have no settings keys or channel yet, so
 * their Stop only closes the popover with the caption.
 */
async function stopSource(why: MessageWhy): Promise<boolean> {
  if ((why.source === 'routine_asked' || why.source === 'routine_suggested') && why.routineId) {
    return (await invoke('routine:pause', { routineId: why.routineId })).ok;
  }
  if (why.source === 'cap_warning') return (await invoke('settings:set', { path: 'money.warnAt80', value: false })).ok;
  return true;
}

export function WhyPopover({
  anchor,
  why,
  timeZone,
  now,
  onClose,
  onStopped,
}: {
  anchor: HTMLElement;
  why: MessageWhy;
  timeZone: string;
  now: number;
  onClose: () => void;
  onStopped: () => void;
}) {
  return (
    <Popover anchor={anchor} label={t('bubble.why.title')} tid="bubbleWhyPopover" autoFocus onClose={onClose}>
      <div className={styles.popTitle}>{t('bubble.why.title')}</div>
      <p className={styles.popBody}>{whyReason(why, { timeZone, now })}</p>
      <div className={styles.popButtons}>
        <Button
          variant="secondary"
          size="md"
          data-testid={TID.bubbleWhyStop}
          onClick={() => {
            onClose();
            void stopSource(why).then((ok) => ok && onStopped());
          }}
        >
          {t('bubble.why.stop')}
        </Button>
        <Button variant="primary" size="md" data-testid={TID.bubbleWhyKeep} onClick={onClose}>
          {t('bubble.why.keep')}
        </Button>
      </div>
    </Popover>
  );
}
