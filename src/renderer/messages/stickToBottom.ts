// Spec: 03-shell-2 §3.6.4 (stick to bottom; no overflow-anchor), 04 §1.6 + DECISIONS X-152 (15px, wins over §3.6.4's 80),
// §3.6.5 (open at the unread divider 1/3 down), §3.6.6 (button when > one screen above; "99+"), §3.6.7 (600px, keep anchor).
// 04 §1.6 streaming rule (follow a streaming answer until its top is 16px below the chat header). Pure maths;
// useStickToBottom.ts and MessageList.tsx apply it.
export const STICK_THRESHOLD = 15;
export const LOAD_OLDER_WITHIN = 600;
export const JUMP_COUNT_CAP = 99;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

const fromBottom = (m: ScrollMetrics) => m.scrollHeight - m.scrollTop - m.clientHeight;

export const atBottom = (m: ScrollMetrics, threshold = STICK_THRESHOLD) => fromBottom(m) < threshold;

/** What to do when rows are added or a row grows. */
export function onRowsAdded(a: { wasAtBottom: boolean; added: number; byUser: boolean }): { follow: boolean; addToCount: number } {
  if (a.byUser || a.wasAtBottom) return { follow: true, addToCount: 0 };
  return { follow: false, addToCount: a.added };
}

export const showJump = (m: ScrollMetrics) => fromBottom(m) > m.clientHeight;

export const jumpCountLabel = (n: number) => (n > JUMP_COUNT_CAP ? `${JUMP_COUNT_CAP}+` : String(n));

export const nearTop = (scrollTop: number) => scrollTop < LOAD_OLDER_WITHIN;

/** After prepending older rows, move down by what was added above so nothing on screen jumps. */
export const anchorAfterPrepend = (a: { scrollTop: number; totalBefore: number; totalAfter: number }) =>
  a.scrollTop + (a.totalAfter - a.totalBefore);

/** First open with unread: divider 1/3 down the visible list; if every unread row fits, the end (divider still visible). */
export function unreadOpenTop(a: { dividerTop: number; totalHeight: number; clientHeight: number }): number {
  const end = Math.max(0, a.totalHeight - a.clientHeight);
  if (a.totalHeight - a.dividerTop <= a.clientHeight) return end;
  return Math.min(end, Math.max(0, a.dividerTop - a.clientHeight / 3));
}

/** 04 §1.6: the gap under the chat header at which the list stops following a streaming answer. */
export const STREAM_TOP_GAP = 16;

/**
 * 04 §1.6 / §14.4: while at the bottom, keep following a growing streaming bubble only while its top is still more than
 * 16px below the top of the list (the chat header's bottom edge); then stop, so the user reads from the first line.
 */
export const followStreaming = (a: { rowStart: number; scrollTop: number }) => a.rowStart - a.scrollTop > STREAM_TOP_GAP;

/** 04 §1.6 / X-152: the newest message must stay visible this long (window focused) before the chat is marked read. */
export const MARK_READ_AFTER_MS = 1000;

/** Is a row (offsets inside the scroller) inside the visible part of the list? */
export const rowVisible = (a: { start: number; end: number; scrollTop: number; clientHeight: number }) =>
  a.end > a.scrollTop && a.start < a.scrollTop + a.clientHeight;
