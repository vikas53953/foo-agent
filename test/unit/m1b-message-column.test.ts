// 03-shell-2 §3.6.4 stick-to-bottom maths (X-152: 15px), §3.6.5 date separator copy + unread divider, §3.6.6 jump button,
// §3.6.7 load older (anchor kept) and the start-of-chat marker, §3.6.3 local find.
import { describe, expect, it } from 'vitest';
import {
  STICK_THRESHOLD,
  anchorAfterPrepend,
  atBottom,
  jumpCountLabel,
  nearTop,
  onRowsAdded,
  showJump,
  unreadOpenTop,
} from '../../src/renderer/messages/stickToBottom';
import { buildRows, dateLabel, firstUnreadId } from '../../src/renderer/messages/rows';
import { findMatches, stepMatch } from '../../src/renderer/shell/findMatches';
import { aboveFold } from '../../src/renderer/messages/scrollAdjust';
import type { MessageRow } from '../../src/shared/types';

const TZ = 'Asia/Kolkata';
const NOW = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST
const DAY = 24 * 3_600_000;

describe('stick to bottom (§3.6.4, X-152)', () => {
  it('atBottom = scrollHeight − scrollTop − clientHeight < 15', () => {
    expect(STICK_THRESHOLD).toBe(15);
    expect(atBottom({ scrollHeight: 2000, scrollTop: 1386, clientHeight: 600 })).toBe(true); // 14 px away
    expect(atBottom({ scrollHeight: 2000, scrollTop: 1385, clientHeight: 600 })).toBe(false); // 15 px away
  });
  it('rows added: follow when at the bottom just before; else count them; the user sending always follows', () => {
    expect(onRowsAdded({ wasAtBottom: true, added: 2, byUser: false })).toEqual({ follow: true, addToCount: 0 });
    expect(onRowsAdded({ wasAtBottom: false, added: 2, byUser: false })).toEqual({ follow: false, addToCount: 2 });
    expect(onRowsAdded({ wasAtBottom: false, added: 1, byUser: true })).toEqual({ follow: true, addToCount: 0 });
  });
  it('jump button shows only when more than one screen above the bottom; count caps at 99+', () => {
    expect(showJump({ scrollHeight: 3000, scrollTop: 1799, clientHeight: 600 })).toBe(true); // 601 px above the bottom
    expect(showJump({ scrollHeight: 3000, scrollTop: 1800, clientHeight: 600 })).toBe(false); // exactly one screen
    expect(jumpCountLabel(3)).toBe('3');
    expect(jumpCountLabel(99)).toBe('99');
    expect(jumpCountLabel(100)).toBe('99+');
  });
  it('load older: within 600 px of the top; the anchor keeps the same rows in view', () => {
    expect(nearTop(599)).toBe(true);
    expect(nearTop(600)).toBe(false);
    expect(anchorAfterPrepend({ scrollTop: 120, totalBefore: 4000, totalAfter: 6800 })).toBe(2920);
  });
  it('open with unread: divider sits 1/3 down the list; if all unread fit, the end', () => {
    expect(unreadOpenTop({ dividerTop: 3000, totalHeight: 5000, clientHeight: 900 })).toBe(2700);
    expect(unreadOpenTop({ dividerTop: 4400, totalHeight: 5000, clientHeight: 900 })).toBe(4100);
  });
});

describe('date separator copy (§3.6.5, Article 21)', () => {
  const opts = { now: NOW, timeZone: TZ };
  it('today, yesterday, this year, other year', () => {
    expect(dateLabel(NOW - 3_600_000, opts)).toBe('Today, Fri 16 Oct');
    expect(dateLabel(NOW - DAY, opts)).toBe('Yesterday, Thu 15 Oct');
    expect(dateLabel(NOW - 2 * DAY, opts)).toBe('Wed 14 Oct');
    expect(dateLabel(Date.UTC(2025, 9, 14, 6), opts)).toBe('Tue 14 Oct 2025');
  });
});

let seq = 0;
const msg = (over: Partial<MessageRow>): MessageRow =>
  ({
    id: `m${++seq}`,
    chatId: 'c1',
    seq,
    authorKind: 'foo',
    authorId: null,
    kind: 'text',
    markerKind: null,
    text: 'hello',
    status: 'complete',
    cardId: null,
    jobId: null,
    createdAt: NOW,
    rev: 1,
    reactions: [],
    ...over,
  }) as MessageRow;

describe('virtual rows (§3.6.5, §3.6.7)', () => {
  it('one separator before the first message of each day; unread divider before the first unread', () => {
    const ms = [
      msg({ id: 'a', createdAt: NOW - DAY }),
      msg({ id: 'b', createdAt: NOW - DAY + 60_000 }),
      msg({ id: 'c' }),
      msg({ id: 'd' }),
    ];
    const rows = buildRows(ms, {
      now: NOW,
      timeZone: TZ,
      hasMore: true,
      unreadFromId: 'c',
      unreadCount: 2,
      chatTitle: 'Trips',
      chatCreatedAt: NOW,
      isFoo: false,
      agentName: 'foo',
    });
    expect(rows.map((r) => (r.kind === 'message' ? r.message.id : r.kind))).toEqual(['date', 'a', 'b', 'date', 'unread', 'c', 'd']);
    expect(rows.find((r) => r.kind === 'unread')).toMatchObject({ label: '2 new messages' });
  });
  it('start of history: the start_of_chat marker comes first, before the first date separator', () => {
    const marker = msg({ id: 's', kind: 'marker', markerKind: 'start_of_chat', authorKind: 'system', text: '' });
    const rows = buildRows([marker, msg({ id: 'x' })], {
      now: NOW,
      timeZone: TZ,
      hasMore: false,
      unreadFromId: null,
      unreadCount: 0,
      chatTitle: 'Trips',
      chatCreatedAt: NOW,
      isFoo: false,
      agentName: 'foo',
    });
    expect(rows.map((r) => r.kind)).toEqual(['start', 'date', 'message']);
    expect(rows[0]).toMatchObject({ label: 'Start of your chat with Trips · made Fri 16 Oct 2026' });
  });
  it("start of history without a stored marker still shows the line; foo's chat wording", () => {
    const rows = buildRows([msg({ id: 'y' })], {
      now: NOW,
      timeZone: TZ,
      hasMore: false,
      unreadFromId: null,
      unreadCount: 0,
      chatTitle: 'foo',
      chatCreatedAt: NOW,
      isFoo: true,
      agentName: 'foo',
    });
    expect(rows[0]).toMatchObject({ kind: 'start', label: 'Start of your chat with foo' });
  });
  it('first unread: the earliest of the last n messages not from the user', () => {
    const ms = [msg({ id: 'p' }), msg({ id: 'q', authorKind: 'user' }), msg({ id: 'r' }), msg({ id: 's2' })];
    expect(firstUnreadId(ms, 2)).toBe('r');
    expect(firstUnreadId(ms, 0)).toBeNull();
  });
});

describe('find in this chat (§3.6.3, local)', () => {
  const ms = [msg({ id: 'a', text: 'Goa stay booked' }), msg({ id: 'b', text: 'flights to GOA' }), msg({ id: 'c', text: 'nothing' })];
  it('case-insensitive matches in message order; empty query → none', () => {
    expect(findMatches(ms, 'goa').map((m) => m.messageId)).toEqual(['a', 'b']);
    expect(findMatches(ms, '  ')).toEqual([]);
  });
  it('searches message text only: cards and markers are skipped until 04/05 give them searchable text', () => {
    const more = [...ms, msg({ id: 'k', kind: 'card', text: 'Goa card' }), msg({ id: 'x', kind: 'marker', text: 'goa marker' })];
    expect(findMatches(more, 'goa').map((m) => m.messageId)).toEqual(['a', 'b']);
  });
  it('Enter = next, Shift+Enter = previous, wrapping', () => {
    expect(stepMatch(0, 2, 1)).toBe(1);
    expect(stepMatch(1, 2, 1)).toBe(0);
    expect(stepMatch(0, 2, -1)).toBe(1);
    expect(stepMatch(-1, 0, 1)).toBe(-1);
  });
});

describe('measured rows above the fold keep the view still (§3.6.4, batched corrections while flinging)', () => {
  const row = { start: 400, size: 100, fold: 450, backward: false };
  it('a first measurement moves the view when the row starts above the fold', () => {
    expect(aboveFold({ ...row, firstMeasure: true })).toBe(true);
    expect(aboveFold({ ...row, start: 450, firstMeasure: true })).toBe(false);
  });
  it('a re-measurement only when the whole row is above the fold and the user is not scrolling up', () => {
    expect(aboveFold({ ...row, firstMeasure: false })).toBe(false);
    expect(aboveFold({ ...row, start: 300, firstMeasure: false })).toBe(true);
    expect(aboveFold({ ...row, start: 300, firstMeasure: false, backward: true })).toBe(false);
  });
  it('corrections not yet written count into the fold', () => {
    expect(aboveFold({ ...row, start: 460, firstMeasure: true, fold: 450 + 20 })).toBe(true);
  });
});
