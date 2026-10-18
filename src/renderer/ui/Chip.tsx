// Spec: 06 §0.4 Chip (filter / multi-select: `sm` 32 with `--t-caption`, `lg` 40 with `--t-body` (first-run answers),
// padding 0 12px, `--r-full`; rest `--bg-sunken` `--fg-1`, hover `--bg-hover`, pressed `--bg-pressed`, ring, disabled
// `--fg-disabled`; selected `--accent-soft` + `--accent` text + leading `Checkmark` 16), 08-0 §E.3 (props `size`,
// `selected`, optional `onRemove` → IconButton xs: 24 visual, 16 icon, hit 40), 02-3 §F26 (aria-pressed, data-state),
// §F27.1 (cursor `default`). The remove button sits beside the chip button, never inside it. Test ids come from TID by key.
import { TID } from '../../shared/testids';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import styles from './Chip.module.css';

export interface ChipProps {
  label: string;
  size?: 'sm' | 'lg';
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Shows the xs remove button; `removeLabel` is its accessible name (the screen's copy). */
  onRemove?: () => void;
  removeLabel?: string;
  tid?: keyof typeof TID;
  removeTid?: keyof typeof TID;
}

export function Chip({ label, size = 'sm', selected = false, disabled, onClick, onRemove, removeLabel, tid, removeTid }: ChipProps) {
  return (
    <span className={cx(styles.chip, styles[size], selected && styles.selected, disabled && styles.disabled)}>
      <button
        type="button"
        className={styles.main}
        aria-pressed={onClick ? selected : undefined}
        aria-disabled={disabled || undefined}
        data-state={selected ? 'selected' : 'idle'}
        {...(tid ? { 'data-testid': TID[tid] } : {})}
        onClick={disabled ? (e) => e.preventDefault() : onClick}
      >
        {selected && <Icon name="Checkmark" size={16} />}
        <span className={styles.label}>{label}</span>
      </button>
      {onRemove && (
        <IconButton
          icon="Dismiss"
          iconSize={16}
          label={removeLabel ?? label}
          className={styles.remove}
          disabled={disabled}
          {...(removeTid ? { 'data-testid': TID[removeTid] } : {})}
          onClick={onRemove}
        />
      )}
    </span>
  );
}
