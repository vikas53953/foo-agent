// 02-2 §F15.9.3 (the 18 moods from real state only; priority Offline → Needs you → Stuck → Working → Waiting on you →
// Thinking → Listening → Asleep → Resting; one-time moods and Speaking on top), §F15.9.3c (10 s repeat guard; Celebrating
// once a day), §F15.9.9 (selectChatMood, playOnce, faceQueue max 3).
import { beforeEach, describe, expect, it } from 'vitest';
import { MOODS, ONE_TIME_MS } from '../../../src/shared/face';
import type { CardRow, ChatRow, JobRow, MessageRow, PublicSettings } from '../../../src/shared/types';
import { initialState, type RootState } from '../../../src/renderer/store/index';
import {
  chatMood,
  noteJobForFace,
  noteMessageForFace,
  playOnceReducer,
  resetFaceGuard,
  selectOnceStart,
  selectChatMood,
  type MoodInput,
  wakeReducer,
} from '../../../src/renderer/store/live';
import { REDUCERS } from '../../../src/renderer/store/apply';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';

// Fri 16 Oct 2026, 9:00 AM IST.
const NOW = Date.UTC(2026, 9, 16, 3, 30);
// 11:00 PM IST, inside the default quiet hours (10 PM – 7 AM).
const NIGHT = Date.UTC(2026, 9, 16, 17, 30);

const job = (over: Partial<JobRow>): JobRow =>
  ({ id: 'j1', chatId: 'c1', state: 'working', needsYouCardId: null, slow: false, proof: null, ...over }) as JobRow;
const card = (over: Partial<CardRow>): CardRow =>
  ({ id: 'k1', chatId: 'c1', jobId: 'j1', type: 'choice', state: 'pending', ...over }) as CardRow;

const input = (over: Partial<MoodInput> = {}): MoodInput => ({
  connection: 'online',
  jobs: [],
  pill: null,
  cards: {},
  cardSeenAt: {},
  replyInFlight: false,
  keystrokeAt: null,
  quiet: false,
  now: NOW,
  ...over,
});

describe('the face mood list (§F15.9.9 Mood)', () => {
  it('has the 18 rows of §F15.9.3 in order', () => {
    expect(MOODS).toEqual([
      'resting',
      'waking',
      'noticed',
      'listening',
      'thinking',
      'working',
      'stuck',
      'needs_you',
      'waiting',
      'happy',
      'celebrating',
      'thumbs_up',
      'heart',
      'speaking',
      'sorry',
      'stopped',
      'offline',
      'asleep',
    ]);
  });
  it('gives each one-time mood its §F15.9.3 duration', () => {
    expect(ONE_TIME_MS).toEqual({
      waking: 600,
      noticed: 400,
      happy: 2000,
      celebrating: 1600,
      thumbs_up: 900,
      heart: 900,
      sorry: 3000,
      stopped: 1500,
    });
  });
});

describe('state-held moods (§F15.9.3 triggers)', () => {
  it('rests with nothing in flight', () => expect(chatMood(input())).toBe('resting'));
  it('works while a job is WORKING', () => expect(chatMood(input({ jobs: [job({})] }))).toBe('working'));
  it('needs you while a NEEDS YOU card is not yet seen', () =>
    expect(chatMood(input({ jobs: [job({ state: 'needs_you', needsYouCardId: 'k1' })], cards: { k1: card({}) } }))).toBe('needs_you'));
  it('waits on you once the card has been seen', () =>
    expect(
      chatMood(
        input({ jobs: [job({ state: 'needs_you', needsYouCardId: 'k1' })], cards: { k1: card({}) }, cardSeenAt: { k1: NOW - 2000 } }),
      ),
    ).toBe('waiting'));
  it('is stuck when the seen card is a stuck card', () =>
    expect(
      chatMood(
        input({
          jobs: [job({ state: 'needs_you', needsYouCardId: 'k1' })],
          cards: { k1: card({ type: 'stuck' }) },
          cardSeenAt: { k1: NOW },
        }),
      ),
    ).toBe('stuck'));
  it('thinks while a reply request is in flight', () => expect(chatMood(input({ replyInFlight: true }))).toBe('thinking'));
  it('listens for 5 s after a keystroke in the open chat', () => {
    expect(chatMood(input({ keystrokeAt: NOW - 4999 }))).toBe('listening');
    expect(chatMood(input({ keystrokeAt: NOW - 5000 }))).toBe('resting');
  });
  it('goes offline while the offline line shows (no internet or the AI unreachable)', () => {
    expect(chatMood(input({ connection: 'offline' }))).toBe('offline');
    expect(chatMood(input({ connection: 'ai_down' }))).toBe('offline');
  });
  it('sleeps in quiet hours only when no job of the chat is live', () => {
    expect(chatMood(input({ quiet: true }))).toBe('asleep');
    expect(chatMood(input({ quiet: true, jobs: [job({ state: 'waiting' })] }))).toBe('resting');
    expect(chatMood(input({ quiet: true, jobs: [job({ state: 'done' })] }))).toBe('asleep');
  });
  it('gives a WAITING (paused) job no mood of its own', () => {
    expect(chatMood(input({ jobs: [job({ state: 'waiting' })] }))).toBe('resting');
    expect(chatMood(input({ jobs: null, pill: 'paused' }))).toBe('resting');
  });
  it("uses the row's pill while the chat's jobs are not loaded", () => {
    expect(chatMood(input({ jobs: null, pill: 'working' }))).toBe('working');
    expect(chatMood(input({ jobs: null, pill: 'needs_you' }))).toBe('needs_you');
  });
});

describe('priority (§F15.9.3)', () => {
  const all = input({
    connection: 'offline',
    jobs: [
      job({ id: 'a' }),
      job({ id: 'b', state: 'needs_you', needsYouCardId: 'k1' }),
      job({ id: 'c', state: 'needs_you', needsYouCardId: 'k2' }),
    ],
    cards: { k1: card({}), k2: card({ id: 'k2', type: 'stuck' }) },
    cardSeenAt: { k2: NOW },
    replyInFlight: true,
    keystrokeAt: NOW,
    quiet: true,
  });
  it('walks Offline → Needs you → Stuck → Working → Thinking → Listening', () => {
    expect(chatMood(all)).toBe('offline');
    const online = { ...all, connection: 'online' as const };
    expect(chatMood(online)).toBe('needs_you');
    const seen = { ...online, cardSeenAt: { k1: NOW, k2: NOW } };
    expect(chatMood(seen)).toBe('stuck');
    expect(chatMood({ ...online, jobs: [job({})] })).toBe('working');
    expect(chatMood({ ...online, jobs: [job({ state: 'needs_you', needsYouCardId: 'k1' })], cardSeenAt: { k1: NOW } })).toBe('waiting');
    expect(chatMood({ ...online, jobs: [] })).toBe('thinking');
    expect(chatMood({ ...online, jobs: [], replyInFlight: false })).toBe('listening');
    expect(chatMood({ ...online, jobs: [], replyInFlight: false, keystrokeAt: null })).toBe('asleep');
  });
});

function world(now = NOW): RootState {
  const s = initialState(now);
  const settings = structuredClone(settingsDefaults);
  settings.locale.timeZone = 'Asia/Kolkata';
  s.settings.value = settings as unknown as PublicSettings;
  s.chats.byId.c1 = { id: 'c1', kind: 'foo', face: 'living:default', pill: null, lastActivityAt: now } as unknown as ChatRow;
  s.chats.order = ['c1'];
  return s;
}

describe('selectChatMood and playOnce (§F15.9.9)', () => {
  beforeEach(() => resetFaceGuard());

  it('shows the head of the one-time queue, then returns to what is true', () => {
    const s = world();
    s.jobs.byId.j1 = job({});
    s.jobs.byChat.c1 = ['j1'];
    expect(selectChatMood('c1')(s)).toBe('working');
    playOnceReducer(s.live, 'c1', 'noticed', NOW);
    expect(selectChatMood('c1')(s)).toBe('noticed');
    s.live.now = NOW + 400;
    expect(selectChatMood('c1')(s)).toBe('working');
  });
  it("plays Speaking on top while foo's voice note plays", () => {
    const s = world();
    s.live.speaking.c1 = true;
    expect(selectChatMood('c1')(s)).toBe('speaking');
  });
  it('reads quiet hours from settings.notifications.quiet', () => {
    expect(selectChatMood('c1')(world(NIGHT))).toBe('asleep');
  });
  it('keeps at most 3 entries and never repeats a mood within 10 s', () => {
    const s = world();
    expect(playOnceReducer(s.live, 'c1', 'noticed', NOW)).toBe(true);
    expect(playOnceReducer(s.live, 'c1', 'noticed', NOW + 9999)).toBe(false);
    playOnceReducer(s.live, 'c1', 'sorry', NOW);
    playOnceReducer(s.live, 'c1', 'stopped', NOW);
    playOnceReducer(s.live, 'c1', 'heart', NOW);
    expect(s.live.faceQueue.c1!.map((q) => q.mood)).toEqual(['sorry', 'stopped', 'heart']);
    expect(playOnceReducer(s.live, 'c1', 'noticed', NOW + 10_000)).toBe(true);
  });
});

describe('who calls playOnce (§F15.9.9)', () => {
  beforeEach(() => resetFaceGuard());
  const head = (s: RootState) => s.live.faceQueue.c1?.[0]?.mood;

  it('DONE with proof → Happy; DONE without proof → nothing', () => {
    const s = world();
    noteJobForFace(s, 'working', job({ state: 'done', proof: { kind: 'page' } }), NOW);
    expect(head(s)).toBe('happy');
    const t = world();
    noteJobForFace(t, 'working', job({ state: 'done_unverified' }), NOW);
    noteJobForFace(t, 'working', job({ state: 'done', proof: null }), NOW);
    expect(head(t)).toBeUndefined();
  });
  it("Celebrates the day's first DONE after an approved card, then Happy for the rest of the day", () => {
    const s = world();
    s.cards.byId.k1 = card({ type: 'approval', state: 'completed' });
    noteJobForFace(s, 'working', job({ state: 'done', proof: {} }), NOW);
    expect(head(s)).toBe('celebrating');
    expect(s.live.celebratedOn).toBe('2026-10-16');
    s.live.faceQueue = {};
    s.cards.byId.k2 = card({ id: 'k2', jobId: 'j2', type: 'payment', state: 'completed' });
    noteJobForFace(s, 'working', job({ id: 'j2', state: 'done', proof: {} }), NOW + 60_000);
    expect(head(s)).toBe('happy');
  });
  it('never celebrates in quiet hours (Happy instead)', () => {
    const s = world(NIGHT);
    s.cards.byId.k1 = card({ type: 'approval', state: 'completed' });
    noteJobForFace(s, 'working', job({ state: 'done', proof: {} }), NIGHT);
    expect(head(s)).toBe('happy');
  });
  it('FAILED → Sorry, CANCELLED → Stopped; a first sight of a job plays nothing', () => {
    const s = world();
    noteJobForFace(s, 'working', job({ state: 'failed' }), NOW);
    expect(head(s)).toBe('sorry');
    const t = world();
    noteJobForFace(t, 'working', job({ state: 'cancelled' }), NOW);
    expect(head(t)).toBe('stopped');
    const u = world();
    noteJobForFace(u, undefined, job({ state: 'failed' }), NOW);
    expect(head(u)).toBeUndefined();
  });
  it('never plays one-time moods in a group', () => {
    const s = world();
    (s.chats.byId.c1 as { kind: string }).kind = 'group';
    noteJobForFace(s, 'working', job({ state: 'failed' }), NOW);
    expect(head(s)).toBeUndefined();
  });
  it("foo's 👍 / ❤️ on the user's bubble → Thumbs up / Heart", () => {
    const s = world();
    const m = { id: 'm1', chatId: 'c1', authorKind: 'user', reactions: [{ emoji: '👍', by: 'foo' }] } as unknown as MessageRow;
    noteMessageForFace(s, [], m, NOW);
    expect(head(s)).toBe('thumbs_up');
    const t = world();
    noteMessageForFace(t, [], { ...m, reactions: [{ emoji: '❤️', by: 'foo' }] }, NOW);
    expect(head(t)).toBe('heart');
    const u = world();
    noteMessageForFace(u, [], { ...m, reactions: [{ emoji: '👍', by: 'me' }] }, NOW);
    expect(head(u)).toBeUndefined();
  });
});

describe('P1 T2 callers: Waking up, Noticed (§F15.9.3 #2, #3)', () => {
  beforeEach(() => resetFaceGuard());

  it('wakeReducer plays Waking up on foo and helper chats, never a group', () => {
    const s = world();
    s.chats.byId.g1 = { id: 'g1', kind: 'group', face: 'living:default', pill: null, lastActivityAt: NOW } as unknown as ChatRow;
    s.chats.order = ['c1', 'g1'];
    wakeReducer(s, NOW);
    expect(s.live.faceQueue.c1?.[0]?.mood).toBe('waking');
    expect(s.live.faceQueue.g1).toBeUndefined();
  });
  it('wakeReducer skips a helper with a letter face (no eyes to open, §F15.9.4)', () => {
    const s = world();
    s.chats.byId.h1 = { id: 'h1', kind: 'helper', face: 'letter:T', pill: null, lastActivityAt: NOW } as unknown as ChatRow;
    s.chats.order = ['c1', 'h1'];
    wakeReducer(s, NOW);
    expect(s.live.faceQueue.h1).toBeUndefined();
  });
  it('👀 (message badge "seen") plays Noticed in a 1:1 chat, not in a group', () => {
    const s = world();
    s.messages.byChat.c1 = {
      byId: { m1: { id: 'm1', chatId: 'c1', reactions: [] } },
    } as unknown as RootState['messages']['byChat'][string];
    REDUCERS['message:badge'](s, { messageId: 'm1', badge: 'seen' } as Parameters<(typeof REDUCERS)['message:badge']>[1]);
    expect(s.live.faceQueue.c1?.[0]?.mood).toBe('noticed');
    const g = world();
    g.chats.byId.c1!.kind = 'group';
    g.messages.byChat.c1 = s.messages.byChat.c1!;
    REDUCERS['message:badge'](g, { messageId: 'm1', badge: 'seen' } as Parameters<(typeof REDUCERS)['message:badge']>[1]);
    expect(g.live.faceQueue.c1).toBeUndefined();
  });
  it('selectOnceStart: when the one-time mood now playing began, so a face that mounts part-way joins it there', () => {
    const s = world();
    playOnceReducer(s.live, 'c1', 'waking', NOW);
    playOnceReducer(s.live, 'c1', 'noticed', NOW);
    expect(selectOnceStart('waking')(s)).toBe(NOW);
    expect(selectOnceStart('noticed')(s)).toBeUndefined();
    s.live.now = NOW + ONE_TIME_MS.waking + 100;
    expect(selectOnceStart('noticed')(s)).toBe(NOW + ONE_TIME_MS.waking);
    expect(selectOnceStart('resting')(s)).toBeUndefined();
  });
});
