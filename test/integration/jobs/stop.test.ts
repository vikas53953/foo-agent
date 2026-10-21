// Spec: AT-077 ("stop" mid-job: no click or AI call after 1 s; the reply lists what was done, from the activity log),
// AT-107 (Stop in QUEUED, WORKING, NEEDS YOU or WAITING → CANCELLED with the matching stop_reason, badge ⛔, checklist
// "Stopped by you", report), 08-2 §5.7 (one transaction: open choice cards withdrawn, the plan card withdrawn; report from
// activity rows only), 08-4 §26.9 (stopFlow: no live job → "Nothing's running right now."; two → "Stop which one?" with
// "Both"), 06-3 §9.4 (activity `stopped_job`).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { formatTime } from '../../../src/shared/format';
import type { StopReport } from '../../../src/shared/types';
import { jobHarness, jobIntake, step, tool, badgeSets, BILLS_PLAN, type JobHarness, type PlanStepIn } from './jobHarness';
import { flush, fooTexts, keyBilling, seedActivity, seedSpend, stepTurnsSince, until } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const BOOK: PlanStepIn[] = [
  { phraseKey: 'check_site', slots: { site: 'stay.example' } },
  { phraseKey: 'book', slots: { what: 'Goa stay' } },
];
/** Turns that never end on their own: each holds 3 s, so a stop always lands mid-turn. */
const slowTools = (n: number) => Array.from({ length: n }, () => tool('fake.site', { site: 'stay.example' }, { delayMs: 3_000 }));

const stopButton = (jobId: string) => h!.bridge.request<StopReport, 'job.stop'>('job.stop', { jobId, by: 'user', reason: 'user_button' });

describe('AT-077 · "stop" during a booking job', () => {
  it('AT-077: no click or AI call after 1 s; the reply lists what was done, read from the activity log', async () => {
    h = jobHarness({ script: [jobIntake(BOOK, { estimate: { minutes: 1 } }), ...slowTools(10)] });
    const userId = h.userSays('Book the Goa stay');
    await until(h, () => h!.calls.length >= 2);
    const job = h.job();
    expect(job.state).toBe('working');
    const doneAt = h.clock.now();
    seedActivity(h, String(job.id), 'sent the email to the hotel', doneAt);

    const stopId = h.userSays('stop');
    const stopAt = Number(h.message(stopId).created_at);
    const callsBefore = h.calls.length;
    await h.settle();

    expect(h.job().state).toBe('cancelled');
    expect(h.job().stop_reason).toBe('user_word');
    expect(h.message(userId).badge).toBe('stopped');
    expect(h.calls.filter((c) => c.at > stopAt + 1_000)).toHaveLength(0);
    expect(h.calls.length).toBe(callsBefore);
    expect(stepTurnsSince(h, stopAt + 1)).toBe(0);
    expect(fooTexts(h).at(-1)).toBe(
      t('thread.stop.report.partial', { summary: 'sent the email to the hotel', time: formatTime(doneAt, { timeZone: 'Asia/Kolkata' }) }),
    );
    const act = h.db.prepare("SELECT * FROM activity WHERE event = 'stopped_job'").all() as Record<string, unknown>[];
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({ kind: 'stopped', job_id: job.id, actor: 'user', outcome: 'done' });
  });

  it('"stop" with nothing running → "Nothing\'s running right now."', async () => {
    h = jobHarness({ script: [] });
    h.userSays('stop');
    await h.settle();
    expect(fooTexts(h)).toEqual([t('thread.stop.none')]);
    expect(h.jobs()).toHaveLength(0);
  });

  it('two live jobs in the chat → "Stop which one?" with both titles and "Both"; nothing stops until it is answered', async () => {
    h = jobHarness({
      script: [
        // The first job waits on its Plan card (QUEUED); the second one runs.
        jobIntake(BILLS_PLAN, { estimate: { minutes: 10 }, match: 'first' }),
        jobIntake(BOOK, { estimate: { minutes: 1 }, match: 'second' }),
        ...slowTools(10),
      ],
    });
    h.userSays('first: find my bills');
    await h.settle();
    h.userSays('second: book the Goa stay');
    await until(h, () => h!.jobs().some((j) => j.state === 'working'));
    h.userSays('stop');
    await until(h, () => h!.cards('choice').length === 1);
    const card = h.cards('choice')[0]!;
    const payload = JSON.parse(String(card.payload)) as { question: string; options: { id: string; label: string }[]; purpose: string };
    expect(payload.purpose).toBe('stop_which');
    expect(payload.question).toBe(t('cards.choice.question.stop_which'));
    expect(payload.options.map((o) => o.label)).toEqual([...h.jobs().map((j) => String(j.title)), t('cards.choice.option.stop_both')]);
    expect(h.jobs().map((j) => j.state)).toEqual(['queued', 'working']);

    h.answer(String(card.id), payload.options.at(-1)!.id);
    await h.settle();
    expect(h.jobs().map((j) => [j.state, j.stop_reason])).toEqual([
      ['cancelled', 'user_word'],
      ['cancelled', 'user_word'],
    ]);
    expect(h.cards('choice')[0]!.state).toBe('answered');
  });

  it('an unanswered "Stop which one?" card expires after 15 min; nothing is stopped', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN, { estimate: { minutes: 10 }, match: 'first' }),
        jobIntake(BILLS_PLAN, { estimate: { minutes: 10 }, match: 'second' }),
      ],
    });
    h.userSays('first');
    await h.settle();
    h.userSays('second');
    await h.settle();
    h.userSays('stop');
    await h.settle();
    h.clock.advance(15 * 60_000);
    await flush();
    expect(h.cards('choice')[0]!.state).toBe('expired');
    expect(h.jobs().map((j) => j.state)).toEqual(['queued', 'queued']);
  });
});

describe('AT-107 · Stop in each live state', () => {
  async function expectStopped(userId: string, reason: string) {
    const job = h!.job();
    expect(job.state).toBe('cancelled');
    expect(job.stop_reason).toBe(reason);
    expect(h!.message(userId).badge).toBe('stopped');
    expect(badgeSets(h!, userId).at(-1)).toBe('stopped');
    expect(fooTexts(h!).at(-1)).toBe(t('thread.stop.report.nothing'));
    // "Stopped by you" is the checklist's last row when the card is `stopped` (05-1 §5.2.5).
    for (const c of h!.cards('checklist')) expect(c.state).toBe('stopped');
    expect(h!.steps().every((s) => s.state === 'done' || s.state === 'skipped')).toBe(true);
    await h!.settle();
    expect(h!.job().state).toBe('cancelled');
  }

  it('AT-107: QUEUED (waiting on its Plan card) → CANCELLED user_button; the Plan card is withdrawn', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN, { estimate: { minutes: 10 } })] });
    const userId = h.userSays('Find my bills');
    await h.settle();
    expect(h.job().state).toBe('queued');
    const r = await stopButton(String(h.job().id));
    expect(r).toEqual({ ok: true, value: { jobId: h.job().id, done: [], nothingDone: true } });
    await expectStopped(userId, 'user_button');
    expect(h.cards('plan')[0]!.state).toBe('withdrawn');
  });

  it('AT-107: WORKING → CANCELLED user_button, checklist stopped, no call after the stop', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), ...slowTools(10)] });
    const userId = h.userSays('Find my bills');
    await until(h, () => h!.cards('checklist').length === 1);
    const at = h.clock.now();
    await stopButton(String(h.job().id));
    await expectStopped(userId, 'user_button');
    expect(h.calls.filter((c) => c.at > at)).toHaveLength(0);
  });

  it('AT-107: NEEDS YOU (a Choice card open) → CANCELLED user_button; the Choice card is withdrawn', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        step(
          { kind: 'ask', card: { question: 'Which month?', options: [{ label: 'October' }, { label: 'September' }] } },
          { delayMs: 2_000 },
        ),
      ],
    });
    const userId = h.userSays('Find my bills');
    await h.settle();
    expect(h.job().state).toBe('needs_you');
    await stopButton(String(h.job().id));
    await expectStopped(userId, 'user_button');
    expect(h.cards('choice')[0]!.state).toBe('withdrawn');
    expect(h.job().needs_you_card_id).toBeNull();
  });

  it('AT-107: WAITING (at the AI cap) → CANCELLED user_button', async () => {
    h = jobHarness({ settings: keyBilling(100_000), script: [jobIntake(BILLS_PLAN)] });
    const userId = h.userSays('Find my bills');
    await h.settle();
    // Reached after the intake turn (an intake at the cap waits too, M5 T10 CR-0008 (j) row 5).
    seedSpend(h, 100_000);
    // Key billing prices the job over ₹5, so it asks first (Plan card); Go starts it and the cap stops the first turn.
    h.answer(String(h.cards('plan')[0]!.id), 'go');
    await h.settle();
    expect(h.job().state).toBe('waiting');
    await stopButton(String(h.job().id));
    await expectStopped(userId, 'user_button');
  });

  it('a stop on a finished job → JOB_GONE', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), step({ kind: 'done', result: 'Done.', unverified: true })] });
    h.userSays('Find my bills');
    await h.settle();
    expect(h.job().state).toBe('done_unverified');
    const r = await stopButton(String(h.job().id));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('JOB_GONE');
  });

  it('job.stopAll stops every live job (stop_all) and logs one stopped_all line', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN, { match: 'one' }), jobIntake(BILLS_PLAN, { match: 'two' }), ...slowTools(10)] });
    h.userSaysIn(h.chat('a'), 'one');
    h.userSaysIn(h.chat('b'), 'two');
    await until(h, () => h!.jobs().filter((j) => j.state === 'working').length === 2);
    const r = await h.bridge.request<StopReport[], 'job.stopAll'>('job.stopAll', { by: 'user' });
    expect(r.ok && r.value.length).toBe(2);
    expect(h.jobs().map((j) => [j.state, j.stop_reason])).toEqual([
      ['cancelled', 'stop_all'],
      ['cancelled', 'stop_all'],
    ]);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE event = 'stopped_all'").get()).toEqual({ n: 1 });
    // J18 / 06-3 §14 C-13 (CR-0030 pick 1): one combined report in foo's chat; each job's own chat keeps its report line.
    const titles = h.jobs().map((j) => String(j.title));
    expect(fooTexts(h).at(-1)).toBe(
      `${t('thread.stop.all.lead', { count: 2, titles: titles.join(', ') })} ${t('thread.stop.all.nothing')}`,
    );
    for (const c of [h.chat('a'), h.chat('b')]) expect(fooOrHelperTexts(h, c).at(-1)).toBe(t('thread.stop.report.nothing'));
  });

  it("job.stopAll with a job in foo's chat: no second report line there, the combined one covers it", async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN, { match: 'one' }), jobIntake(BILLS_PLAN, { match: 'two' }), ...slowTools(10)] });
    h.userSays('one');
    h.userSaysIn(h.chat('b'), 'two');
    await until(h, () => h!.jobs().filter((j) => j.state === 'working').length === 2);
    const before = fooTexts(h).length;
    await h.bridge.request<StopReport[], 'job.stopAll'>('job.stopAll', { by: 'user' });
    const added = fooTexts(h).slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^Stopped 2 jobs: /);
    expect(added).not.toContain(t('thread.stop.report.nothing'));
  });
});

/** The text lines foo or a helper wrote in a chat. */
function fooOrHelperTexts(h: JobHarness, chatId: string): string[] {
  return (
    h.db
      .prepare("SELECT text FROM messages WHERE chat_id = ? AND author_kind IN ('foo', 'helper') AND kind = 'text' ORDER BY seq")
      .all(chatId) as { text: string }[]
  ).map((r) => r.text);
}
