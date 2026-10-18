// Spec: 05-1 §0.2 (card frame: `--card-w` 440 or `--card-w-wide` 600, never wider than the column; `--bg-raised`, 1px
// `--line`, `--r-lg`, padding 12 / 14, rows 8 apart, header 22 with a 20px icon and a right label; time `--t-caption`
// `--fg-3` on the last row with the full-date tooltip, `card-time`; a container for container queries), §0.5 (whole-surface
// cards: `--shadow-4` and `--line-strong` on hover; focus ring follows `--r-lg`), §0.7 (Narrator: the card is a group named
// "{card name}: {title}"). M5 (CR-0009): gated cards (approval, payment, draft) carry the status edge, a 1.5px `--accent`
// top border (05-1 §0.5 Pending); every card root carries `data-card-id` and `data-card-type` (05 test ids); a folded card
// shows one summary row (`--t-small` `--fg-2`, 05-1 §0.5 collapsed looks).
import type { ReactNode } from 'react';
import type { CardType } from '../../shared/types';
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
  gated,
}: {
  tid: keyof typeof TID;
  label: string;
  wide?: boolean;
  state: string;
  children: ReactNode;
  className?: string;
  /** The card row the frame draws (M5 on: `data-card-id`, `data-card-type`). */
  card?: { id: string; type: CardType };
  /** Gated cards waiting on the user show the status edge (05-1 §0.5). */
  gated?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(styles.card, wide && styles.wide, gated && styles.gated, className)}
      data-testid={TID[tid]}
      data-card-id={card?.id}
      data-card-type={card?.type}
      data-card-state={state}
      data-state={state}
    >
      {children}
    </div>
  );
}

/** The one line a folded card shows (answered, declined, expired, superseded, withdrawn). */
export function CardSummary({ children }: { children: ReactNode }) {
  return <div className={styles.summary}>{children}</div>;
}
