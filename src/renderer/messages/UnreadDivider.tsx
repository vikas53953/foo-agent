// Spec: 03-shell-2 §3.6.5 unread divider ("{n} new messages": 1px --accent line both sides of a centred --t-caption-strong
// --accent label, --s2 above and below; role="separator" named by the copy).
import { TID } from '../../shared/testids';
import styles from './UnreadDivider.module.css';

export function UnreadDivider({ label }: { label: string }) {
  return (
    <div className={styles.row} role="separator" aria-label={label} data-testid={TID.threadUnreadDivider}>
      <span className={styles.label} aria-hidden>
        {label}
      </span>
    </div>
  );
}
