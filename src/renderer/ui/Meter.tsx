// Spec: 03-shell-2 §3.7.3.4 (the spend meter: --meter-h bar, --r-full, --bg-sunken track; fill --accent, 80–99 % --warn,
// ≥ 100 % --bad). Decoration: the row around it carries role="meter" and its values.
import styles from './Meter.module.css';

export interface MeterProps {
  value: number;
  max: number;
  tone: 'accent' | 'warn' | 'bad';
}

export function Meter({ value, max, tone }: MeterProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className={styles.meter} aria-hidden="true" data-state={tone}>
      <span className={styles.fill} style={{ width: `${pct}%` }} />
    </span>
  );
}
