// Spec: 02 F7 (the ring spinner: `size` 16 | 20 | 24, --accent arc on --line), 02-3 §F25.4 (reduced motion: no spin),
// §F25.2 (a labelled spinner is a progressbar; an unlabelled one is decoration).
import { cx } from './cx';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  size: 16 | 20 | 24;
  label?: string;
  className?: string;
}

export function Spinner({ size, label, className }: SpinnerProps) {
  return (
    <span
      className={cx(styles.spinner, styles[`s${size}`], className)}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
