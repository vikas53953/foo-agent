// Spec: 03-shell-1 §3.4.5 status pill (height 20: `--t-caption-strong` without uppercase + 2px padding; padding 0 `--s1`;
// `--r-full`; Needs you `--warn-soft`/`--warn`, Paused `--bg-sunken`/`--fg-2`, Working `--accent-soft`/`--accent`,
// Done `--ok-soft`/`--ok`), §3.4.7 high contrast (1px CanvasText border + the word). State is in data-state (02-3 §F26).
import type { ChatPill } from '../../shared/types';
import { cx } from './cx';
import styles from './Pill.module.css';

export interface PillProps {
  state: ChatPill;
  label: string;
  className?: string;
  'data-testid'?: string;
}

export function Pill({ state, label, className, ...rest }: PillProps) {
  return (
    <span className={cx(styles.pill, styles[state], className)} data-state={state} {...rest}>
      {label}
    </span>
  );
}
