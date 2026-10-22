// Lane-D witness for 10-acceptance-1 AT-284: helper bubbles collapse only within a same-day run.
import { describe, expect, it } from 'vitest';
import { layoutRows } from '../../src/renderer/messages/runs';
import { buildRows, type VRow } from '../../src/renderer/messages/rows';
import type { MessageRow } from '../../src/shared/types';

const MINUTE = 60_000;
const TIME_ZONE = 'Asia/Kolkata';
const SAME_DAY = Date.UTC(2026, 9, 16, 18, 0); // 23:30 on 16 Oct in Asia/Kolkata.
const BEFORE_MIDNIGHT_IST = Date.UTC(2026, 9, 16, 18, 29); // 23:59 on 16 Oct in Asia/Kolkata.
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
    createdAt: SAME_DAY,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    ...over,
  };
}

function rows(messages: MessageRow[], unreadFromId: string | null = null): VRow[] {
  return buildRows(messages, {
    now: Date.UTC(2026, 9, 16, 19, 0),
    timeZone: TIME_ZONE,
    hasMore: true,
    unreadFromId,
    unreadCount: unreadFromId ? 1 : 0,
    chatTitle: 'Helper',
    chatCreatedAt: SAME_DAY,
    isFoo: false,
    agentName: 'foo',
  });
}

function messageLayouts(items: VRow[], chatKind: 'foo' | 'helper') {
  const layouts = layoutRows(items, { chatKind });
  return items.flatMap((item, index) => (item.kind === 'message' ? [layouts[index]!] : []));
}

describe('AT-284 · same-day helper grouping and run breaks', () => {
  it('keeps a three-bubble same-day run at a 2px gap, then breaks on the day, chip, badge, or unread divider', () => {
    const first = message({ createdAt: SAME_DAY });
    const second = message({ createdAt: SAME_DAY + MINUTE });
    const third = message({ createdAt: SAME_DAY + 2 * MINUTE });
    const sameDayRows = rows([first, second, third]);
    expect(sameDayRows.map((item) => item.kind)).toEqual(['date', 'message', 'message', 'message']);
    const sameDay = messageLayouts(sameDayRows, 'helper');
    expect(sameDay.map((entry) => entry.pos)).toEqual(['first', 'middle', 'last']);
    expect(sameDay.map((entry) => entry.gap)).toEqual(['none', 's-1', 's-1']);

    // buildRows inserts the timezone-aware date row before layoutRows sees the two bubbles.
    const dayBefore = message({ createdAt: BEFORE_MIDNIGHT_IST });
    const dayAfter = message({ createdAt: BEFORE_MIDNIGHT_IST + 2 * MINUTE });
    const midnightRows = rows([dayBefore, dayAfter]);
    expect(midnightRows.map((item) => item.kind)).toEqual(['date', 'message', 'date', 'message']);
    expect(messageLayouts(midnightRows, 'helper').map((entry) => entry.pos)).toEqual(['single', 'single']);

    const chipped = message({ createdAt: SAME_DAY, reactions: [{ emoji: '👍', by: 'foo' }] });
    const chipBreak = messageLayouts(rows([chipped, message({ createdAt: SAME_DAY + MINUTE })]), 'helper');
    expect(chipBreak.map((entry) => entry.pos)).toEqual(['single', 'single']);
    expect(chipBreak[1]?.gap).toBe('s5');

    const badged = message({ authorKind: 'user', authorId: null, badge: 'seen', createdAt: SAME_DAY });
    const badgeBreak = messageLayouts(rows([badged, message({ authorKind: 'user', authorId: null, createdAt: SAME_DAY + MINUTE })]), 'foo');
    expect(badgeBreak.map((entry) => entry.pos)).toEqual(['single', 'single']);
    expect(badgeBreak[1]?.gap).toBe('s3');

    const unreadTarget = message({ createdAt: SAME_DAY + MINUTE });
    const unreadRows = rows([first, unreadTarget], unreadTarget.id);
    expect(unreadRows.map((item) => item.kind)).toEqual(['date', 'message', 'unread', 'message']);
    const unreadBreak = messageLayouts(unreadRows, 'helper');
    expect(unreadBreak.map((entry) => entry.pos)).toEqual(['single', 'single']);
    expect(unreadBreak[1]?.gap).toBe('none');
  });
});
