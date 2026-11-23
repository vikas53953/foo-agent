// 03-shell-2 §3.6.4 stick to bottom, 04 §1.6 (follow the Thinking row and a reply). PC gate run 5 (88d4460, 23 Nov 2026):
// with real Claude on Vikas's PC, replies were left below the fold (B1 #19/#21, G2 #5/#9) because a scroll event the list
// made itself, a frame before its own follow landed, counted as leaving the bottom.
import { describe, expect, it } from 'vitest';
import { stuckAfterScroll } from '../../src/renderer/messages/stickToBottom';

describe('only the user takes the list off the bottom (§3.6.4)', () => {
  it('a scroll the list made itself, short of the end, keeps it following', () => {
    expect(stuckAfterScroll({ atBottom: false, wasAtBottom: true, byUser: false })).toBe(true);
  });
  it('the user scrolling up stops the follow; reaching the end again restarts it', () => {
    expect(stuckAfterScroll({ atBottom: false, wasAtBottom: true, byUser: true })).toBe(false);
    expect(stuckAfterScroll({ atBottom: false, wasAtBottom: false, byUser: false })).toBe(false);
    expect(stuckAfterScroll({ atBottom: true, wasAtBottom: false, byUser: true })).toBe(true);
  });
});
