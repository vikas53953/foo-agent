// 03-shell-2 §3.6.4 stick to bottom, 04 §1.6 (follow the Thinking row and a reply). PC gate run 5 (88d4460, 23 Nov 2026):
// with real Claude on Vikas's PC, replies were left below the fold (B1 #19/#21, G2 #5/#9) because a scroll event the list
// made itself, a frame before its own follow landed, counted as leaving the bottom.
import { describe, expect, it } from 'vitest';
import { stuckAfterScroll } from '../../src/renderer/messages/stickToBottom';

describe('the list leaves the bottom only for the user or a move up (§3.6.4)', () => {
  it('a scroll the list made itself, short of the end and not up, keeps it following', () => {
    expect(stuckAfterScroll(false, true, false, false)).toBe(true);
  });
  it('the user scrolling, or the view moving up (a jump), stops the follow; reaching the end again restarts it', () => {
    expect(stuckAfterScroll(false, true, true, false)).toBe(false);
    expect(stuckAfterScroll(false, true, false, true)).toBe(false);
    expect(stuckAfterScroll(false, false, false, false)).toBe(false);
    expect(stuckAfterScroll(true, false, true, false)).toBe(true);
  });
});
