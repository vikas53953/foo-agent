// Spec: 08-3 §16.1.3 (on connect store history_id from getProfile; every 5 min while online and not suspended history.list
// (messageAdded, INBOX, ≤ 500) paging on nextPageToken; save the newest historyId after processing; each new message id
// emitted once to on_email routines and the brief collector; 404 → re-baseline: getProfile + messages.list(newer_than:1d,
// INBOX, ≤ 50), de-duplicated against routine_runs and brief records; on resume one poll at once; at login the first poll
// waits for the 20 s delay, 09 §9.7).
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { RateLimiter } from '../../src/engine/tools/connectors/limiter';
import { GmailPoller, POLL_EVERY_MS, LOGIN_DELAY_MS, createGmail } from '../../src/engine/tools/connectors/gmail';
import { ConnectorHooks, type NewEmail } from '../../src/engine/connectors/hooks';
import { drive, fakeAccess, fakeGmailRead, fakeGoogle, gmailState, type FakeMessage } from '../fakes/connectors/gmail-read';

const mail = (id: string, historyId: number): FakeMessage => ({
  id,
  from: `Sender ${id} <${id}@example.com>`,
  subject: `Subject ${id}`,
  internalDate: Date.UTC(2026, 9, 16, 3, 0),
  snippet: '',
  text: 'hi',
  historyId,
});

function setup(over: Parameters<typeof gmailState>[0] = {}) {
  const clock = new FakeClock();
  const state = gmailState({ messages: [], historyId: 100, ...over });
  const g = fakeGoogle([fakeGmailRead(state)], () => clock.now());
  const gmail = createGmail({ http: g.fetch, access: fakeAccess().access, clock, limiter: new RateLimiter(clock) });
  const hooks = new ConnectorHooks();
  const onEmail: NewEmail[] = [];
  const brief: string[] = [];
  const handled = new Set<string>();
  hooks.addEmailHook({ onEmail: (m) => void onEmail.push(m), seen: (id) => handled.has(id) });
  hooks.addBriefSource({ collect: (m) => void brief.push(m.messageId) });
  let saved: string | null = null;
  let online = true;
  const poller = new GmailPoller({
    gmail,
    clock,
    hooks,
    store: { load: async () => saved, save: async (h) => void (saved = h) },
    online: () => online,
  });
  /** Adds a message the way Gmail does: the mailbox's historyId moves to it. */
  const arrive = (id: string) => {
    state.historyId += 1;
    state.messages.push(mail(id, state.historyId));
  };
  return {
    clock,
    g,
    state,
    poller,
    onEmail,
    brief,
    handled,
    arrive,
    saved: () => saved,
    setOnline: (v: boolean) => (online = v),
  };
}

describe('08-3 §16.1.3 · Gmail poller', () => {
  it('baseline on connect stores getProfile().historyId and emits nothing', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    expect(t.saved()).toBe('100');
    expect(t.onEmail).toEqual([]);
  });

  it('new inbox messages are emitted once each to on_email and the brief, then the newest historyId is saved', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    t.arrive('a1');
    t.arrive('a2');
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail.map((m) => m.messageId)).toEqual(['a1', 'a2']);
    expect(t.onEmail[0]).toEqual({
      messageId: 'a1',
      threadId: 'a1',
      from: 'Sender a1 <a1@example.com>',
      subject: 'Subject a1',
      date: '2026-10-16T03:00:00.000Z',
    });
    expect(t.brief).toEqual(['a1', 'a2']);
    expect(t.saved()).toBe('102');
    // polling again finds nothing new
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail).toHaveLength(2);
  });

  it('pages on nextPageToken (history page size 2, five new messages → three pages, all five once)', async () => {
    const t = setup({ historyPageSize: 2 });
    await drive(t.poller.baseline(), t.clock);
    for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) t.arrive(id);
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail.map((m) => m.messageId)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    const pages = t.g.requests.filter((r) => r.path.endsWith('/history'));
    expect(pages.map((r) => r.query.pageToken)).toEqual([undefined, '2', '4']);
    expect(pages[0]!.query).toMatchObject({ startHistoryId: '100', historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: '500' });
  });

  it('404 (history too old) → re-baseline: newest historyId + newer_than:1d pass, skipping what a hook already handled', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    t.arrive('c1');
    t.arrive('c2');
    t.handled.add('c1'); // e.g. a routine_runs row exists for it
    t.state.oldestHistoryId = 150; // the saved 100 is now too old
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail.map((m) => m.messageId)).toEqual(['c2']);
    expect(t.saved()).toBe('102');
    const list = t.g.requests.find((r) => r.path === '/gmail/v1/users/me/messages');
    expect(list?.query).toEqual({ q: 'newer_than:1d', labelIds: 'INBOX', maxResults: '50' });
  });

  it('no saved historyId → baseline, nothing emitted', async () => {
    const t = setup();
    t.arrive('d1');
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail).toEqual([]);
    expect(t.saved()).toBe('101');
  });

  it('runs every 5 minutes; offline or suspended skips the poll; resume polls at once', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    t.poller.start({ atLogin: false });
    const polls = () => t.g.requests.filter((r) => r.path.endsWith('/history')).length;
    t.clock.advance(0);
    await drive(Promise.resolve(), t.clock);
    expect(polls()).toBe(1);
    t.clock.advance(POLL_EVERY_MS);
    await drive(Promise.resolve(), t.clock);
    expect(polls()).toBe(2);
    t.setOnline(false);
    t.clock.advance(POLL_EVERY_MS);
    await drive(Promise.resolve(), t.clock);
    expect(polls()).toBe(2);
    t.setOnline(true);
    t.poller.suspend();
    t.clock.advance(POLL_EVERY_MS * 2);
    await drive(Promise.resolve(), t.clock);
    expect(polls()).toBe(2);
    t.arrive('e1');
    t.poller.resume();
    t.clock.advance(0);
    await drive(Promise.resolve(), t.clock);
    expect(polls()).toBe(3);
    expect(t.onEmail.map((m) => m.messageId)).toEqual(['e1']);
    t.poller.stop();
    t.clock.advance(POLL_EVERY_MS * 3);
    await drive(Promise.resolve(), t.clock);
    expect(polls()).toBe(3);
  });

  it('at login the first poll waits for the 20 s delay', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    t.poller.start({ atLogin: true });
    const polls = () => t.g.requests.filter((r) => r.path.endsWith('/history')).length;
    t.clock.advance(LOGIN_DELAY_MS - 1);
    await drive(Promise.resolve(), t.clock, 0, 0);
    expect(polls()).toBe(0);
    t.clock.advance(1);
    await drive(Promise.resolve(), t.clock, 0, 0);
    expect(polls()).toBe(1);
    t.poller.stop();
  });

  it('a message deleted before it is fetched (404) is skipped; the others are emitted and the historyId moves on', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    t.arrive('d1');
    t.arrive('d2');
    t.g.failNext('/gmail/v1/users/me/messages/d1', { status: 404 });
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail.map((m) => m.messageId)).toEqual(['d2']);
    expect(t.saved()).toBe('102');
  });

  it('a listener that throws (sync or async) never stops the other listeners', async () => {
    const hooks = new ConnectorHooks();
    const got: string[] = [];
    hooks.addEmailHook({
      onEmail: () => {
        throw new Error('sync');
      },
    });
    hooks.addEmailHook({ onEmail: () => Promise.reject(new Error('async')) });
    hooks.addEmailHook({ onEmail: (m) => void got.push(`email:${m.messageId}`) });
    hooks.addBriefSource({ collect: (m) => void got.push(`brief:${m.messageId}`) });
    await hooks.emitEmail({ messageId: 'm1', threadId: 't1', from: 'a@example.com', subject: 's', date: '2026-10-16T03:00:00Z' });
    expect(got).toEqual(['email:m1', 'brief:m1']);
  });

  it('a poll that fails keeps the saved historyId and emits nothing', async () => {
    const t = setup();
    await drive(t.poller.baseline(), t.clock);
    t.arrive('f1');
    t.g.failNext('/gmail/v1/users/me/history', { status: 500 }, { status: 500 }, { status: 500 });
    await drive(t.poller.pollOnce(), t.clock);
    expect(t.onEmail).toEqual([]);
    expect(t.saved()).toBe('100');
  });
});
