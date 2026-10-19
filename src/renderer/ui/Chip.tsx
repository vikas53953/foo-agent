// Spec: 06 §0.4 Chip (filter: height 32, padding 0 12px, `--r-full`, `--t-caption`; rest `--bg-sunken` `--fg-1`; selected
// `--accent-soft` `--accent` with a leading `Checkmark` 16), 06-2 §7.3 (single-select filter chips; the removable
// "Last 7 days ✕" chip). 08-0 §E.3 component name.
import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import styles from './Chip.module.css';

export interface ChipProps extends Omit<ComponentProps<'button'>, 'onClick'> {
  selected?: boolean;
  /** A removable chip ends with `Dismiss` 16; `removeLabel` is its accessible name. */
  removeLabel?: string;
  onClick: () => void;
}

export function Chip({ selected = false, removeLabel, className, children, onClick, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(styles.chip, selected && styles.selected, className)}
      aria-pressed={removeLabel ? undefined : selected}
      aria-label={removeLabel}
      onClick={onClick}
    >
      {selected && !removeLabel && <Icon name="Checkmark" size={16} />}
      <span>{children}</span>
      {removeLabel && <Icon name="Dismiss" size={16} />}
    </button>
  );
}
