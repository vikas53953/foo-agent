// Spec: 10-acceptance-2 §E PERF-04 (fling scroll at 60 fps), 03-shell-2 §3.6.4 (rows keep measured heights; nothing on screen
// jumps when a row above it is measured). TanStack Virtual corrects scrollTop once per measured row above the fold, and each
// correction reads scrollHeight right after the previous row's position writes: one forced layout per row mounted while
// scrolling up. This batches the corrections of one measurement pass into a single write before the frame paints.
import type { Virtualizer, VirtualItem } from '@tanstack/react-virtual';

/** The parts of the virtualizer this needs that its typings keep private (same instance, same library calls). */
interface Internals {
  /** Set while a scroll to an index settles; it re-targets every frame and moves the view itself. */
  scrollState: unknown;
  getScrollOffset(): number;
  applyScrollAdjustment(delta: number): boolean;
  notify(sync: boolean): void;
}

/**
 * The library's own rule (virtual-core `resizeItem`), with the not yet applied corrections counted into the fold: a first
 * measurement moves the view when the row starts above the fold; a re-measurement only when the whole row is above it and
 * the user is not scrolling up.
 */
export function aboveFold(o: { start: number; size: number; firstMeasure: boolean; fold: number; backward: boolean }): boolean {
  return o.firstMeasure ? o.start < o.fold : o.start + o.size <= o.fold && !o.backward;
}

/**
 * Installs the batched correction on `v`; returns nothing to clean up (it lives as long as the instance). `following()`:
 * the list sticks to the bottom (03-shell-2 §3.6.4), so its own follow puts the view at the end and no row correction may
 * move it off.
 */
export function batchScrollAdjustments<S extends Element, I extends Element>(v: Virtualizer<S, I>, following: () => boolean): void {
  const inner = v as unknown as Internals;
  let pending = 0;
  let queued = false;
  const flush = () => {
    queued = false;
    const delta = pending;
    pending = 0;
    if (delta !== 0 && inner.applyScrollAdjustment(delta)) inner.notify(false);
  };
  v.shouldAdjustScrollPositionOnItemSizeChange = (item: VirtualItem, delta: number, inst: Virtualizer<S, I>) => {
    // A scroll to an index (the follow to the end, a jump) is settling: it re-targets on its own each frame, and a
    // correction written now would leave the view off its target (it only scrolls again when the target moves).
    if (inner.scrollState != null || following()) return false;
    const fold = inner.getScrollOffset() + inst.scrollAdjustments + pending;
    const firstMeasure = !inst.itemSizeCache.has(item.key);
    if (!aboveFold({ start: item.start, size: item.size, firstMeasure, fold, backward: inst.scrollDirection === 'backward' })) return false;
    pending += delta;
    if (!queued) {
      queued = true;
      // A microtask runs after this ResizeObserver callback and before the frame paints, so nothing visibly jumps.
      queueMicrotask(flush);
    }
    return false;
  };
}
