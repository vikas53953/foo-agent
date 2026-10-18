// Spec: 06 §0.4 Toggle (track `--toggle-w` 40 × `--toggle-h` 20, `--r-full`; off `--bg-sunken` + 1px `--line-input`, knob
// 12px `--fg-2` at left 4px; on `--accent`, knob 14px `--on-accent` at right 3px; hover border `--fg-3` / `--accent-hover`;
// pressed knob +4px; disabled knob `--fg-disabled`, no 40 % opacity), 06 §0.8 (`role="switch"` + `aria-checked`), 02-3
// §F26 (disabled = aria-disabled; state in data-state), §F27.1 (cursor `default`). Enter and Space flip it.
import type { ComponentProps, KeyboardEvent } from 'react';
import { cx } from './cx';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<ComponentProps<'button'>, 'onChange' | 'children' | 'role'> {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name when no visible label names it (a settings row names it with aria-labelledby). */
  label?: string;
}

/** The keys that flip a switch (Space, and Enter like every button). */
export function togglesOnKey(key: string): boolean {
  return key === ' ' || key === 'Enter';
}

export function Toggle({ checked, onChange, label, disabled, className, onKeyDown, ...rest }: ToggleProps) {
  const flip = () => {
    if (!disabled) onChange(!checked);
  };
  const keyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !togglesOnKey(e.key)) return;
    e.preventDefault();
    flip();
  };
  return (
    <button
      type="button"
      {...rest}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-state={checked ? 'on' : 'off'}
      className={cx(styles.toggle, className)}
      onClick={flip}
      onKeyDown={keyDown}
    >
      <span className={styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  );
}
