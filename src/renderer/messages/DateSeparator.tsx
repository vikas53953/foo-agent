// Spec: 03-shell-2 §3.6.5 (date chip: centred, 24 high, padding 0 --s2, --r-full, --bg-sunken, --t-caption --fg-2, --s3
// above and below; role="separator" named by its copy; the sticky copy floats --s1 below the header, --bg-raised, 1px --line,
// --shadow-4, fades out --m-normal after --delay-sticky-hide, reduced motion hides at once; it is aria-hidden).
import { TID } from '../../shared/testids';
import styles from './DateSeparator.module.css';

export function DateSeparator({ label, index }: { label: string; index: number }) {
  return (
    <div className={styles.row} role="separator" aria-label={label} data-testid={TID.threadDate} data-index={index}>
      <span className={styles.chip} aria-hidden>
        {label}
      </span>
    </div>
  );
}

export function StickyDate({ label, shown }: { label: string; shown: boolean }) {
  return (
    <div className={styles.sticky} data-testid={TID.threadDateSticky} data-state={shown ? 'shown' : 'hidden'} aria-hidden>
      <span className={`${styles.chip} ${styles.stickyChip}`}>{label}</span>
    </div>
  );
}
