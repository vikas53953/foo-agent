// Spec: 05-1 §0.2 (card frame: `--card-w` 440 or `--card-w-wide` 600, never wider than the column; `--bg-raised`, 1px
// `--line`, `--r-lg`, padding 12 / 14, rows 8 apart, header 22 with a 20px icon and a right label; time `--t-caption`
// `--fg-3` on the last row with the full-date tooltip, `card-time`; a container for container queries), §0.5 (whole-surface
// cards: `--shadow-4` and `--line-strong` on hover; focus ring follows `--r-lg`), §0.7 (Narrator: the card is a group named
// "{card name}: {title}"). M4: `data-card-id` / `data-card-type` (05-1 §0.1), the §0.5 status edge, Submitting and muted looks.
import type { KeyboardEvent, ReactNode } from 'react';
import type { CardRow } from '../../shared/types';
import { formatDate, formatTime } from '../../shared/format';
import { TID } from '../../shared/testids';
import { Tooltip } from '../ui/Tooltip';
import { cx } from '../ui/cx';
import styles from './Card.module.css';

export interface CardTime {
  at: number;
  timeZone: string;
  now: number;
}

export function CardTimeLabel({ at, timeZone, now }: CardTime) {
  return (
    <Tooltip text={formatDate(at, 'full', { timeZone, now })} className={styles.timeTip}>
      <span className={styles.time} data-testid={TID.cardTime} data-meta="">
        {formatTime(at, { timeZone })}
      </span>
    </Tooltip>
  );
}

export function CardFrame({
  tid,
  label,
  wide,
  state,
  children,
  className,
  card,
  edge,
  busy,
  muted,
  onKeyDown,
}: {
  tid: keyof typeof TID;
  label: string;
  wide?: boolean;
  state: string;
  children: ReactNode;
  className?: string;
  /** 05-1 §0.1: the root carries `data-card-id` and `data-card-type` (M4 cards pass their row). */
  card?: CardRow;
  /** 05-1 §0.5 status edge: 1.5px on the top edge only (`--warn` held/limits, `--bad` failed). */
  edge?: 'warn' | 'bad';
  /** 05-1 §0.5 Submitting: `aria-busy`. */
  busy?: boolean;
  /** 05-1 §0.5 Declined / Expired / Superseded / Withdrawn look: `--bg-sunken`, text `--fg-2`. */
  muted?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      className={cx(styles.card, wide && styles.wide, edge && styles[`edge_${edge}`], muted && styles.muted, className)}
      data-testid={TID[tid]}
      data-card-id={card?.id}
      data-card-type={card?.type}
      data-card-state={state}
      data-state={state}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
