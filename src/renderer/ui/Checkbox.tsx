// Spec: 06 §0.4 Checkbox (20×20 box, `--r-xs`, hit area padded to 40×40; 1.5px `--line-input` on `--bg-app`; checked
// `--accent` with `Checkmark` 16 `--on-accent`; hover border `--fg-3`; pressed `--bg-pressed`; ring around the box;
// disabled border `--fg-disabled`), 02-3 §F26 (state in data-state), §F27.1 (cursor `default`). A native checkbox keeps
// Space and Narrator behaviour; the optional label sits to the right and is part of the hit area.
import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'checked' | 'size'> {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label, disabled, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.checkbox, disabled && styles.disabled, className)} data-state={checked ? 'checked' : 'unchecked'}>
      <input
        {...rest}
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className={styles.box} aria-hidden="true">
        {checked && <Icon name="Checkmark" size={16} className={styles.mark} />}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
