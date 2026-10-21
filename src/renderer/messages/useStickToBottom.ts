// Spec: 03-shell-2 §3.6.4 "Stick to bottom" is implemented only here (no overflow-anchor): atBottom is re-checked on every
// scroll event; when rows are added or a row grows, follow with scrollToIndex(last, { align: 'end' }) if atBottom was true just
// before the change, else stay and add the new rows to the scroll-to-bottom count (§3.6.6); the user sending always follows.
// 04 §1.6 / X-152: threshold 15px. Prepending older rows (§3.6.7) keeps the anchor instead. CR-0024 B3: the list's own
// viewport shrinking (suggestion chips or a taller composer below it) is a change too: a list at the bottom stays there.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { VRow } from './rows';
import { anchorAfterPrepend, atBottom, onRowsAdded, type ScrollMetrics } from './stickToBottom';

export interface StickTarget {
  scrollToEnd: () => void;
  getTotalSize: () => number;
  /** A scroll to the end is still settling (rows measured on the way move the end). */
  isFollowing: () => boolean;
}

const contentKeys = (rows: VRow[]) => rows.filter((r) => r.kind === 'message');

export function useStickToBottom(scrollRef: RefObject<HTMLElement | null>, rows: VRow[], target: StickTarget) {
  const wasAtBottom = useRef(true);
  const [newCount, setNewCount] = useState(0);
  const prev = useRef<{ first?: string; last?: string; total: number; lead: string }>({ total: 0, lead: '' });

  /**
   * `m`: the scroller's metrics as the list already knows them (no layout read per scroll event, PERF-04). `byUser`: the
   * user scrolled (wheel, keys, pointer, touch) just now. A list at the bottom stays there through a scroll it made itself
   * while rows were still being measured (the total changed and the follow is queued, or the follow is still settling):
   * only the user leaves the bottom then.
   */
  const onScroll = useCallback(
    (m: ScrollMetrics, byUser: boolean) => {
      const bottom = atBottom(m);
      if (!bottom && wasAtBottom.current && !byUser && (target.isFollowing() || target.getTotalSize() !== prev.current.total)) return;
      wasAtBottom.current = bottom;
      if (bottom) setNewCount((n) => (n === 0 ? n : 0));
    },
    [target],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentKeys(rows);
    const first = content[0]?.key;
    const last = content[content.length - 1]?.key;
    const lead = rows
      .slice(0, rows.findIndex((r) => r.kind === 'message') + 1)
      .map((r) => r.key)
      .join('|');
    const p = prev.current;
    const total = target.getTotalSize();
    if (el && p.last !== undefined) {
      if (last !== p.last) {
        const lastIdx = content.findIndex((r) => r.key === p.last);
        const added = lastIdx < 0 ? content.length : content.length - 1 - lastIdx;
        const lastRow = content[content.length - 1];
        const byUser = lastRow?.kind === 'message' && lastRow.message.authorKind === 'user';
        const r = onRowsAdded({ wasAtBottom: wasAtBottom.current, added, byUser });
        if (r.follow) {
          target.scrollToEnd();
          wasAtBottom.current = true;
        } else setNewCount((c) => c + r.addToCount);
      } else if (first !== p.first || lead !== p.lead) {
        el.scrollTop = anchorAfterPrepend({ scrollTop: el.scrollTop, totalBefore: p.total, totalAfter: total });
      } else if (total !== p.total && wasAtBottom.current) {
        // A row that is not a message (the status line, Thinking) came or went at the end: still "rows added" (§3.6.4).
        target.scrollToEnd();
      }
    }
    prev.current = { first, last, total, lead };
  }, [rows, scrollRef, target]);

  // B3: the scroller got shorter or taller while nothing in it changed (the chips row above the composer came, the field
  // grew a line). The browser keeps scrollTop, so the newest rows would slip under the composer: pin the end again.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let height = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight === height) return;
      height = el.clientHeight;
      if (wasAtBottom.current) el.scrollTop = el.scrollHeight - el.clientHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  /** A row grew (measurement, streaming): keep following when the list was at the bottom. */
  const onSizeChange = useCallback(
    (follow = true) => {
      if (wasAtBottom.current && follow) target.scrollToEnd();
      prev.current.total = target.getTotalSize();
    },
    [target],
  );

  const resetCount = useCallback(() => setNewCount(0), []);
  return { onScroll, onSizeChange, newCount, resetCount, wasAtBottom };
}
