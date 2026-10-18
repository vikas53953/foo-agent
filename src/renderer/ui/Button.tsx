// Spec: 06 §0.4 (Button: variants and sizes; text buttons are pills, `--r-full`), 02 F7 (press scale 0.97 for `--m-fast`),
// 02 F5 / U-5 (every clickable thing has a hit area ≥ 40 × 40: the `sm` 32px visual sits inside a 40px box), 02-3 §F26
// (disabled = aria-disabled, stays focusable when it has a tooltip). Variants: `outline` (pill with a 1px border:
// "+ New helper", banner actions), `primary`, `subtle`, `link`; M2 adds `destructive` (06 §0.4: `--bad` fill, `--on-bad`
// text) and `secondary` (06 §0.4: 1px `--line-strong` edge) for the C-24…C-26 dialogs and popovers.
import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'outline' | 'primary' | 'subtle' | 'link' | 'destructive' | 'secondary';
export type ButtonTone = 'neutral' | 'accent' | 'warn' | 'bad';

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Text and border colour of an outline button (banner types, 03-shell-1 §3.3.1). */
  tone?: ButtonTone;
  icon?: IconName;
  children: ReactNode;
}

export function Button({
  variant = 'outline',
  size = 'sm',
  tone = 'neutral',
  icon,
  children,
  className,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        styles.button,
        variant === 'secondary' ? cx(styles.outline, styles.strong) : styles[variant],
        styles[size],
        styles[`tone_${tone}`],
        className,
      )}
      aria-disabled={disabled || undefined}
      onClick={disabled ? (e) => e.preventDefault() : onClick}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
