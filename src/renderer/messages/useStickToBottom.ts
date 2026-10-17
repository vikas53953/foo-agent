// Spec: 03-shell-2 §3.6.4 "Stick to bottom" is implemented only here (no overflow-anchor): atBottom is re-checked on every
// scroll event; when rows are added or a row grows, follow with scrollToIndex(last, { align: 'end' }) if atBottom was true just
// before the change, else stay and add the new rows to the scroll-to-bottom count (§3.6.6); the user sending always follows.
// 04 §1.6 / X-152: threshold 15px. Prepending older rows (§3.6.7) keeps the anchor instead.
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { VRow } from './rows';
import { anchorAfterPrepend, atBottom, onRowsAdded } from './stickToBottom';

export interface StickTarget {
  scrollToEnd: () => void;
  getTotalSize: () => number;
}

const contentKeys = (rows: VRow[]) => rows.filter((r) => r.kind === 'message');

export function useStickToBottom(scrollRef: RefObject<HTMLElement | null>, rows: VRow[], target: StickTarget) {
  const wasAtBottom = useRef(true);
  const [newCount, setNewCount] = useState(0);
  const prev = useRef<{ first?: string; last?: string; total: number; lead: string }>({ total: 0, lead: '' });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottom.current = atBottom(el);
    if (wasAtBottom.current) setNewCount(0);
  }, [scrollRef]);

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
      }
    }
    prev.current = { first, last, total, lead };
  }, [rows, scrollRef, target]);

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
