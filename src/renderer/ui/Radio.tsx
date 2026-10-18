// Spec: 06 §0.4 Radio (20px circle, hit area padded to 40×40; 1px `--line-input`; selected 1px `--accent` border and a
// 10px `--accent` dot; hover border `--fg-3`; pressed `--bg-pressed`; ring; disabled `--fg-disabled`), 02-3 §F26
// (data-state), §F27.1 (cursor `default`). A native radio keeps arrow-key movement inside its `name` group.
import type { ComponentProps } from 'react';
import { cx } from './cx';
import styles from './Radio.module.css';

export interface RadioProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'checked' | 'size'> {
  name: string;
  checked: boolean;
  /** Called when this radio becomes the chosen one. */
  onSelect: () => void;
  label?: string;
}

export function Radio({ checked, onSelect, label, disabled, className, ...rest }: RadioProps) {
  return (
    <label className={cx(styles.radio, disabled && styles.disabled, className)} data-state={checked ? 'checked' : 'unchecked'}>
      <input
        {...rest}
        type="radio"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (e.currentTarget.checked) onSelect();
        }}
      />
      <span className={styles.circle} aria-hidden="true" />
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
