// Spec: 02 §F7.1 "Chat list" (a new chat slides in at the top while others glide down; a pinned chat drops in with a tiny
// bounce; results stagger 30ms; the unread badge springs in; the Needs-you pill pulses once; the working preview
// shimmers once; the muted icon fades in), FE-24 (CSS only: JavaScript only measures rows and sets data-* and custom
// properties, never the Web Animations API), CR-0021 picks 1–3 (one-shot details are keyed to a state change, never
// to a re-render or a remount). Pure helpers plus the one hook; unit-tested.
import { useState } from 'react';

/** Rows past this index share the last stagger delay, so a long result list is never slow to appear. */
export const STAGGER_CAP = 10;

export interface FlipPlan {
  /** Rows that stayed and moved: `dy` is old top − new top (the offset the row starts from). */
  moves: { id: string; dy: number }[];
  /** Rows that were not in the list before. */
  arrivals: string[];
}

/** FLIP offsets from row tops measured before and after a list change. The first measure has nothing to animate. */
export function flipPlan(prev: ReadonlyMap<string, number>, next: ReadonlyMap<string, number>): FlipPlan {
  if (prev.size === 0) return { moves: [], arrivals: [] };
  const moves: FlipPlan['moves'] = [];
  const arrivals: string[] = [];
  for (const [id, top] of next) {
    const before = prev.get(id);
    if (before === undefined) arrivals.push(id);
    else if (before !== top) moves.push({ id, dy: before - top });
  }
  return { moves, arrivals };
}

export function staggerIndex(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_CAP);
}

/**
 * How many times `value` has changed in a way `isStep(prev, next)` accepts since this component mounted. 0 on mount, so
 * a row that remounts (a filter switch, a scroll back) never replays a one-shot detail; use it as a `key` to replay one.
 */
export function useSteps<T>(value: T, isStep: (prev: T, next: T) => boolean): number {
  const [seen, setSeen] = useState(value);
  const [steps, setSteps] = useState(0);
  // Adjust state while rendering when `value` changes (React's "storing information from previous renders" pattern).
  if (!Object.is(seen, value)) {
    setSeen(value);
    if (isStep(seen, value)) setSteps(steps + 1);
  }
  return steps;
}

export const becameTrue = (prev: boolean, next: boolean): boolean => !prev && next;
export const grew = (prev: number, next: number): boolean => next > prev;
