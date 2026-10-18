// Spec: 06-2 §6.3 row `unprompted` (Stepper: [−] value [+], 32px buttons, value `--t-body-strong` tabular; [+] disabled at
// the max, [−] at the min, the value never goes beyond the range; AT-156), 08-0 §E.3 (Stepper is a primitive), 06 §0.4
// (Secondary 32 buttons pad their hit area to 40), 02-3 §F26 (disabled = aria-disabled). The value is announced through
// `role="status"`; the button names are the screen's copy.
import { cx } from './cx';
import styles from './Stepper.module.css';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** The row label (names the group). */
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  disabled?: boolean;
  className?: string;
}

/** `value + delta`, kept inside [min, max]. */
export function stepValue(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

export function Stepper({ value, min, max, onChange, label, decreaseLabel, increaseLabel, disabled, className }: StepperProps) {
  const shown = stepValue(value, 0, min, max);
  const atMin = disabled || shown <= min;
  const atMax = disabled || shown >= max;
  const step = (delta: number) => {
    const next = stepValue(shown, delta, min, max);
    if (next !== shown) onChange(next);
  };
  return (
    <div role="group" aria-label={label} className={cx(styles.stepper, className)} data-state={shown}>
      <button
        type="button"
        className={styles.button}
        aria-label={decreaseLabel}
        aria-disabled={atMin || undefined}
        data-step="down"
        onClick={() => !atMin && step(-1)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span className={styles.value} role="status">
        {shown}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label={increaseLabel}
        aria-disabled={atMax || undefined}
        data-step="up"
        onClick={() => !atMax && step(1)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
