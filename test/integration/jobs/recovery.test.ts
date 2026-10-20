// Spec: AT-118 (any non-final job, app killed or Windows restarted → on next launch restored from state.json with a recovery
// card), 08-2 §5.9 (step 1 safe mode holds every job and posts the safe-mode card, and with CR-0009 G-M5-22 the step 3
// recovery cards are posted in safe mode too; step 3 WORKING / QUEUED → NEEDS_YOU with
// the J19.5 card, doneLines from activity; step 5 unfinished side-effect calls → `unknown`), 05-3 §5.20 (recovery variant:
// [ Pick up where I left off ] · "Stop it"; states resumed / stopped), 08-3 §21.2 CRASH_RECOVERY, SAFE_MODE, CR-0008 G-M4-13.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, badgeSets, type JobHarness } from './jobHarness';
import { restartEngine } from './restart';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const poll = async (rounds = 40) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 2));
};
/** Waits (real time, up to 10 s) until `ready()` holds: a loaded runner can take longer than a fixed poll. */
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 5000 && !ready(); i++) await new Promise((r) => setTimeout(r, 2));
};
const payloadOf = (card: Record<string, unknown>) => JSON.parse(String(card.payload)) as Record<string, unknown>;

/** A job killed mid-step 2 (step 1 done, a 20 s turn in flight). */
async function killedMidJob(): Promise<{ jobId: string; userId: string }> {
  h = jobHarness({
    script: [jobIntake(BILLS_PLAN), stepDone(0), tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })],
  });
  const userId = h.userSays('Find bills due this week');
  await poll();
  h.clock.advance(2_000);
  await poll();
  expect(h.job().state).toBe('working');
  return { jobId: String(h.job().id), userId };
}

describe('AT-118 · killed mid-job → recovery card on restart', () => {
  it('WORKING → NEEDS_YOU with the J19.5 card; "Pick up where I left off" resumes from the same step', async () => {
    const { jobId, userId } = await killedMidJob();
    restartEngine(h!, [stepDone(1), step({ kind: 'done', result: 'Two bills due.', unverified: true })], {
      safeMode: false,
      cleanStart: false,
    });
    await h!.settle();
    const job = h!.job();
    expect(job.state).toBe('needs_you');
    expect(h!.message(userId).badge).toBe('waiting');
    const [card] = h!.cards('error');
    expect(card!.state).toBe('asking');
    expect(job.needs_you_card_id).toBe(card!.id);
    expect(payloadOf(card!)).toMatchObject({
      variant: 'recovery',
      kind: 'CRASH_RECOVERY',
      whatHappened: t('errors.crash_recovery.what_happened', { time: '9:00 AM' }),
      whatIsSafe: t('errors.crash_recovery.what_is_safe', { job: String(job.title), n: 2, of: 2 }),
      button: { label: t('errors.crash_recovery.button'), action: { kind: 'resume_job' } },
      secondary: { label: t('errors.crash_recovery.link'), action: { kind: 'stop' } },
      jobId,
      atStep: 2,
      of: 2,
    });
    expect(h!.steps().map((s) => s.state)).toEqual(['done', 'waiting_user']);

    h!.answer(String(card!.id), 'resume');
    await h!.settle();
    expect(h!.cards('error')[0]!.state).toBe('resumed');
    expect(h!.job().state).toBe('done_unverified');
    expect(h!.steps().map((s) => s.state)).toEqual(['done', 'done']);
    expect(badgeSets(h!, userId).slice(-3)).toEqual(['waiting', 'working', 'done_unverified']);
  });

  it('"Stop it" → CANCELLED ⛔, checklist stopped', async () => {
    const { userId } = await killedMidJob();
    restartEngine(h!, [], { safeMode: false, cleanStart: false });
    await h!.settle();
    h!.answer(String(h!.cards('error')[0]!.id), 'stop');
    await h!.settle();
    expect(h!.job().state).toBe('cancelled');
    expect(h!.job().stop_reason).toBe('user_button');
    expect(h!.cards('error')[0]!.state).toBe('stopped');
    expect(h!.message(userId).badge).toBe('stopped');
  });

  it('a queued job gets a recovery card after an unclean exit, but stays queued after a clean one', async () => {
    for (const cleanStart of [false, true]) {
      h = jobHarness({
        script: [
          ...['one', 'two', 'three', 'four'].map((w) => jobIntake(BILLS_PLAN, { match: w })),
          ...[1, 2, 3].map(() => tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })),
        ],
      });
      for (const w of ['one', 'two', 'three', 'four']) h.userSaysIn(h.chat(w), w);
      await poll();
      h.clock.advance(2_000);
      await until(() => h!.jobs().some((j) => j.state === 'queued'));
      const queued = h.jobs().find((j) => j.state === 'queued')!;
      if (cleanStart) await h.bridge.request('jobs.pauseAll', { reason: 'app_quit' });
      restartEngine(h, [{ match: { purpose: 'step' }, reply: '', delayMs: 60_000, once: false }], { safeMode: false, cleanStart });
      const want = (state: unknown) => (cleanStart ? ['queued', 'working'].includes(String(state)) : state === 'needs_you');
      await until(() => want(h!.job(String(queued.id))?.state));
      const after = h.job(String(queued.id));
      if (cleanStart) expect(['queued', 'working']).toContain(after.state);
      else expect(after.state).toBe('needs_you');
      h.close();
      h = null;
    }
  });

  it('a side-effect tool call that started and never finished is marked unknown (§5.9 step 5)', async () => {
    const { jobId } = await killedMidJob();
    h!.db
      .prepare(
        "INSERT INTO tool_calls (id, job_id, tool, action_class, args, side_effect, idem_key, gate, started_at) VALUES ('tc_open', ?, 'gmail.send', 'send', '{}', 1, 'idem-open', 'approved', 1)",
      )
      .run(jobId);
    restartEngine(h!, [], { safeMode: false, cleanStart: false });
    await h!.settle();
    expect((h!.db.prepare("SELECT outcome FROM tool_calls WHERE id = 'tc_open'").get() as { outcome: string }).outcome).toBe('unknown');
  });
});

describe('08-2 §5.9 step 1 · safe mode', () => {
  it('no job starts; one safe-mode card in foo chat; "Start normally" runs recovery', async () => {
    const { userId } = await killedMidJob();
    restartEngine(h!, [stepDone(1), step({ kind: 'done', result: 'Two bills due.', unverified: true })], {
      safeMode: true,
      cleanStart: false,
    });
    await h!.settle();
    // M5 T10 (CR-0009 G-M5-22): the job that was working shows its recovery card; nothing runs while safe mode holds.
    expect(h!.job().state).toBe('needs_you');
    expect(h!.turnsJsonl().filter((r) => r.purpose === 'step')).toHaveLength(2);
    const cards = h!.cards('error');
    expect(cards.map((c) => payloadOf(c).kind)).toEqual(['SAFE_MODE', 'CRASH_RECOVERY']);
    expect(cards[0]!.chat_id).toBe(h!.chatId);
    expect(payloadOf(cards[0]!)).toEqual({
      variant: 'error',
      kind: 'SAFE_MODE',
      whatHappened: t('errors.safe_mode.what_happened', { agentName: 'foo' }),
      whatIsSafe: t('errors.safe_mode.what_is_safe'),
      button: { label: t('errors.safe_mode.button'), action: { kind: 'start_normally' } },
    });
    // "Pick up where I left off" while safe mode holds: answered, but the job waits for "Start normally".
    h!.answer(String(cards[1]!.id), 'resume');
    await h!.settle();
    expect(h!.job().state).toBe('needs_you');
    h!.answer(String(cards[0]!.id), 'start_normally');
    await h!.settle();
    expect(h!.cards('error')[0]!.state).toBe('fixed');
    // One recovery card only: Start normally does not post a second one for the same job.
    expect(h!.cards('error').filter((c) => payloadOf(c).variant === 'recovery')).toHaveLength(1);
    expect(h!.job().state).toBe('done_unverified');
    expect(h!.message(userId).badge).toBe('done_unverified');
  });
});
