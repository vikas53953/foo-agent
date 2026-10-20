// Spec: 05-1 §0.2 (card frame: `--card-w` 440 or `--card-w-wide` 600, never wider than the column; `--bg-raised`, 1px
// `--line`, `--r-lg`, padding 12 / 14, rows 8 apart, header 22 with a 20px icon and a right label; time `--t-caption`
// `--fg-3` on the last row with the full-date tooltip, `card-time`; a container for container queries), §0.5 (whole-surface
// cards: `--shadow-4` and `--line-strong` on hover; focus ring follows `--r-lg`), §0.7 (Narrator: the card is a group named
// "{card name}: {title}"). M4: `data-card-id` / `data-card-type` (05-1 §0.1), the §0.5 status edge, Submitting and muted looks. M5 (CR-0009): the
// `--accent` edge of a gated card waiting on the user, extra `data-*` attributes, and the folded summary row. P1 (CR-0021,
// 02 §F7.1 Cards): a card that changes state while shown cross-fades its content and grows or shrinks to its new height
// over `--m-card` (05 §0.8 motion M-1); Basic, Off and reduced motion keep the cross-fade only, no height animation.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotion } from '../a11y/useReducedMotion';
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
  description,
  wide,
  state,
  children,
  className,
  card,
  edge,
  busy,
  muted,
  onKeyDown,
  data,
}: {
  tid: keyof typeof TID;
  label: string;
  /** 05-2 §5.5.5 / §5.7.4: the card's Narrator description (read after the label). */
  description?: string;
  wide?: boolean;
  state: string;
  children: ReactNode;
  className?: string;
  /** 05-1 §0.1: the root carries `data-card-id` and `data-card-type` (M4 cards pass their row). */
  card?: CardRow;
  /** 05-1 §0.5 status edge: 1.5px on the top edge only (`--accent` a gated card pending, `--warn` held/limits, `--bad` failed). */
  edge?: 'accent' | 'warn' | 'bad';
  /** 05-1 §0.5 Submitting: `aria-busy`. */
  busy?: boolean;
  /** 05-1 §0.5 Declined / Expired / Superseded / Withdrawn look: `--bg-sunken`, text `--fg-2`. */
  muted?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** M5: extra `data-*` attributes on the root (e.g. Choice's `data-purpose`), so the root stays the bubble's direct child. */
  data?: Record<`data-${string}`, string | undefined>;
}) {
  const root = useCardMorph(state);
  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      aria-description={description}
      aria-busy={busy || undefined}
      className={cx(styles.card, wide && styles.wide, edge && styles[`edge_${edge}`], muted && styles.muted, className)}
      data-testid={TID[tid]}
      data-card-id={card?.id}
      data-card-type={card?.type}
      data-card-state={state}
      data-state={state}
      onKeyDown={onKeyDown}
      {...data}
    >
      {children}
    </div>
  );
}

/**
 * 05 §0.8 / §F7.1: when `state` changes, the card's content cross-fades (`data-morph`) and its height moves from the old
 * height to the new one through a CSS transition on `--m-card`; with reduced motion only the cross-fade runs.
 */
function useCardMorph(state: string) {
  const root = useRef<HTMLDivElement>(null);
  const height = useRef<number | null>(null);
  const shown = useRef(state);
  const reduced = useReducedMotion();
  // The height just before a state change: kept current by a ResizeObserver (steps loading, Show all, window width).
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.dataset.morph === undefined) height.current = el.getBoundingClientRect().height;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const from = height.current;
    const changed = shown.current !== state;
    shown.current = state;
    const to = el.getBoundingClientRect().height;
    if (!changed || from === null) {
      height.current = to;
      return;
    }
    el.dataset.morph = '';
    const grow = !reduced && Math.abs(from - to) >= 1;
    if (grow) {
      el.style.height = `${from}px`;
      void el.offsetHeight; // apply the old height before the transition starts
      el.style.height = `${to}px`;
    }
    const end = (e?: Event) => {
      if (e && e.target !== el) return;
      el.style.height = '';
      delete el.dataset.morph;
      height.current = el.getBoundingClientRect().height;
      el.removeEventListener('transitionend', end);
      el.removeEventListener('transitioncancel', end);
      el.removeEventListener('animationend', end);
    };
    el.addEventListener(grow ? 'transitionend' : 'animationend', end);
    el.addEventListener('transitioncancel', end);
    return () => end();
  }, [state, reduced]);
  return root;
}

/** M5: the one line a folded card shows (answered, declined, expired, superseded, withdrawn). */
export function CardSummary({ children }: { children: ReactNode }) {
  return <div className={styles.summary}>{children}</div>;
}
