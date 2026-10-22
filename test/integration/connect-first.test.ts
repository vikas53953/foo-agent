// Spec: CR-0040 (X-198), real-AI run 8 (main 516a344, Claude CLI): "Read my latest Gmail" with Google not connected got a
// Choice card "Which email do you want me to read?" (Gmail / Outlook / Yahoo Mail) from the job's first step, because the
// catalogue lists no Gmail tools while Google is not connected (08-4 §27.1). 05-3 §5.11 Trigger ("a job that needs an app that
// isn't connected") → the Connect card, variant `one_app` (§5.11.2), before any job; 08-2 §5.3.3 (once Google connects the
// message goes back to intake and the job runs). 08-3 §22.4 (fakes only: the fake Google token endpoint and the fake Gmail).
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { googleEndpoints } from '../../src/engine/tools/connectors/google';
import { answerCard } from '../../src/main/cards/answerCard'; // CR-0044
import type { HttpFetch } from '../../src/engine/tools/connectors/types';
import { GoogleConnections } from '../../src/main/connections/GoogleConnections';
import type { Db } from '../../src/main/store/db';
import { MemoryConnTokenStore } from '../../src/main/vault/connTokenMemory';
import { openLoopback, type Loopback } from '../../src/main/windows/oauthLoopback';
import { t } from '../../src/shared/copy/t';
import { BADGE_OF_STATE } from '../../src/shared/jobMachine';
import { fakeGoogle, fakeGmailRead, gmailState } from '../fakes/connectors/gmail-read';
import { FAKE_CLIENT, FakeGoogle } from '../fakes/connectors/google-oauth';
import { jobHarness, realPause, step, stepDone, tool, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const ASK = 'Read my latest Gmail';
/** The Claude CLI's real intake answer to ASK on Wed 21 Oct (3 runs of 3 planned a job that needs Gmail). */
const REAL_JOB =
  '<say></say>\n<act>{"decision":{"kind":"job","title":"Read your latest Gmail","plan":[{"phraseKey":"gmail.fetch_latest","slots":{"count":"1","folder":"inbox"},"route":"api"},{"phraseKey":"gmail.read_message","slots":{"which":"latest"},"route":"api"},{"phraseKey":"summarise.tell_user","slots":{"style":"short"},"route":"handback"}],"estimate":{"minutes":1},"routeHint":["api"],"needsApps":["gmail"]},"usedMemoryIds":[]}</act>';
/** The Claude CLI's real intake answer to "check my email" (3 runs of 3 needed Gmail; this one routes by `email`). */
const REAL_CHECK =
  '<say></say>\n<act>{"decision":{"kind":"job","title":"Check your email","plan":[{"phraseKey":"read_email","slots":{"scope":"latest unread"},"route":"email"},{"phraseKey":"shortlist","slots":{"what":"the ones that need you"},"route":"email"}],"estimate":{"minutes":1},"routeHint":["email"],"needsApps":["gmail"]},"usedMemoryIds":[]}</act>';
/** What the job's first step said in run 8, with no Gmail tools listed. */
const WHICH_EMAIL = step({
  kind: 'ask',
  card: {
    question: 'Which email do you want me to read?',
    options: [{ label: 'Gmail' }, { label: 'Outlook' }, { label: 'Yahoo Mail' }],
  },
});
/** CR-0044: the Claude CLI's real answer to "Pay my electricity bill now" that wanted Gmail (1 of 4 replays; the run on 0665cf6). */
const REAL_BILL =
  '<say></say>\n<act>{"decision":{"kind":"job","title":"Pay electricity bill","plan":[{"phraseKey":"read_bill","slots":{"what":"electricity bill"},"route":"email"},{"phraseKey":"wait_signin","slots":{"site":"electricity provider"},"route":"browser"},{"phraseKey":"show_before","slots":{"what":"bill amount and due date"},"route":"browser"},{"phraseKey":"wait_approve","slots":{"what":"payment"},"route":"handback"},{"phraseKey":"pay","slots":{"what":"electricity bill"},"route":"browser"}],"routeHint":["email","browser","handback"],"needsApps":["gmail"]},"usedMemoryIds":[]}</act>';
/** What the job's first step asks with no Gmail tools (run 15). */
const WHICH_PROVIDER = step({
  kind: 'ask',
  card: { question: 'Which electricity provider should I pay?', options: [{ label: 'BSES Rajdhani' }, { label: 'Tata Power-DDL' }] },
});
const RESULT = 'Your latest email is the electricity bill: ₹1,240 due Tue 20 Oct.';
const READ = [
  tool('gmail.search', { query: 'in:inbox', max: 1 }, { delayMs: 100, once: true }),
  stepDone(0, { delayMs: 100, once: true }),
  tool('gmail.read', { messageId: 'm_bill_power' }, { delayMs: 100, once: true }),
  stepDone(1, { delayMs: 100, once: true }),
  step({ kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 1, messageIds: ['m_bill_power'] } }, { delayMs: 100 }),
];

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

/** The engine with main's GoogleConnections holding the token (as the app runs), Google not connected at start. */
function world(script: Parameters<typeof jobHarness>[0]['script']) {
  const oauth = new FakeGoogle();
  const apis = fakeGoogle([fakeGmailRead(gmailState())]);
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
        engineState: (s) => x.bridge.send('connection.state', s),
      });
      return { forEngine: (req) => svc!.forEngine(req), http };
    },
  });
  h = x;
  return {
    h: x,
    /** The Connect tap and Google's redirect back to foo (connection:connect with the card's scopes). */
    async signIn(scopes?: ('gmail' | 'gcal' | 'contacts')[]) {
      const r = await svc!.connect(scopes);
      expect(r.ok).toBe(true);
      const state = new URL(opened.at(-1)!).searchParams.get('state');
      const lb = loopbacks.at(-1)!;
      await hit(`${lb.redirectUri}?state=${state}&code=fake-code`);
      await lb.result;
      for (let i = 0; i < 50 && svc!.engineState().status !== 'connected'; i++) await realPause(5);
    },
  };
}

const payloadOf = (c: Record<string, unknown>) => JSON.parse(String(c.payload)) as Record<string, unknown>;
const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);

describe('CR-0040 · a job that needs Google while it is not connected shows the Connect card first', () => {
  it('run 8: "Read my latest Gmail" posts Connect Gmail, never "Which email?", and no job starts', async () => {
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_JOB }, WHICH_EMAIL]);
    const askId = w.h.userSays(ASK);
    await w.h.settle();

    expect(w.h.cards('choice')).toHaveLength(0);
    expect(w.h.jobs()).toHaveLength(0);
    const cards = w.h.cards('connect');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.state).toBe('offered');
    expect(cards[0]!.job_id).toBeNull();
    expect(payloadOf(cards[0]!)).toEqual({
      variant: 'one_app',
      app: 'gmail',
      scopes: ['gmail'],
      why: t('cards.connect.one_app.why_job.gmail', { title: 'Read your latest Gmail' }),
      intakeConnect: { messageId: askId },
    });
    expect(w.h.message(askId).badge).toBe(BADGE_OF_STATE.needs_you);
    expect(fooTexts(w.h)).not.toContain(t('thread.reply.empty'));
  });

  it('run 13: "check my email" posts Connect Gmail; no browser job goes to the Google sign-in page', async () => {
    // Real-AI run 13 (main 3a35be0): the job went to the browser, landed on the Google sign-in page and went stuck.
    const browseGmail = tool('browser.open', { url: 'https://mail.google.com/' });
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_CHECK }, browseGmail]);
    const askId = w.h.userSays('check my email');
    await w.h.settle();

    expect(w.h.jobs()).toHaveLength(0);
    expect(w.h.db.prepare('SELECT COUNT(*) FROM tool_calls').pluck().get()).toBe(0);
    expect(w.h.cards('stuck')).toHaveLength(0);
    expect(w.h.cards('connect').map((c) => payloadOf(c).variant)).toEqual(['one_app']);
    expect(w.h.message(askId).badge).toBe(BADGE_OF_STATE.needs_you);
  });

  it('once Google connects, the message goes back to intake and the job reads the inbox', async () => {
    // The same real answer on both intake turns (before and after the sign-in).
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_JOB, once: false }, ...READ]);
    w.h.userSays(ASK);
    await w.h.settle();
    expect(w.h.jobs()).toHaveLength(0);

    await w.signIn(['gmail']);
    await w.h.settle();
    const jobs = w.h.jobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.state).toBe('done');
    expect(w.h.toolCalls().map((c) => [c.tool, c.outcome])).toEqual([
      ['gmail.search', 'ok'],
      ['gmail.read', 'ok'],
    ]);
    // The card is not posted again by the second intake.
    expect(w.h.cards('connect')).toHaveLength(1);
  });

  it('Google already connected: the job starts at once, no Connect card', async () => {
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_JOB }, ...READ]);
    await w.signIn();
    w.h.userSays(ASK);
    await w.h.settle();
    expect(w.h.cards('connect')).toHaveLength(0);
    expect(w.h.jobs().map((j) => j.state)).toEqual(['done']);
  });
});

describe('CR-0044 · the Connect card says why, and Not now runs the job without the app', () => {
  /** Main's card:answer for the card's Not now (the renderer sends { skip: true }). */
  const notNow = (x: JobHarness, cardId: string) =>
    answerCard(
      {
        db: x.db,
        now: () => x.clock.now(),
        engine: { send: (kind, payload) => x.bridge.send(kind, payload as never) },
        emitCard: () => undefined,
        emitMessage: () => undefined,
        emitChat: () => undefined,
      },
      { cardId, answer: { skip: true }, resolvedBy: 'tap' },
    );

  it('"Pay my electricity bill now": the card names the job; Not now starts it without Gmail and it asks which provider', async () => {
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_BILL, once: false }, WHICH_PROVIDER]);
    const askId = w.h.userSays('Pay my electricity bill now');
    await w.h.settle();
    const [card] = w.h.cards('connect');
    expect(payloadOf(card!).why).toBe(t('cards.connect.one_app.why_job.gmail', { title: 'Pay electricity bill' }));
    expect(w.h.jobs()).toHaveLength(0);
    // The decided kind is in the tech log (an enum, no words).
    expect(w.h.logs.some((l) => l.evt === 'chat.intake_kind' && l.kind === 'job')).toBe(true);

    expect(notNow(w.h, String(card!.id)).ok).toBe(true);
    await w.h.settle();
    expect(w.h.cards('connect').map((c) => c.state)).toEqual(['skipped']);
    // The message went back to intake once, and this time no Connect card: the job runs and asks (no dead end).
    expect(w.h.cards('connect')).toHaveLength(1);
    expect(w.h.jobs()).toHaveLength(1);
    // A payment job shows its plan first; after Go, the first step asks which provider (run 15), with no Gmail tools.
    const plan = w.h.cards('plan');
    expect(plan.map((c) => c.state)).toEqual(['pending']);
    w.h.answer(String(plan[0]!.id), 'go');
    await w.h.settle();
    expect(w.h.cards('choice').map((c) => payloadOf(c).question)).toEqual(['Which electricity provider should I pay?']);
    expect(w.h.message(askId).badge).toBe(BADGE_OF_STATE.needs_you);
  });

  it('Not now on a card that was already answered is stale; a second tap starts nothing', async () => {
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_BILL, once: false }, WHICH_PROVIDER]);
    w.h.userSays('Pay my electricity bill now');
    await w.h.settle();
    const id = String(w.h.cards('connect')[0]!.id);
    expect(notNow(w.h, id).ok).toBe(true);
    await w.h.settle();
    expect(notNow(w.h, id)).toMatchObject({ ok: false, error: { kind: 'CARD_STALE' } });
    await w.h.settle();
    expect(w.h.jobs()).toHaveLength(1);
  });
});

describe('CR-0044 review · a card whose message moved on never starts a second job', () => {
  it('Google connects, the job runs; a later Not now on the old card is stale and starts nothing', async () => {
    const w = world([{ match: { purpose: 'intake' }, reply: REAL_JOB, once: false }, ...READ]);
    w.h.userSays(ASK);
    await w.h.settle();
    const id = String(w.h.cards('connect')[0]!.id);
    await w.signIn(['gmail']);
    await w.h.settle();
    expect(w.h.cards('connect').map((c) => c.state)).toEqual(['connected']);
    const r = answerCard(
      {
        db: w.h.db,
        now: () => w.h.clock.now(),
        engine: { send: (kind, payload) => w.h.bridge.send(kind, payload as never) },
        emitCard: () => undefined,
        emitMessage: () => undefined,
        emitChat: () => undefined,
      },
      { cardId: id, answer: { skip: true }, resolvedBy: 'tap' },
    );
    expect(r).toMatchObject({ ok: false, error: { kind: 'CARD_STALE' } });
    await w.h.settle();
    expect(w.h.jobs()).toHaveLength(1);
  });
});
