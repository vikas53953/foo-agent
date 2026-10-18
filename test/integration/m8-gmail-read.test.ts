// Spec: AT-020 (J5: a bills result carries a Proof chip to the emails read, or "⚠ Not checked live"), 08-2 §5.8 (finish
// checks an `emails_read` proof against this job's recorded tool results), ART-08c Gmail case + 08-2 §11.4 (a code inside a
// Gmail message is redacted before it reaches the AI; the ToolLayer stores and shows only the redacted result), 08-2 §8.2
// (gmail.search / gmail.read through the job runner), 08-3 §22.4 (fake Gmail; never a real Google call).
// Engine: the real M4 runner + ToolLayer over a temp SQLite db (test/integration/jobs/jobHarness.ts pattern); the Gmail tools
// are the real M8 connector over the fake Gmail.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { googleTools } from '../../src/engine/tools/connectors/google-tools';
import type { MainLink } from '../../src/engine/protocol';
import { makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';
import { BILLS_PLAN, jobIntake, step, stepDone, tool } from './jobs/jobHarness';
import { drive, fakeAccess, fakeGmailRead, fakeGoogle, gmailState } from '../fakes/connectors/gmail-read';

let h: Harness | null = null;
afterEach(() => {
  h?.engine.jobs.cancelAll();
  h?.close();
  h = null;
});

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function settle(x: Harness, stepMs = 100) {
  // Same rhythm as jobHarness.settle: idle twice in a row, else move the fake clock.
  const idle = () => Promise.all([x.engine.lane.idle(), x.engine.jobs.idle()]);
  for (let round = 0; round < 1500; round++) {
    for (let i = 0; i < 4; i++) await realSleep(1);
    let done = false;
    await Promise.race([idle().then(() => (done = true)), realSleep(3)]);
    if (done) {
      for (let i = 0; i < 4; i++) await realSleep(1);
      let again = false;
      await Promise.race([idle().then(() => (again = true)), realSleep(3)]);
      if (again) return;
    }
    x.clock.advance(stepMs);
  }
  throw new Error('engine never settled');
}

const noLink: MainLink = {
  request: () => Promise.reject(new Error('the Gmail tools never use the db')),
  send: () => undefined,
};

function gmailHarness(script: Parameters<typeof makeHarness>[0]['script'], state = gmailState()) {
  // The connector's own clock only paces Google calls (≤ 5/s); a separate fake clock that never blocks keeps it simple here.
  const clock = new FakeClock();
  const g = fakeGoogle([fakeGmailRead(state)]);
  const google = googleTools({
    access: fakeAccess().access,
    http: g.fetch,
    link: noLink,
    clock: { now: () => clock.now(), setTimeout: (fn) => (queueMicrotask(fn), 0), clearTimeout: () => undefined },
    timeZone: () => 'Asia/Kolkata',
  });
  const tools = { 'gmail.search': google.tools['gmail.search']!, 'gmail.read': google.tools['gmail.read']! };
  h = makeHarness({ script, settings: verified(), tools });
  return { h, g };
}

const toolCalls = (x: Harness) => x.db.prepare('SELECT * FROM tool_calls ORDER BY started_at, id').all() as Record<string, unknown>[];
const job = (x: Harness) => x.db.prepare('SELECT * FROM jobs ORDER BY created_at, id').get() as Record<string, unknown>;

const RESULT = 'Two bills are due this week: electricity ₹1,240 by Tue 20 Oct and broadband ₹799 by Thu 22 Oct.';

describe('AT-020 · a bills result names the emails it read', () => {
  it('real gmail.search + gmail.read over the fake Gmail → done with an emails_read proof the runner re-checked', async () => {
    const { h: x, g } = gmailHarness([
      jobIntake(BILLS_PLAN, { title: 'Find bills' }),
      tool('gmail.search', { query: 'bill', sinceDays: 7 }, { delayMs: 300 }),
      stepDone(0, { delayMs: 300 }),
      tool('gmail.read', { messageId: 'm_bill_fibre' }, { delayMs: 300 }),
      stepDone(1, { delayMs: 300 }),
      step(
        { kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 2, messageIds: ['m_bill_power', 'm_bill_fibre'] } },
        { delayMs: 300 },
      ),
    ]);
    x.userSays('Find bills due this week');
    await settle(x);
    expect(job(x).state).toBe('done');
    expect(JSON.parse(String(job(x).proof))).toEqual({ kind: 'emails_read', count: 2, messageIds: ['m_bill_power', 'm_bill_fibre'] });
    expect(toolCalls(x).map((c) => [c.tool, c.outcome])).toEqual([
      ['gmail.search', 'ok'],
      ['gmail.read', 'ok'],
    ]);
    // Only Google hosts, and only reads.
    expect(new Set(g.requests.map((r) => r.host))).toEqual(new Set(['gmail.googleapis.com']));
    expect(g.requests.every((r) => r.method === 'GET')).toBe(true);
  });

  it('a proof naming an email the job never read → done_unverified ("⚠ Not checked live"), no proof stored', async () => {
    const { h: x } = gmailHarness([
      jobIntake(BILLS_PLAN, { title: 'Find bills' }),
      tool('gmail.search', { query: 'bill' }, { delayMs: 300 }),
      stepDone(0, { delayMs: 300 }),
      stepDone(1, { delayMs: 300 }),
      step({ kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 1, messageIds: ['m_never_seen'] } }, { delayMs: 300 }),
    ]);
    x.userSays('Find bills due this week');
    await settle(x);
    expect(job(x).state).toBe('done_unverified');
    expect(job(x).proof).toBeNull();
  });
});

describe('Gmail case of the code rule (08-2 §11.4): "Your OTP is 482913" never reaches the AI', () => {
  it('gmail.read of a message holding a code → stored and shown to the AI masked', async () => {
    const state = gmailState();
    state.messages.push({
      id: 'm_otp',
      from: 'Bank <alerts@bank.example.com>',
      subject: 'Login code',
      internalDate: Date.UTC(2026, 9, 16, 3, 0),
      snippet: 'Your OTP is 482913',
      text: 'Your OTP is 482913. Do not share it.',
    });
    const { h: x } = gmailHarness(
      [
        jobIntake([{ phraseKey: 'read_email' }], { title: 'Read mail' }),
        tool('gmail.search', { query: 'code' }, { delayMs: 300 }),
        tool('gmail.read', { messageId: 'm_otp' }, { delayMs: 300 }),
        stepDone(0, { delayMs: 300 }),
        step({ kind: 'done', result: 'You have a login code email.', unverified: true }, { delayMs: 300 }),
      ],
      state,
    );
    x.userSays('Any login code mails?');
    await settle(x);
    const prompts = x.turnsJsonl().map((t) => `${String(t.system)}\n${String(t.prompt)}`);
    expect(prompts.length).toBeGreaterThan(2);
    for (const p of prompts) expect(p).not.toContain('482913');
    for (const c of toolCalls(x)) expect(String(c.result)).not.toContain('482913');
    // the rest of the email did reach the step prompt, with the code masked
    expect(prompts.some((p) => p.includes('Your ••••. Do not share it.'))).toBe(true);
  });
});

describe('08-3 §16.1.3 · the poller feeds on_email and the brief collector once per message', () => {
  it('the engine-built poller over the fake Gmail: two arrivals → each hook gets each message once', async () => {
    const clock = new FakeClock();
    const state = gmailState();
    const g = fakeGoogle([fakeGmailRead(state)], () => clock.now());
    const google = googleTools({ access: fakeAccess().access, http: g.fetch, link: noLink, clock, timeZone: () => 'Asia/Kolkata' });
    const onEmail: string[] = [];
    const brief: string[] = [];
    google.hooks.addEmailHook({ onEmail: (m) => void onEmail.push(m.messageId) });
    google.hooks.addBriefSource({ collect: (m) => void brief.push(m.messageId) });
    await drive(google.poller.baseline(), clock);
    for (const id of ['n1', 'n2']) {
      state.historyId += 1;
      state.messages.push({
        id,
        from: `Someone <${id}@example.com>`,
        subject: `Hello ${id}`,
        internalDate: clock.now(),
        snippet: '',
        text: 'hi',
        historyId: state.historyId,
      });
    }
    await drive(google.poller.pollOnce(), clock);
    await drive(google.poller.pollOnce(), clock);
    expect(onEmail).toEqual(['n1', 'n2']);
    expect(brief).toEqual(['n1', 'n2']);
  });
});
