// 03-shell-2 §3.7.3.1 Doing now (order, 5-row max, ≤ 2 finished, X-148 tabs, §3.7.4 scope), §3.7.3.2 Using,
// §3.7.3.3 What I know (top 3), §3.7.3.4 meter thresholds.
import { describe, expect, it } from 'vitest';
import { doingRows, doneRows, jobsInScope, scheduledRows, doingLine } from '../../src/renderer/shell/doingNow';
import { meterState } from '../../src/renderer/shell/spentMeters';
import { knowFacts, usingChips } from '../../src/renderer/shell/panelData';
import type { ChatRow, JobRow, MemoryFactView, RoutineRow } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST
const H = 3_600_000;
const TZ = 'Asia/Kolkata';

const chat = (id: string, kind: ChatRow['kind'], over: Partial<ChatRow> = {}): ChatRow =>
  ({
    id,
    kind,
    helperId: kind === 'helper' ? `h_${id}` : null,
    title: id,
    avatarRef: null,
    colorToken: null,
    waJid: null,
    pinned: false,
    archived: false,
    unreadCount: 0,
    pill: null,
    lastActivityAt: NOW,
    createdAt: NOW,
    private: false,
    rev: 1,
    lastLine: '',
    lastTime: NOW,
    hasDraft: false,
    face: 'letter:X',
    ...over,
  }) as ChatRow;
let n = 0;
const job = (over: Partial<JobRow>): JobRow =>
  ({
    id: `j${++n}`,
    chatId: 'foo',
    originChatId: 'foo',
    ownerKind: 'foo',
    ownerId: null,
    title: `Job ${n}`,
    state: 'working',
    waitingReason: null,
    needsYouCardId: null,
    currentStepIdx: 1,
    stepCount: 4,
    route: null,
    usesBrowser: false,
    createdAt: NOW - H,
    startedAt: NOW - H,
    finishedAt: null,
    rev: 1,
    stepsDone: 1,
    nowLine: 'Comparing fares',
    slow: false,
    ...over,
  }) as JobRow;

describe('Doing now: In progress tab', () => {
  it('orders NEEDS YOU, WORKING, QUEUED, WAITING, then finished today', () => {
    const jobs = [
      job({ id: 'done', state: 'done', finishedAt: NOW - H }),
      job({ id: 'wait', state: 'waiting', waitingReason: 'asleep' }),
      job({ id: 'q', state: 'queued' }),
      job({ id: 'work', state: 'working' }),
      job({ id: 'need', state: 'needs_you' }),
    ];
    expect(doingRows(jobs, NOW, TZ).rows.map((j) => j.id)).toEqual(['need', 'work', 'q', 'wait', 'done']);
  });
  it('max 5 rows, at most 2 of them finished; total counts everything for See all', () => {
    const jobs = [
      ...Array.from({ length: 4 }, (_, i) => job({ id: `f${i}`, state: i % 2 ? 'failed' : 'done', finishedAt: NOW - (i + 1) * 60_000 })),
      job({ id: 'a', state: 'working' }),
      job({ id: 'b', state: 'queued' }),
    ];
    const r = doingRows(jobs, NOW, TZ);
    expect(r.rows.map((j) => j.id)).toEqual(['a', 'b', 'f0', 'f1']);
    expect(r.total).toBe(6);
    const seven = Array.from({ length: 7 }, (_, i) => job({ id: `w${i}`, state: 'working', startedAt: NOW - i * 1000 }));
    expect(doingRows(seven, NOW, TZ).rows).toHaveLength(5);
  });
  it('finished yesterday and cancelled jobs are not in progress', () => {
    const jobs = [job({ state: 'done', finishedAt: NOW - 12 * H }), job({ state: 'cancelled', finishedAt: NOW - 60_000 })];
    expect(doingRows(jobs, NOW, TZ).rows).toEqual([]);
  });
});

describe('Doing now: Done and Scheduled tabs (X-148)', () => {
  it('Done: DONE/FAILED/CANCELLED of the last 7 days, newest first, 5 max', () => {
    const jobs = [
      job({ id: 'old', state: 'done', finishedAt: NOW - 8 * 24 * H }),
      job({ id: 'd1', state: 'done', finishedAt: NOW - 2 * H }),
      job({ id: 'c1', state: 'cancelled', finishedAt: NOW - H }),
      job({ id: 'f1', state: 'failed', finishedAt: NOW - 3 * 24 * H }),
      job({ id: 'live', state: 'working' }),
    ];
    const r = doneRows(jobs, NOW);
    expect(r.rows.map((j) => j.id)).toEqual(['c1', 'd1', 'f1']);
    expect(r.total).toBe(3);
  });
  it("Scheduled: this chat's routines by next run, deleted ones left out", () => {
    const routines = [
      { id: 'r1', ownerChatId: 'trips', title: 'PNR watch', state: 'on', nextRunAt: NOW + 2 * H, rev: 1 },
      { id: 'r2', ownerChatId: 'trips', title: 'Fare drop', state: 'on', nextRunAt: NOW + H, rev: 1 },
      { id: 'r3', ownerChatId: 'trips', title: 'Gone', state: 'deleted', nextRunAt: NOW, rev: 1 },
      { id: 'r4', ownerChatId: 'money', title: 'Bills', state: 'on', nextRunAt: NOW, rev: 1 },
    ] as RoutineRow[];
    expect(scheduledRows(routines, 'trips').rows.map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});

describe('Per-chat scope (§3.7.4)', () => {
  const jobs = [
    job({ id: 'inFoo', chatId: 'foo', originChatId: 'foo' }),
    job({ id: 'inTrips', chatId: 'trips', originChatId: 'trips', ownerKind: 'helper', ownerId: 'h_trips' }),
    job({ id: 'handoff', chatId: 'trips', originChatId: 'family', ownerKind: 'helper', ownerId: 'h_trips' }),
  ];
  it("foo's chat sees every job; a helper only its own; a group only jobs started there", () => {
    expect(jobsInScope(jobs, chat('foo', 'foo')).map((j) => j.id)).toEqual(['inFoo', 'inTrips', 'handoff']);
    expect(jobsInScope(jobs, chat('trips', 'helper')).map((j) => j.id)).toEqual(['inTrips', 'handoff']);
    expect(jobsInScope(jobs, chat('family', 'group')).map((j) => j.id)).toEqual(['handoff']);
  });
  it('the private chat sees only its own jobs', () => {
    expect(jobsInScope(jobs, chat('foo', 'foo', { private: true })).map((j) => j.id)).toEqual(['inFoo']);
  });
});

describe('Doing now line 2 copy', () => {
  const ctx = { now: NOW, timeZone: TZ, ai: 'Claude', cards: {} };
  it('per state', () => {
    expect(doingLine(job({ state: 'working', currentStepIdx: 2, stepCount: 4, nowLine: 'Comparing fares' }), ctx)).toBe(
      'Step 3 of 4 · Comparing fares',
    );
    expect(doingLine(job({ state: 'queued' }), ctx)).toBe('Waiting for another job to finish');
    expect(doingLine(job({ state: 'waiting', waitingReason: 'asleep' }), ctx)).toBe('Paused · your PC was asleep');
    expect(doingLine(job({ state: 'waiting', waitingReason: 'ai_down' }), ctx)).toBe('Paused · Claude isn’t answering');
    expect(doingLine(job({ state: 'waiting', waitingReason: 'app_quit' }), ctx)).toBe('Paused');
    expect(doingLine(job({ state: 'needs_you', title: 'Goa stay' }), ctx)).toBe('Needs you: Goa stay');
    expect(doingLine(job({ state: 'done', finishedAt: NOW - 108 * 60_000 }), ctx)).toBe('Done 7:12 AM');
    expect(doingLine(job({ state: 'failed', finishedAt: NOW - 30 * H }), ctx)).toBe('Didn’t finish · Thu 15 Oct, 3:00 AM');
  });
});

describe('Spent meters (§3.7.3.4)', () => {
  it('accent below 80 %, warn 80–99 %, bad at 100 % and over', () => {
    expect(meterState(21_200, 100_000)).toEqual({ tone: 'accent', capReached: false });
    expect(meterState(79_999, 100_000).tone).toBe('accent');
    expect(meterState(80_000, 100_000).tone).toBe('warn');
    expect(meterState(99_999, 100_000).tone).toBe('warn');
    expect(meterState(100_000, 100_000)).toEqual({ tone: 'bad', capReached: true });
    expect(meterState(150_000, 100_000).tone).toBe('bad');
  });
});

describe('Using chips and What I know', () => {
  it('AI chip first, then apps used in the last 24 h, in-use marked, 8 max', () => {
    const chips = usingChips([job({ usesBrowser: true, state: 'working' })], NOW);
    expect(chips.map((c) => [c.app, c.inUse])).toEqual([['browser', true]]);
    expect(usingChips([job({ usesBrowser: true, state: 'done', finishedAt: NOW - 30 * H })], NOW)).toEqual([]);
  });
  it('top 3 facts: most recently used, then newest; private never in a group', () => {
    const f = (id: string, over: Partial<MemoryFactView>): MemoryFactView =>
      ({
        id,
        scope: 'global',
        chatId: null,
        text: id,
        provenance: 'said',
        reason: null,
        private: false,
        learnedAt: NOW - 10 * H,
        lastUsedAt: null,
        file: 'memory/about-you.md',
        ...over,
      }) as MemoryFactView;
    const facts = [
      f('new', { learnedAt: NOW - H }),
      f('used', { lastUsedAt: NOW - 2 * H }),
      f('usedLater', { lastUsedAt: NOW - H }),
      f('old', {}),
      f('otherChat', { scope: 'chat', chatId: 'trips' }),
      f('helperNote', { scope: 'helper', file: 'helpers/h_trips/notes.md' }),
    ];
    const r = knowFacts(facts, chat('foo', 'foo'));
    expect(r.rows.map((x) => x.id)).toEqual(['usedLater', 'used', 'new']);
    expect(r.total).toBe(4);
    expect(knowFacts(facts, chat('trips', 'helper')).rows.map((x) => x.id)).toEqual(['helperNote']);
  });
});
