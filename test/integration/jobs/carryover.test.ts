// Spec: M5 T10, the M4 spec lines CR-0008 (j) moved to M5. Rows 1–2: 08-2 §5.10 item 3 (the spend meter is updated per turn,
// `spend:update`) and item 4 (at ≥ 80 % once per month → one line in foo's chat, 05-3 §5.21 trigger "You've used ₹{800} of
// your ₹{1,000} AI cap this month.", `messages.why` cap_warning, 08-0 §G.17); row 5: item 4 "every AI call on a key
// provider" (intake, repair and rewrite turns too; at the cap a message waits to send, 04 §3.3); row 10: 08-2 §5.7 steps 3–4
// (every stop writes the `stopped_job` activity line and the J18 report, the recovery card's "Stop it" too); row 3: 08-2
// §5.3.3 ("Change plan" → the text goes back to an intake turn with the old plan attached) and 05-3 §5.12.2 (the new Plan
// card shows below; the old one reads "Plan changed. See the new one below."); row 4: 05-3 §5.12.2 (no answer 24 h →
// `withdrawn`, resolved_by auto: "I didn't start {title} because I didn't hear back."); row 8: 08-4 §26.8 item 6 (WAITING
// opens_at sleeps until wake_at with no AI turn; the 15 s tick moves it to WORKING).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import type { Settings } from '../../../src/shared/settings';
import { envelope, intake } from '../../unit/m3-engine-helpers';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, type JobHarness } from './jobHarness';
import { restartEngine } from './restart';
import { keyBilling, seedSpend, until } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const CAP = 100_000;
const spendPatches = (x: JobHarness) => x.patches.filter((p) => p.event === 'spend:update');
const intakeTurns = (x: JobHarness) =>
  Number((x.db.prepare("SELECT COUNT(*) AS n FROM ai_turns WHERE purpose = 'intake'").get() as { n: number }).n);
const warnLines = (x: JobHarness) =>
  x.db.prepare("SELECT * FROM messages WHERE json_extract(why, '$.source') = 'cap_warning'").all() as Record<string, unknown>[];

describe('CR-0008 (j) row 1 · the Spent meter moves after every AI turn', () => {
  it('each ai_turns write is followed by one spend:update with the new month total', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Hello there.'))] });
    seedSpend(h, 5_000);
    const before = spendPatches(h).length;
    h.userSays('hi');
    await h.settle();
    const after = spendPatches(h).slice(before);
    expect(after).toHaveLength(1);
    const summary = after[0]!.payload as { aiSpentPaise: number; aiCapPaise: number };
    // The summary is read after the turn's row: it carries this month's key total from the table.
    const total = (h.db.prepare("SELECT SUM(COALESCE(cost_paise, 0)) AS p FROM ai_turns WHERE billing = 'key'").get() as { p: number }).p;
    expect(Number((h.db.prepare('SELECT COUNT(*) AS n FROM ai_turns').get() as { n: number }).n)).toBe(2);
    expect(summary.aiSpentPaise).toBe(total);
    expect(summary.aiCapPaise).toBe(CAP);
  });
});

describe('CR-0008 (j) row 2 · 80 % of the AI cap, once per month', () => {
  it("at 80 % one line in foo's chat with the Why footer; a second turn the same month posts nothing more", async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Sure.'))] });
    seedSpend(h, 80_000);
    h.userSays('one');
    await h.settle();
    const lines = warnLines(h);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe(t('thread.cap_warning.line', { spent: '₹800', cap: '₹1,000' }));
    expect(lines[0]!.text).toBe('You’ve used ₹800 of your ₹1,000 AI cap this month.');
    expect(lines[0]!.chat_id).toBe(h.chatId);
    expect(lines[0]!.author_kind).toBe('foo');
    h.userSays('two');
    await h.settle();
    expect(warnLines(h)).toHaveLength(1);
  });

  it('under 80 %, with the warning turned off, or with plan billing, no line', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Sure.'))] });
    seedSpend(h, 79_000);
    h.userSays('one');
    await h.settle();
    expect(warnLines(h)).toHaveLength(0);
    h.close();
    const off = (s: Settings): Settings => {
      const k = keyBilling(CAP)(s);
      return { ...k, money: { ...k.money, warnAt80: false } };
    };
    h = jobHarness({ settings: off, script: [intake(envelope('Sure.'))] });
    seedSpend(h, 90_000);
    h.userSays('one');
    await h.settle();
    expect(warnLines(h)).toHaveLength(0);
  });

  it('a new month warns again', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Sure.'))] });
    seedSpend(h, 80_000);
    h.userSays('one');
    await h.settle();
    h.clock.advance(32 * 86_400_000);
    seedSpend(h, 85_000);
    h.userSays('two');
    await h.settle();
    expect(warnLines(h)).toHaveLength(2);
  });
});

describe('CR-0008 (j) row 5 · the cap check covers chat-lane turns', () => {
  it('at the cap an intake turn is not made: the message waits to send and goes when the cap is raised', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Here you go.'))] });
    seedSpend(h, CAP + 1);
    const id = h.userSays('what is on today?');
    await h.settle();
    expect(intakeTurns(h)).toBe(1); // the seeded row only
    expect(h.message(id).status).toBe('queued');
    const s = h.settings();
    h.send('settings.changed', { paths: ['money.aiCapPaise'], settings: { ...s, money: { ...s.money, aiCapPaise: 2 * CAP } } });
    await h.settle();
    expect(intakeTurns(h)).toBe(2);
    expect(h.message(id).status).toBe('complete');
    expect(h.messages().some((m) => m.text === 'Here you go.')).toBe(true);
  });

  it('a repair turn at the cap is not made', async () => {
    // The intake reply has no valid act, so a repair turn would follow; the cap is reached while the intake is in flight.
    h = jobHarness({
      settings: keyBilling(CAP),
      script: [intake('<say>Hi.</say><act>{"bad":true}</act>', { delayMs: 5_000 }), { match: { purpose: 'repair' }, reply: envelope('') }],
    });
    h.userSays('hello');
    await until(h, () => h!.turnsJsonl().some((r) => r.purpose === 'intake'), 0);
    seedSpend(h, CAP + 1);
    await h.settle();
    expect(intakeTurns(h)).toBe(2);
    expect(h.turnsJsonl().filter((r) => r.purpose === 'repair')).toHaveLength(0);
    // The valid <say> is still posted as a plain reply (08-2 §7.5).
    expect(h.messages().some((m) => m.text === 'Hi.')).toBe(true);
  });
});

describe('CR-0008 (j) row 10 · "Stop it" on the recovery card writes stopped_job and the stop report', () => {
  it('after a crash, Stop it → CANCELLED, one stopped_job activity row and "Stopped. Nothing was booked, paid or sent."', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), stepDone(0), tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })] });
    h.userSays('Find bills due this week');
    await until(h, () => h!.jobs().length > 0 && h!.job().state === 'working', 500);
    restartEngine(h, [], { safeMode: false, cleanStart: false });
    await h.settle();
    h.answer(String(h.cards('error')[0]!.id), 'stop');
    await h.settle();
    expect(h.job().state).toBe('cancelled');
    const act = h.db.prepare("SELECT * FROM activity WHERE event = 'stopped_job'").all() as Record<string, unknown>[];
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({ kind: 'stopped', actor: 'user', job_id: h.job().id, outcome: 'done' });
    const last = h
      .messages()
      .filter((m) => m.author_kind === 'foo' && m.kind === 'text')
      .at(-1);
    expect(last?.text).toBe(t('thread.stop.report.nothing'));
  });
});

describe('CR-0008 (j) row 3 · Change plan → re-intake with the old plan → a new Plan card below', () => {
  const GOA = [
    { phraseKey: 'look_for', slots: { what: 'Goa stays under ₹8,000' } },
    { phraseKey: 'look_for', slots: { what: 'beach walks' } },
  ];
  const CHEAPER = [
    { phraseKey: 'look_for', slots: { what: 'Goa stays under ₹5,000' } },
    { phraseKey: 'look_for', slots: { what: 'beach walks' } },
  ];

  it('the next message carries the old plan; its job gets a new Plan card after the changed one', async () => {
    h = jobHarness({
      script: [
        jobIntake(GOA, { title: 'Goa stay', estimate: { minutes: 6 }, match: 'Find a Goa stay' }),
        jobIntake(CHEAPER, { title: 'Goa stay', estimate: { minutes: 6 }, match: 'cheaper please' }),
      ],
    });
    h.userSays('Find a Goa stay');
    await h.settle();
    const [first] = h.cards('plan');
    expect(first!.state).toBe('pending');
    h.answer(String(first!.id), 'change');
    await h.settle();
    expect(h.cards('plan')[0]!.state).toBe('changed');
    expect(h.jobs()[0]!.state).toBe('cancelled');

    h.userSays('cheaper please');
    await h.settle();
    const turn = h
      .turnsJsonl()
      .filter((r) => r.purpose === 'intake')
      .at(-1)!;
    const prompt = String(turn.prompt);
    expect(prompt).toContain(`The job:\nTitle: ${String(h.jobs()[0]!.title)}\nPlan (version 1):\n1. [next] `);
    expect(prompt).toContain('Goa stays under ₹8,000');
    // The old plan sits before the user's words.
    expect(prompt.indexOf('The job:')).toBeLessThan(prompt.indexOf('cheaper please'));
    const plans = h.cards('plan');
    expect(plans.map((c) => c.state)).toEqual(['changed', 'pending']);
    const seqOf = (cardId: unknown) =>
      Number((h!.db.prepare('SELECT seq FROM messages WHERE card_id = ?').get(cardId) as { seq: number }).seq);
    expect(seqOf(plans[1]!.id)).toBeGreaterThan(seqOf(plans[0]!.id));
    expect(JSON.parse(String(plans[1]!.payload)).steps.join(' ')).toContain('Goa stays under ₹5,000');
  });

  it('only the next intake turn carries it', async () => {
    h = jobHarness({
      script: [
        jobIntake(GOA, { title: 'Goa stay', estimate: { minutes: 6 }, match: 'Find a Goa stay' }),
        intake(envelope('Okay.'), { match: { purpose: 'intake', promptIncludes: 'cheaper' } } as never),
        intake(envelope('Hi.')),
      ],
    });
    h.userSays('Find a Goa stay');
    await h.settle();
    h.answer(String(h.cards('plan')[0]!.id), 'change');
    await h.settle();
    h.userSays('cheaper');
    await h.settle();
    h.userSays('thanks');
    await h.settle();
    const prompts = h
      .turnsJsonl()
      .filter((r) => r.purpose === 'intake')
      .map((r) => String(r.prompt));
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain('The job:');
    expect(prompts[2]).not.toContain('The job:');
  });
});

describe('CR-0008 (j) row 4 · an unanswered Plan card withdraws after 24 h', () => {
  it('pending for 24 h → withdrawn (auto), the job is not started and never ran a step', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN, { title: 'Goa stay', estimate: { minutes: 6 } })] });
    h.userSays('Find a Goa stay');
    await h.settle();
    h.clock.advance(23 * 3_600_000);
    await h.settle();
    expect(h.cards('plan')[0]!.state).toBe('pending');
    h.clock.advance(3_600_000);
    await h.settle(15_000);
    const card = h.cards('plan')[0]!;
    expect(card.state).toBe('withdrawn');
    expect(card.resolved_by).toBe('auto');
    expect(h.job().state).toBe('cancelled');
    expect(h.turnsJsonl().filter((r) => r.purpose === 'step')).toHaveLength(0);
  });
});

describe('CR-0008 (j) row 8 · the opens_at tick', () => {
  it('a job that opens later waits with no AI turn, and the 15 s tick starts it at wake_at', async () => {
    h = jobHarness({ script: [step({ kind: 'done', result: 'Ready.', unverified: true })] });
    const opensAt = h.clock.now() + 10 * 60_000;
    const jobId = await h.engine.jobs.createJob({
      chatId: h.chatId,
      userMessageId: null,
      askedText: 'Get ready for the 10:10 opening',
      decision: {
        kind: 'job',
        title: 'Opening',
        plan: [{ phraseKey: 'read_email', slots: {}, route: 'api' }],
        routeHint: ['api'],
        needsApps: [],
      } as never,
      origin: 'system',
      wakeAt: opensAt,
    });
    await h.settle();
    expect(h.job(jobId!).state).toBe('waiting');
    expect(h.job(jobId!).waiting_reason).toBe('opens_at');
    expect(h.job(jobId!).wake_at).toBe(opensAt);
    h.clock.advance(9 * 60_000);
    await h.settle();
    expect(h.job(jobId!).state).toBe('waiting');
    expect(h.turnsJsonl().filter((r) => r.purpose === 'step')).toHaveLength(0);
    await until(h, () => h!.job(jobId!).state === 'done_unverified', 5_000);
    expect(h.turnsJsonl().filter((r) => r.purpose === 'step')).toHaveLength(1);
    expect(h.job(jobId!).wake_at).toBeNull();
  });
});
