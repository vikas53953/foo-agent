// Spec: 03-shell-2 §3.6.6 (40 round button, --bg-raised, 1px --line, --shadow-4, ChevronDown 20 --fg-2; right --s3, bottom
// --s3 above the composer row; shown when more than one screen above the bottom, fading --m-normal; X-152 "↓ {n} new" pill
// with ChevronDown 16 + 4 gap, "99+" cap; Narrator "Go to newest message" / ", {n} new").
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../_m1b-stubs';
import styles from './JumpToLatest.module.css';
import { jumpCountLabel } from './stickToBottom';

export function JumpToLatest({ shown, count, onJump }: { shown: boolean; count: number; onJump: () => void }) {
  const n = jumpCountLabel(count);
  return (
    <button
      type="button"
      className={styles.button}
      data-testid={TID.threadJumpLatest}
      data-state={shown ? 'shown' : 'hidden'}
      data-count={count > 0 || undefined}
      aria-hidden={!shown || undefined}
      tabIndex={shown ? 0 : -1}
      aria-label={count > 0 ? t('thread.jump_latest.label_count', { count: n }) : t('thread.jump_latest.label')}
      title={count > 0 ? t('thread.jump_latest.label_count', { count: n }) : t('thread.jump_latest.label')}
      onClick={onJump}
    >
      <Icon name="ChevronDown" size={count > 0 ? 16 : 20} />
      {count > 0 && (
        <span data-testid={TID.threadJumpLatestCount} className={styles.count}>
          {t('thread.jump_latest.count', { count: n })}
        </span>
      )}
    </button>
  );
}
