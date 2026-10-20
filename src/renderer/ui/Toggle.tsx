// Spec: 06 §0.4 Toggle (track `--toggle-w` 40 × `--toggle-h` 20, `--r-full`; off: `--bg-sunken`, 1px `--line-input`, knob 12
// `--fg-2` at left 4px; on: `--accent`, knob 14 `--on-accent` at right 3px; hover border `--fg-3` / `--accent-hover`; pressed
// knob +4px wide; focus ring on the track; disabled `--bg-sunken` track, `--fg-disabled` knob; the row is the hit area),
// 06 §0.8 (`role="switch"` + `aria-checked`, name = row label). 08-0 §E.3 component name. M8 T3 (first user: 06-2 §6.8).
import type { ComponentProps } from 'react';
import { cx } from './cx';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<ComponentProps<'button'>, 'onChange' | 'role'> {
  checked: boolean;
  /** The row label (06 §0.8). */
  label: string;
  onChange: (on: boolean) => void;
}

export function Toggle({ checked, label, className, onChange, disabled, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      {...rest}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(styles.toggle, checked && styles.on, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
