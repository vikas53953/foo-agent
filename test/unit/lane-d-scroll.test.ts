// Lane-D witness for 10-acceptance-1 AT-285: the 14px stick boundary, jump count and focused read timer contract.
import { describe, expect, it } from 'vitest';
import { MARK_READ_AFTER_MS, atBottom, jumpCountLabel, onRowsAdded, rowVisible, showJump } from '../../src/renderer/messages/stickToBottom';

describe('AT-285 · stick-to-bottom boundary and unread timing', () => {
  it('follows at 14px, stops at 16px, counts new rows and waits one second for a visible newest row', () => {
    expect(atBottom({ scrollHeight: 2_000, scrollTop: 1_386, clientHeight: 600 })).toBe(true);
    expect(atBottom({ scrollHeight: 2_000, scrollTop: 1_384, clientHeight: 600 })).toBe(false);
    expect(onRowsAdded({ wasAtBottom: false, added: 2, byUser: false })).toEqual({ follow: false, addToCount: 2 });
    expect(showJump({ scrollHeight: 3_000, scrollTop: 1_799, clientHeight: 600 })).toBe(true);
    expect(jumpCountLabel(100)).toBe('99+');
    expect(rowVisible({ start: 1_900, end: 2_000, scrollTop: 1_400, clientHeight: 600 })).toBe(true);
    expect(rowVisible({ start: 2_100, end: 2_200, scrollTop: 1_400, clientHeight: 600 })).toBe(false);
    expect(MARK_READ_AFTER_MS).toBe(1_000);
  });
});
