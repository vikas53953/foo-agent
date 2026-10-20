// Spec: 04 §13.5 (kit `Stepper`: a number with + and −; two-way controls write the surface's data model, so every part
// bound to the same path updates at once), 06 §0.4 (fields: --field-h), 02 §F19.1 (en-IN numbers, U+2212 minus), CR-0022
// AT-342 (+ / − and arrow keys change the value within min/max), X-180. R1 T4.
import type { KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { formatValue } from './LineChart';
import styles from './NumbersForms.module.css';

/** The next value one step up or down, kept inside min/max and rounded to the step's decimals (no 0.30000000000000004). */
export function stepValue(value: number, dir: 1 | -1, min: number, max: number, step = 1): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const next = Number((value + dir * step).toFixed(decimals));
  return Math.min(max, Math.max(min, next));
}

/** WAI-ARIA spinbutton keys: up/right one step, down/left one step back, Home and End jump to min and max. */
const KEYS: Record<string, (v: number, p: StepperProps) => number> = {
  ArrowUp: (v, p) => stepValue(v, 1, p.min, p.max, p.step),
  ArrowRight: (v, p) => stepValue(v, 1, p.min, p.max, p.step),
  ArrowDown: (v, p) => stepValue(v, -1, p.min, p.max, p.step),
  ArrowLeft: (v, p) => stepValue(v, -1, p.min, p.max, p.step),
  Home: (_, p) => p.min,
  End: (_, p) => p.max,
};

export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Null when the value is a literal (A2UI: literals are read-only). */
  onChange: ((v: number) => void) | null;
}

export function Stepper(p: StepperProps) {
  const { label, min, max, onChange } = p;
  const value = Math.min(max, Math.max(min, p.value));
  const set = (v: number) => v !== value && onChange?.(v);
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    const move = KEYS[e.key];
    if (!move || !onChange) return;
    e.preventDefault();
    set(move(value, p));
  };
  return (
    <div className={styles.piece} data-testid={TID.kitStepper}>
      <span className={styles.label} data-copy="ai">
        {label}
      </span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.step}
          aria-label={t('kit.stepper.decrease', { label })}
          disabled={!onChange || value <= min}
          onClick={() => set(stepValue(value, -1, min, max, p.step))}
        >
          −
        </button>
        <span
          role="spinbutton"
          tabIndex={onChange ? 0 : -1}
          className={`${styles.number} ${styles.spin}`}
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={formatValue(value)}
          aria-readonly={!onChange || undefined}
          onKeyDown={onKey}
        >
          {formatValue(value)}
        </span>
        <button
          type="button"
          className={styles.step}
          aria-label={t('kit.stepper.increase', { label })}
          disabled={!onChange || value >= max}
          onClick={() => set(stepValue(value, 1, min, max, p.step))}
        >
          +
        </button>
      </div>
    </div>
  );
}
