// Lane-D witness for 10-acceptance-1 AT-284: helper bubbles collapse only within a same-day run.
import { describe, expect, it } from 'vitest';
import { joinsRun, layoutRows } from '../../src/renderer/messages/runs';
import type { VRow } from '../../src/renderer/messages/rows';
import type { MessageRow } from '../../src/shared/types';

const MINUTE = 60_000;
const MIDNIGHT_IST = Date.UTC(2026, 9, 16, 18, 29); // 23:59 on 16 Oct in Asia/Kolkata.
let sequence = 0;

function message(over: Partial<MessageRow> = {}): MessageRow {
  sequence += 1;
  return {
    id: `lane-d-group-${sequence}`,
    chatId: 'lane-d-chat',
    seq: sequence,
    authorKind: 'helper',
    authorId: 'helper-1',
    kind: 'text',
    markerKind: null,
    clientId: null,
    text: 'helper reply',
    status: 'complete',
    badge: null,
    replyToId: null,
    jobId: null,
    cardId: null,
    lang: null,
    voicePath: null,
    voiceMs: null,
    transcript: null,
    transcriptConf: null,
    attachments: null,
    prompted: true,
    why: null,
    pinned: false,
    providerNote: null,
    suggestions: null,
    side: false,
    understood: null,
    kitPick: null,
    actions: null,
    rev: 1,
    createdAt: MIDNIGHT_IST,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    ...over,
  };
}

const row = (m: MessageRow): VRow => ({ kind: 'message', key: m.id, message: m });

describe('AT-284 · same-day helper grouping and run breaks', () => {
  it('keeps a three-bubble same-day run at a 2px gap, then breaks on the day, chip, or unread divider', () => {
    const first = message({ createdAt: MIDNIGHT_IST - 2 * MINUTE });
    const second = message({ createdAt: MIDNIGHT_IST - MINUTE });
    const third = message({ createdAt: MIDNIGHT_IST });
    const sameDay = layoutRows([row(first), row(second), row(third)], { chatKind: 'helper' });
    expect(sameDay.map((entry) => entry.pos)).toEqual(['first', 'middle', 'last']);
    expect(sameDay.map((entry) => entry.gap)).toEqual(['none', 's-1', 's-1']);

    // The run window alone is insufficient: 23:59 → 00:01 crosses the user's calendar day.
    const dayBefore = message({ createdAt: MIDNIGHT_IST - MINUTE });
    const dayAfter = message({ createdAt: MIDNIGHT_IST + MINUTE });
    expect(joinsRun(dayBefore, dayAfter)).toBe(false);

    const chipped = message({ reactions: [{ emoji: '👍', by: 'foo' }] });
    const chipBreak = layoutRows([row(first), row(chipped)], { chatKind: 'helper' });
    expect(chipBreak.map((entry) => entry.pos)).toEqual(['single', 'single']);
    expect(chipBreak[1]?.gap).toBe('s5');

    const unread = { kind: 'unread' as const, key: 'unread', label: '1 new message' };
    const unreadBreak = layoutRows([row(first), unread, row(second)], { chatKind: 'helper' });
    expect(unreadBreak.map((entry) => entry.pos)).toEqual(['single', null, 'single']);
    expect(unreadBreak[2]?.gap).toBe('none');
  });
});
