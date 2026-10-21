// 03-shell-2 §3.6.2.1: status line wording, first matching row wins (14 rows), and foo's-chat job scoping.
import { describe, expect, it } from 'vitest';
import { quietUntil, statusLine, type StatusInput } from '../../src/renderer/shell/statusLine';
import type { CardRow, ChatRow, HelperRow, JobRow } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST

const chat = (over: Partial<ChatRow> = {}): ChatRow =>
  ({
    id: 'c_foo',
    kind: 'foo',
    helperId: null,
    title: 'foo',
    avatarRef: null,
    colorToken: null,
    waJid: null,
    pinned: true,
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
    face: 'living:default',
    ...over,
  }) as ChatRow;

const job = (over: Partial<JobRow>): JobRow =>
  ({
    id: 'j1',
    chatId: 'c_foo',
    originChatId: 'c_foo',
    ownerKind: 'foo',
    ownerId: null,
    title: 'Goa stay',
    state: 'working',
    waitingReason: null,
    needsYouCardId: null,
    currentStepIdx: 2,
    stepCount: 4,
    route: null,
    usesBrowser: false,
    createdAt: NOW,
    startedAt: NOW,
    finishedAt: null,
    rev: 1,
    stepsDone: 2,
    nowLine: 'Comparing prices',
    slow: false,
    ...over,
  }) as JobRow;

const base = (over: Partial<StatusInput> = {}): StatusInput => ({
  chat: chat(),
  jobs: [],
  cards: {},
  setup: { complete: true, step: 5 },
  connection: 'online',
  ai: { displayName: 'Claude', state: 'ok' },
  takenOverJobIds: [],
  typing: false,
  quiet: null,
  now: NOW,
  timeZone: 'Asia/Kolkata',
  agentName: 'foo',
  helper: undefined,
  memberNames: [],
  ...over,
});

const everything = (): Partial<StatusInput> => ({
  setup: { complete: false, step: 2 },
  jobs: [
    job({ id: 'n', state: 'needs_you', needsYouCardId: 'k1' }),
    job({ id: 'w', state: 'working', usesBrowser: true }),
    job({ id: 'p', state: 'waiting', waitingReason: 'net_offline' }),
  ],
  cards: {
    k1: {
      id: 'k1',
      chatId: 'c_foo',
      type: 'payment',
      state: 'pending',
      payload: { payee: 'Pay Taj Holiday Village' },
      rev: 1,
    } as unknown as CardRow,
  },
  connection: 'offline',
  ai: { displayName: 'Claude', state: 'down' },
  takenOverJobIds: ['w'],
  typing: true,
  quiet: { until: NOW + 3_600_000 },
});

describe('status line precedence (first matching row wins)', () => {
  it('row 1 setup beats everything', () => {
    expect(statusLine(base(everything()))).toMatchObject({ row: 1, text: 'Setting up · step 2 of 2', tone: 'fg2' });
  });
  it('row 2 needs you (1 card title, 2+ count) beats row 3+', () => {
    const s = base({ ...everything(), setup: { complete: true, step: 5 } });
    expect(statusLine(s)).toMatchObject({ row: 2, text: 'Needs you: Pay Taj Holiday Village', tone: 'warn' });
    const two = { ...s, jobs: [...s.jobs, job({ id: 'n2', state: 'needs_you', needsYouCardId: 'k2' })] };
    expect(statusLine(two).text).toBe('Needs you: 2 things');
  });
  it('row 3 in control of the browser', () => {
    const s = base({ ...everything(), setup: { complete: true, step: 5 }, jobs: [job({ id: 'w', usesBrowser: true })] });
    expect(statusLine(s)).toMatchObject({ row: 3, text: 'You’re in control of the browser', tone: 'warn' });
  });
  it('rows 4–7 paused reasons in order', () => {
    const paused = (reason: JobRow['waitingReason'], extra: Partial<StatusInput> = {}) =>
      statusLine(base({ jobs: [job({ state: 'waiting', waitingReason: reason })], ...extra }));
    expect(paused('net_offline')).toMatchObject({ row: 4, text: 'Paused · you’re offline', tone: 'fg2' });
    expect(paused('ai_offline')).toMatchObject({ row: 4 });
    expect(paused('ai_down')).toMatchObject({ row: 5, text: 'Paused · Claude isn’t answering' });
    expect(paused('ai_signed_out')).toMatchObject({ row: 5, text: 'Paused · signed out of Claude' });
    expect(paused('ai_limit', { ai: { displayName: 'Claude', state: 'limit', resetAt: NOW + 2 * 3_600_000 } })).toMatchObject({
      row: 6,
      text: 'Paused · Claude limit until 11:00 AM',
    });
    expect(paused('spend_cap')).toMatchObject({ row: 7, text: 'Paused · AI cap reached' });
    // offline beats AI down when both jobs wait
    const both = base({
      jobs: [
        job({ id: 'a', state: 'waiting', waitingReason: 'ai_down' }),
        job({ id: 'b', state: 'waiting', waitingReason: 'net_offline' }),
      ],
    });
    expect(statusLine(both).row).toBe(4);
  });
  it('row 8 typing beats working', () => {
    expect(statusLine(base({ typing: true, jobs: [job({})] }))).toMatchObject({ row: 8, text: 'typing…', tone: 'accent' });
  });
  it('row 9 one job working, with and without step count', () => {
    expect(statusLine(base({ jobs: [job({})] }))).toMatchObject({ row: 9, text: 'Working on Goa stay · step 3 of 4', tone: 'accent' });
    expect(statusLine(base({ jobs: [job({ stepCount: 0, currentStepIdx: null })] })).text).toBe('Working on Goa stay');
  });
  it('row 10 two or more working', () => {
    expect(statusLine(base({ jobs: [job({ id: 'a' }), job({ id: 'b' })] }))).toMatchObject({ row: 10, text: 'Working on 2 jobs' });
  });
  it('row 11 quiet hours (today and another day)', () => {
    expect(statusLine(base({ quiet: { until: NOW + 3_600_000 } }))).toMatchObject({ row: 11, text: 'Quiet until 10:00 AM' });
    expect(statusLine(base({ quiet: { until: NOW + 24 * 3_600_000 } })).text).toBe('Quiet until Sat 17 Oct, 9:00 AM');
  });
  it('rows 12–14 idle per chat kind', () => {
    expect(statusLine(base())).toMatchObject({ row: 12, text: 'Awake on your PC', tone: 'ok', dot: true });
    const helper = {
      id: 'h1',
      name: 'Trips',
      jobText: 'Plans trips and books travel',
      faceRef: 'letter:T',
      colorToken: '--h-terracotta',
    } as HelperRow;
    expect(statusLine(base({ chat: chat({ id: 'c_t', kind: 'helper', helperId: 'h1' }), helper }))).toMatchObject({
      row: 13,
      text: 'Plans trips and books travel',
      tone: 'fg2',
    });
    expect(statusLine(base({ chat: chat({ id: 'c_g', kind: 'group' }), memberNames: ['foo', 'Trips', 'Money'] }))).toMatchObject({
      row: 14,
      text: 'You, foo, Trips, Money',
    });
  });
  it('private chat idle line replaces row 12 (12-2 §12.30.4)', () => {
    expect(statusLine(base({ chat: chat({ private: true }) }))).toMatchObject({ row: 12, text: 'Nothing here is remembered', tone: 'fg2' });
  });
  it("foo's chat counts only its own jobs; finished jobs never count", () => {
    const s = base({ jobs: [job({ chatId: 'c_trips' }), job({ id: 'd', state: 'done' })] });
    expect(statusLine(s).row).toBe(12);
  });
});

describe('quietUntil (row 11 input)', () => {
  const q = { on: true, from: '2200', to: '0700', days: [0, 1, 2, 3, 4, 5, 6] };
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 16, h, m) - 5.5 * 3_600_000; // IST wall clock on Fri 16 Oct
  it('inside an overnight window, before and after midnight', () => {
    expect(quietUntil(q, at(23), 'Asia/Kolkata')).toBe(at(31));
    expect(quietUntil(q, at(6, 30), 'Asia/Kolkata')).toBe(at(7));
  });
  it('outside, off, or on a day not listed', () => {
    expect(quietUntil(q, at(9), 'Asia/Kolkata')).toBeNull();
    expect(quietUntil({ ...q, on: false }, at(23), 'Asia/Kolkata')).toBeNull();
    expect(quietUntil({ ...q, days: [6] }, at(23), 'Asia/Kolkata')).toBeNull();
  });
});
