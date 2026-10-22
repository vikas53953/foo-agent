// Spec: AT-112 (WORKING → WAITING when the AI stops answering, a plan limit is hit or the PC sleeps: one error card, pill
// "Paused"), AT-113 (the condition clears → WORKING, the error card edited in place "Back on it. Picking up from step {n}.",
// no new message), 08-2 §6.7 (2 failures in a row per provider before WAITING; AI_TIMEOUT counts as one failed turn),
// §5.4.1 (a failed verify before start → WAITING, not a queued job with the queued caption), 08-3 §21.2 (card words and the
// one button), 09 §9.22 (sleep → WAITING asleep, no card; resume re-tests the AI), CR-0008 G-M4-02.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import type { Settings } from '../../../src/shared/settings';
import { VERIFY_LINE } from '../../unit/m3-engine-helpers';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, verified, badgeSets, type JobHarness, untilStill } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const slow = { delayMs: 1_000 };
const aiError = (error: string) => ({ match: { purpose: 'step' }, error });
const finishLines = () => [stepDone(0, slow), stepDone(1, slow), step({ kind: 'done', result: 'Two bills due.', unverified: true })];
const payloadOf = (card: Record<string, unknown>) => JSON.parse(String(card.payload)) as Record<string, unknown>;
const pill = (hh: JobHarness) => (hh.db.prepare('SELECT pill FROM chats WHERE id = ?').get(hh.chatId) as { pill: string | null }).pill;

describe('AT-112 / AT-113 · the AI stops answering, then comes back', () => {
  it('two AI_SERVICE_DOWN in a row → WAITING ai_down, one error card, pill Paused; verify ok → card edited in place', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        tool('gmail.search', { query: 'bill' }, slow),
        aiError('AI_SERVICE_DOWN'),
        aiError('AI_SERVICE_DOWN'),
        { ...VERIFY_LINE, once: false },
        ...finishLines(),
      ],
    });
    const userId = h.userSays('Find bills due this week');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('waiting');
    expect(job.waiting_reason).toBe('ai_down');
    // The first failure was one failed turn; the second rested the provider.
    expect(job.fail_streak).toBe(1);
    expect(h.message(userId).badge).toBe('working');
    expect(pill(h)).toBe('paused');
    const cards = h.cards('error');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.state).toBe('asking');
    expect(payloadOf(cards[0]!)).toEqual({
      variant: 'error',
      kind: 'AI_SERVICE_DOWN',
      whatHappened: t('errors.ai_service_down.what_happened', { AI: 'Claude' }),
      whatIsSafe: t('errors.ai_service_down.what_is_safe', { job: String(job.title), n: 1 }),
      button: { label: t('errors.ai_service_down.button'), action: { kind: 'retry' } },
      jobId: job.id,
      atStep: 1,
    });
    // The slot is free and nothing runs while waiting: settling longer moves nothing.
    const before = h.messages().length;
    h.clock.advance(5 * 60_000);
    await h.settle();
    expect(h.job().state).toBe('waiting');
    expect(h.cards('error')).toHaveLength(1);

    // The AI answers its test again → WORKING, card edited in place; no new message until the job's own result.
    await h.aiCmd('verify', 'claude-cli');
    await h.settle();
    const fixed = h.cards('error')[0]!;
    expect(fixed.state).toBe('fixed');
    expect(payloadOf(fixed).resumedLine).toBe(t('cards.checklist.resumed', { n: 1 }));
    expect(h.cards('error')).toHaveLength(1);
    expect(h.job().state).toBe('done_unverified');
    expect(h.job().waiting_reason).toBeNull();
    // Only the job's own result is new; the checklist (posted at 1.5 s of the job, 05-1 §5.2) is not a resume message.
    const checklistIds = new Set(h.cards('checklist').map((c) => c.message_id));
    const added = h
      .messages()
      .slice(before)
      .filter((m) => !checklistIds.has(m.id));
    expect(added.map((m) => m.kind)).toEqual(['text']);
    expect(added[0]!.text).toBe('Two bills due.');
    expect(badgeSets(h, userId)).toEqual(['seen', 'working', 'working', 'working', 'done_unverified']);
    expect(h.steps().map((s) => s.state)).toEqual(['done', 'done']);
  });

  it('one AI_SERVICE_DOWN alone is one failed turn: the job carries on', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), aiError('AI_SERVICE_DOWN'), ...finishLines()] });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(h.job().state).toBe('done_unverified');
    expect(h.cards('error')).toHaveLength(0);
  });

  it('AI_TIMEOUT counts as one failed turn (fail_streak), never WAITING', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), aiError('AI_TIMEOUT'), ...finishLines()] });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(h.job().state).toBe('done_unverified');
    expect(h.cards('error')).toHaveLength(0);
  });

  it('a plan limit with no reset time → WAITING ai_limit with the "until it resets" words', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), aiError('AI_LIMIT')] });
    h.userSays('Find bills due this week');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('waiting');
    expect(job.waiting_reason).toBe('ai_limit');
    const p = payloadOf(h.cards('error')[0]!);
    expect(p.kind).toBe('AI_LIMIT');
    expect(p.whatHappened).toBe(t('errors.ai_limit.what_happened.no_reset', { AI: 'Claude' }));
    expect(p.whatIsSafe).toBe(t('errors.ai_limit.what_is_safe.no_reset'));
    expect(p.button).toEqual({ label: t('errors.ai_limit.button.no_reset'), action: { kind: 'retry' } });
  });

  it('signed out → WAITING ai_signed_out with [ Sign in ]', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), aiError('AI_SIGNED_OUT')] });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(h.job().waiting_reason).toBe('ai_signed_out');
    const p = payloadOf(h.cards('error')[0]!);
    expect(p.whatHappened).toBe(t('errors.ai_signed_out.what_happened', { AI: 'Claude' }));
    expect(p.button).toEqual({ label: t('errors.ai_signed_out.button'), action: { kind: 'sign_in_ai', providerId: 'claude-cli' } });
  });

  it('two jobs on one outage: one card per job, never a second card for the same job', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN, { match: 'first' }),
        jobIntake(BILLS_PLAN, { match: 'second' }),
        aiError('AI_SERVICE_DOWN'),
        aiError('AI_SERVICE_DOWN'),
        { ...aiError('AI_SERVICE_DOWN'), once: false },
      ],
    });
    // One job per chat: a second text in a chat with a live job steers it (08-2 §5.2).
    h.userSaysIn(h.chat('first'), 'first');
    h.userSaysIn(h.chat('second'), 'second');
    await h.settle();
    expect(h.jobs().map((j) => j.state)).toEqual(['waiting', 'waiting']);
    const perJob = h.cards('error').map((c) => payloadOf(c).jobId);
    expect(new Set(perJob).size).toBe(perJob.length);
    expect(perJob).toHaveLength(2);
  });
});

describe('a failed verify before start moves the job to WAITING (T2 carry: it stayed queued with the queued caption)', () => {
  it('stale AI + failing verify → WAITING ai_down with the error card; badge 🛠', async () => {
    const stale = (s: Settings): Settings => {
      const v = verified()(s);
      return { ...v, ai: { ...v.ai, providers: { 'claude-cli': { kind: 'plan', lastVerifiedAt: 0, lastVerifyOk: true } } } };
    };
    h = jobHarness({
      settings: stale,
      script: [jobIntake(BILLS_PLAN), { match: { purpose: 'verify' }, error: 'AI_SERVICE_DOWN' }],
    });
    const userId = h.userSays('Find bills due this week');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('waiting');
    expect(job.waiting_reason).toBe('ai_down');
    expect(h.message(userId).badge).toBe('working');
    expect(payloadOf(h.cards('error')[0]!).kind).toBe('AI_SERVICE_DOWN');
    // The machine has no queued → waiting: the job started and paused in one transaction.
    const moves = h.txs.filter((x) => x.ok).flatMap((x) => x.ops.filter((o) => o.op === 'transition').map((o) => (o as { to: string }).to));
    expect(moves).toEqual(['working', 'waiting']);
  });
});

describe('09 §9.22 sleep and wake', () => {
  it('suspend → WAITING asleep (no error card); resume → WORKING, checklist edit only', async () => {
    h = jobHarness({
      script: [jobIntake(BILLS_PLAN), tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 }), ...finishLines()],
    });
    h.userSays('Find bills due this week');
    const run = h;
    await untilStill(
      () => run.job()?.state === 'working' && run.turnsJsonl().some((t) => t.purpose === 'step'),
      'the first turn in flight',
    );
    h.send('power', { event: 'suspend' });
    await untilStill(() => run.job().state === 'waiting', 'the job waits');
    expect(h.job().waiting_reason).toBe('asleep');
    expect(h.cards('error')).toHaveLength(0);
    // While asleep nothing starts or resumes. 2 s clock steps: the held 20 s turn would take 80 rounds at the default 250 ms,
    // past the 5 s test limit on Windows' coarse timers.
    const toolCalls = h.calls.length;
    await h.settle(2_000);
    expect(h.job().state).toBe('waiting');
    // The held turn's decision is dropped: no tool runs while the job is WAITING (the resumed loop asks again).
    expect(h.calls.length).toBe(toolCalls);
    h.send('power', { event: 'resume' });
    await h.settle(2_000);
    expect(h.job().state).toBe('done_unverified');
    expect(h.cards('error')).toHaveLength(0);
  });
});
