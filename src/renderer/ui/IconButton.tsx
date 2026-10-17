// Spec: 02 F5 `--icon-btn` 36 visual, U-5 hit 40 (Blueprint "round 36 · hit 40"), 03-shell-2 §3.9.5 (icon-only buttons:
// `button` role, name = aria-label, always a tooltip with the shortcut), 06 §0.11 (IconButton sizes; `sm` 16 icon),
// 02-3 §F26 (pressed toggles carry aria-pressed; state in data-state).
import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Tooltip';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: IconName;
  /** The accessible name (03-shell-2 §3.9.5). */
  label: string;
  tooltip?: string;
  iconSize?: 16 | 20;
  /** A toggle that is on shows the Filled icon (02 F6, X-28). */
  pressed?: boolean;
  tooltipSide?: 'bottom' | 'top';
}

export function IconButton({
  icon,
  label,
  tooltip,
  iconSize = 20,
  pressed,
  tooltipSide,
  className,
  disabled,
  onClick,
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      type="button"
      {...rest}
      className={cx(styles.button, className)}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={disabled ? (e) => e.preventDefault() : onClick}
    >
      <Icon name={icon} size={iconSize} filled={pressed === true} />
    </button>
  );
  return tooltip ? (
    <Tooltip text={tooltip} side={tooltipSide} className={styles.tipAnchor}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
