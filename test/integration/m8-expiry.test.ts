// Spec: AT-220 (J19: the Gmail connection expires → the jobs that need Gmail go to WAITING with one error card "Your Gmail
// connection expired. Bills and drafts are on hold." [ Reconnect ]; Settings → Connections shows Needs sign-in; reconnected →
// the card is edited in place and the jobs resume at the same step), 08-3 §21.2 rows CONN_EXPIRED / CONN_REVOKED /
// CONN_RATE_LIMITED, §21.3 CONN_SCOPE_MISSING, §16.1 Tokens (`invalid_grant` → the three rows needs_signin), 07-2 SM-A10,
// 08-3 §22.4 (fakes only: the fake Google token endpoint and the fake Gmail; never a real Google call).
// Engine: the real runner + ToolLayer + Gmail tools over the harness db; main: T2's GoogleConnections on the same db, holding
// the token and answering the engine's `connection.google` (gap pick T5-01).
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { googleEndpoints } from '../../src/engine/tools/connectors/google';
import type { HttpFetch } from '../../src/engine/tools/connectors/types';
import { GoogleConnections } from '../../src/main/connections/GoogleConnections';
import type { Db } from '../../src/main/store/db';
import { MemoryConnTokenStore } from '../../src/main/vault/connTokenMemory';
import { openLoopback, type Loopback } from '../../src/main/windows/oauthLoopback';
import { t } from '../../src/shared/copy/t';
import { fakeGoogle, fakeGmailRead, gmailState, type FakeGoogle as FakeApis } from '../fakes/connectors/gmail-read';
import { FAKE_CLIENT, FakeGoogle } from '../fakes/connectors/google-oauth';
import { BILLS_PLAN, jobHarness, jobIntake, realPause, step, stepDone, tool, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

/** GET the loopback the way the browser does after Google's consent screen. */
function hit(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      res.resume();
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.end();
  });
}

interface World {
  h: JobHarness;
  svc: GoogleConnections;
  oauth: FakeGoogle;
  apis: FakeApis;
  /** Plays Google's redirect back to foo after the consent screen (sign-in or Reconnect). */
  signIn(): Promise<void>;
}

const RESULT = 'Two bills are due this week: electricity ₹1,240 by Tue 20 Oct and broadband ₹799 by Thu 22 Oct.';
/** The rest of AT-020's bills job after the search that worked: read one bill, then done with the emails_read proof. */
const FINISH = [
  stepDone(0, { delayMs: 200, once: true }),
  tool('gmail.read', { messageId: 'm_bill_fibre' }, { delayMs: 200, once: true }),
  stepDone(1, { delayMs: 200, once: true }),
  step(
    { kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 2, messageIds: ['m_bill_power', 'm_bill_fibre'] } },
    { delayMs: 200 },
  ),
];

function world(script: Parameters<typeof jobHarness>[0]['script']): World {
  const oauth = new FakeGoogle();
  const apis = fakeGoogle([fakeGmailRead(gmailState())]);
  // One fetch for both fakes: the token endpoint answers on oauth2's path, every Gmail path is the fake Gmail.
  const http: HttpFetch = (url, init) => (url.includes('oauth2.googleapis.com') ? oauth.fetch(url, init) : apis.fetch(url, init));
  const opened: string[] = [];
  const loopbacks: Loopback[] = [];
  let svc: GoogleConnections | null = null;
  const x = jobHarness({
    script,
    google: (db: Db) => {
      svc = new GoogleConnections({
        db,
        now: () => x.clock.now(),
        http,
        endpoints: googleEndpoints({}),
        tokens: new MemoryConnTokenStore(),
        client: () => ({ clientId: FAKE_CLIENT.clientId, clientSecret: FAKE_CLIENT.clientSecret }),
        online: () => true,
        openLoopback: async (state) => {
          const lb = await openLoopback({ state, ttlMs: 5_000 });
          loopbacks.push(lb);
          return lb;
        },
        openExternal: async (url) => void opened.push(url),
        emit: () => undefined,
        engineCmd: () => undefined,
        // Main's push, as connectionIpc sends it.
        engineState: (s) => x.bridge.send('connection.state', s),
      });
      return { forEngine: (req) => svc!.forEngine(req), http };
    },
  });
  h = x;
  return {
    h: x,
    svc: svc!,
    oauth,
    apis,
    async signIn() {
      const r = await svc!.connect(undefined);
      expect(r.ok).toBe(true);
      const state = new URL(opened.at(-1)!).searchParams.get('state');
      const lb = loopbacks.at(-1)!;
      await hit(`${lb.redirectUri}?state=${state}&code=fake-code`);
      await lb.result;
      // The token exchange is real async I/O on the fake: let it land.
      for (let i = 0; i < 50 && svc!.engineState().status !== 'connected'; i++) await realPause(5);
    },
  };
}

const rows = (x: JobHarness) =>
  x.db.prepare('SELECT app, status, last_error_kind FROM connections ORDER BY app').all() as {
    app: string;
    status: string;
    last_error_kind: string | null;
  }[];
const errorCards = (x: JobHarness) =>
  x
    .cards('error')
    .map((c) => ({ id: String(c.id), state: String(c.state), payload: JSON.parse(String(c.payload)) as Record<string, unknown> }));

describe('AT-220 · Gmail expires → jobs wait with one card; Reconnect resumes them at the same step', () => {
  it('invalid_grant: WAITING, one error card, rows needs_signin; Reconnect edits the card in place and the job finishes', async () => {
    const w = world([
      jobIntake(BILLS_PLAN, { title: 'Find bills' }),
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 200, once: true }),
      // After Reconnect the same step runs again.
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 200, once: true }),
      ...FINISH,
    ]);
    const { h: x } = w;
    await w.signIn();
    // Google now refuses the refresh token (the access token is fetched on first use).
    w.oauth.opts.refresh = 'expired';
    x.userSays('Find bills due this week');
    await x.settle();

    const job = x.job();
    expect(job.state).toBe('waiting');
    expect(job.waiting_reason).toBeNull();
    const cards = errorCards(x);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.state).toBe('asking');
    expect(cards[0]!.payload).toMatchObject({
      kind: 'CONN_EXPIRED',
      whatHappened: 'Your Gmail connection expired.',
      whatIsSafe: 'Bills and drafts are on hold.',
      button: { label: 'Reconnect', action: { kind: 'reconnect', app: 'google' } },
      jobId: job.id,
      atStep: 1,
    });
    expect(`${String(cards[0]!.payload.whatHappened)} ${String(cards[0]!.payload.whatIsSafe)}`).toBe(
      'Your Gmail connection expired. Bills and drafts are on hold.',
    );
    // Settings → Connections reads the rows: Needs sign-in on all three ("Your Gmail connection expired.", 06-2 §6.8).
    expect(rows(x).map((r) => [r.status, r.last_error_kind])).toEqual(Array(3).fill(['needs_signin', 'CONN_EXPIRED']));
    // The step did not move and the failure did not count toward STUCK.
    const stepBefore = job.current_step_idx;
    expect(job.fail_streak).toBe(0);

    // Reconnect: Google takes the new sign-in; the same card is edited, no second card or message.
    w.oauth.opts.refresh = 'ok';
    const messagesBefore = x.messages().length;
    await w.signIn();
    await x.settle();
    const after = errorCards(x);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(cards[0]!.id);
    expect(after[0]!.state).toBe('fixed');
    expect(after[0]!.payload.resumedLine).toBe(t('cards.checklist.resumed', { n: 1 }));
    // One card message for the error, ever (SM-A10: edited in place, never a new message).
    expect(x.messages().filter((m) => m.card_id === cards[0]!.id)).toHaveLength(1);
    expect(x.messages().length).toBeGreaterThan(messagesBefore - 1);
    const done = x.job();
    expect(done.state).toBe('done');
    expect(rows(x).every((r) => r.status === 'connected')).toBe(true);
    // Same step: the second gmail.search ran on step 0, where the first one stopped.
    const calls = x.toolCalls().filter((c) => c.tool === 'gmail.search');
    expect(calls.map((c) => c.outcome)).toEqual(['error', 'ok']);
    expect(calls.map((c) => c.step_id)).toEqual([calls[0]!.step_id, calls[0]!.step_id]);
    expect(stepBefore).toBe(0);
  });

  it('two jobs needing Gmail: each waits with its own one card, and both resume after one Reconnect', async () => {
    const w = world([
      jobIntake(BILLS_PLAN, { title: 'Find bills', match: 'bills' }),
      jobIntake(BILLS_PLAN, { title: 'Find receipts', match: 'receipts' }),
      tool('gmail.search', { query: 'bill' }, { delayMs: 200, match: { purpose: 'step', chatId: 'c_asha' } }),
      tool('gmail.search', { query: 'receipt' }, { delayMs: 200, match: { purpose: 'step', chatId: 'c_ravi' } }),
    ]);
    const { h: x } = w;
    await w.signIn();
    w.oauth.opts.refresh = 'expired';
    x.userSaysIn(x.chat('asha'), 'Find bills due this week');
    x.userSaysIn(x.chat('ravi'), 'Find receipts from last month');
    await x.settle();
    expect(x.jobs().map((j) => j.state)).toEqual(['waiting', 'waiting']);
    const cards = errorCards(x);
    expect(cards.map((c) => c.payload.jobId).sort()).toEqual(
      x
        .jobs()
        .map((j) => j.id)
        .sort(),
    );
    w.oauth.opts.refresh = 'ok';
    await w.signIn();
    await x.settle();
    expect(errorCards(x).map((c) => c.state)).toEqual(['fixed', 'fixed']);
    expect(errorCards(x)).toHaveLength(2);
    for (const j of x.jobs()) expect(j.state).not.toBe('waiting');
  });
});

describe('08-3 §21.2 · revoked, rate-limited; §21.3 scope missing', () => {
  it('a 401 right after a successful refresh is CONN_REVOKED: "Google no longer lets me use your Gmail." and rows needs_signin', async () => {
    const w = world([jobIntake(BILLS_PLAN, { title: 'Find bills' }), tool('gmail.search', { query: 'bill' }, { delayMs: 200 })]);
    const { h: x } = w;
    await w.signIn();
    w.apis.failNext('/gmail/v1/users/me/messages', { status: 401 }, { status: 401 });
    x.userSays('Find bills due this week');
    await x.settle();
    expect(x.job().state).toBe('waiting');
    const [card] = errorCards(x);
    expect(card!.payload).toMatchObject({
      kind: 'CONN_REVOKED',
      whatHappened: 'Google no longer lets me use your Gmail.',
      whatIsSafe: 'Bills and drafts are on hold.',
      button: { label: 'Reconnect', action: { kind: 'reconnect', app: 'google' } },
    });
    expect(rows(x).map((r) => [r.status, r.last_error_kind])).toEqual(Array(3).fill(['needs_signin', 'CONN_REVOKED']));
  });

  it('Google refuses the refresh as revoked → CONN_REVOKED on the card (the rows say why)', async () => {
    const w = world([jobIntake(BILLS_PLAN, { title: 'Find bills' }), tool('gmail.search', { query: 'bill' }, { delayMs: 200 })]);
    const { h: x } = w;
    await w.signIn();
    w.oauth.opts.refresh = 'revoked';
    x.userSays('Find bills due this week');
    await x.settle();
    expect(errorCards(x).map((c) => c.payload.kind)).toEqual(['CONN_REVOKED']);
  });

  it('rate limited: the card "Gmail is asking me to slow down.", the step runs once more after 60 s, the card is edited', async () => {
    const w = world([
      jobIntake(BILLS_PLAN, { title: 'Find bills' }),
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 200, once: true }),
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 200, once: true }),
      ...FINISH,
    ]);
    const { h: x } = w;
    await w.signIn();
    // 429 on all three tries of §16.1 Calls.
    w.apis.failNext('/gmail/v1/users/me/messages', { status: 429 }, { status: 429 }, { status: 429 });
    x.userSays('Find bills due this week');
    // Up to the card: short clock steps so the 60 s wait has not passed yet.
    for (let i = 0; i < 40 && errorCards(x).length === 0; i++) await x.settle(100);
    const [card] = errorCards(x);
    expect(card!.payload).toMatchObject({
      kind: 'CONN_RATE_LIMITED',
      whatHappened: 'Gmail is asking me to slow down.',
      whatIsSafe: 'I’ll try again in a minute. Nothing was sent.',
      button: { label: 'Try again', action: { kind: 'retry' } },
    });
    expect(card!.state).toBe('asking');
    // Not WAITING: the tool call failed and the step waits for its one retry; nothing counted toward STUCK yet.
    expect(x.job().state).toBe('working');
    expect(x.job().fail_streak).toBe(0);
    // Nothing runs during the wait (the runner is idle), so the clock is moved past it.
    x.clock.advance(59_000);
    await x.settle(100);
    expect(errorCards(x)[0]!.state).toBe('asking');
    x.clock.advance(1_000);
    await x.settle(100);
    const [fixed] = errorCards(x);
    expect(fixed!.state).toBe('fixed');
    expect(x.job().state).toBe('done');
    expect(
      x
        .toolCalls()
        .filter((c) => c.tool === 'gmail.search')
        .map((c) => c.outcome),
    ).toEqual(['error', 'ok']);
  });

  it('rate limited twice on the same step: the second one counts toward STUCK (no second card)', async () => {
    const w = world([jobIntake(BILLS_PLAN, { title: 'Find bills' }), tool('gmail.search', { query: 'bill' }, { delayMs: 200 })]);
    const { h: x } = w;
    await w.signIn();
    w.apis.failNext('/gmail/v1/users/me/messages', ...Array(6).fill({ status: 429 }));
    x.userSays('Find bills due this week');
    for (let i = 0; i < 40 && errorCards(x).length === 0; i++) await x.settle(100);
    x.clock.advance(60_000);
    await x.settle(100);
    expect(errorCards(x).filter((c) => c.payload.kind === 'CONN_RATE_LIMITED')).toHaveLength(1);
    expect(Number(x.job().fail_streak)).toBeGreaterThanOrEqual(1);
  });

  it('[ Try again ] on the rate-limit card runs the step at once', async () => {
    const w = world([
      jobIntake(BILLS_PLAN, { title: 'Find bills' }),
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 200, once: true }),
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 200, once: true }),
      ...FINISH,
    ]);
    const { h: x } = w;
    await w.signIn();
    w.apis.failNext('/gmail/v1/users/me/messages', { status: 429 }, { status: 429 }, { status: 429 });
    x.userSays('Find bills due this week');
    for (let i = 0; i < 40 && errorCards(x).length === 0; i++) await x.settle(100);
    const startedAt = x.clock.now();
    x.answer(String(errorCards(x)[0]!.id), 'retry');
    await x.settle(100);
    expect(x.job().state).toBe('done');
    expect(x.clock.now() - startedAt).toBeLessThan(60_000);
  });

  it('scope missing: the flag goes false on the rows and the job says "I’m not allowed to see your calendar yet." once', async () => {
    const w = world([jobIntake([{ phraseKey: 'check_calendar' }], { title: 'Check my day' }), tool('gcal.list', {}, { delayMs: 200 })]);
    const { h: x } = w;
    await w.signIn();
    w.apis.failNext(
      '/calendar/v3/calendars/primary/events',
      ...Array(3).fill({
        status: 403,
        body: { error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } },
      }),
    );
    x.userSays('What is on my calendar today?');
    await x.settle();
    const granted = x.db.prepare("SELECT granted FROM connections WHERE app = 'gcal'").pluck().get() as string;
    expect(JSON.parse(granted).calendarWrite).toBe(false);
    const lines = x.messages().filter((m) => m.text === t('errors.conn_scope_missing.line', { calendar: 'calendar' }));
    expect(lines).toHaveLength(1);
    expect(String(lines[0]!.text)).toBe('I’m not allowed to see your calendar yet. Allow it in Settings → Connections.');
    expect(errorCards(x)).toHaveLength(0);
  });
});
