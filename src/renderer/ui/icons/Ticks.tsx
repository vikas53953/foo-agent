// Spec: 02 F6 (ticks are custom SVGs, not Fluent: TickSingle and TicksDouble, 16×11, 1.5 stroke, the double offset 4),
// 04 §3.3 (tick states; colour comes from the parent: `--fg-3`, `--tick-read` when read).
import styles from '../Icon.module.css';

const VIEW = '0 0 16 11';

export function TickSingle({ className }: { className?: string }) {
  return (
    <svg className={`${styles.icon} ${className ?? ''}`} width="16" height="11" viewBox={VIEW} aria-hidden="true" focusable="false">
      <path d="M2.5 6 5.5 9 12.5 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TicksDouble({ className }: { className?: string }) {
  return (
    <svg className={`${styles.icon} ${className ?? ''}`} width="16" height="11" viewBox={VIEW} aria-hidden="true" focusable="false">
      <path d="M0.75 6 3.75 9 10.75 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.75 6 7.75 9 14.75 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
