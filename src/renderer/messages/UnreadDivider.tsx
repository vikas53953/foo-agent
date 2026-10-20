// Spec: 03-shell-2 §3.6.5 unread divider ("{n} new messages": 1px --accent line both sides of a centred --t-caption-strong
// --accent label, --s2 above and below; role="separator" named by the copy), 02 §F7.1 (CR-0021: the line slides in from the
// left, once per chat and count, not again on scroll-back).
import { TID } from '../../shared/testids';
import { useOneShot } from './oneShot';
import styles from './UnreadDivider.module.css';

export function UnreadDivider({ label, playKey }: { label: string; playKey: string }) {
  const slide = useOneShot(playKey, true, true);
  return (
    <div className={styles.row} role="separator" aria-label={label} data-testid={TID.threadUnreadDivider} data-slide={slide || undefined}>
      <span className={styles.label} aria-hidden>
        {label}
      </span>
    </div>
  );
}
