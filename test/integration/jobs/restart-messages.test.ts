// Spec: J19 crash recovery (AT-118's restart, for the messages around a job) (07-2 §4 "app crash / PC restart → restored from state.json on next launch"), 08-2 §5.2
// (every user message gets one intake turn), §5.5 (steer: queued in order, read by the next step turn), §5.9 (recovery on
// engine start; safe mode holds it), 08-1 §4.1.2 (state.json `steerQueue`), 04 §19.4 (a cut-off reply keeps its text,
// status `failed`, Try again). The real-PC bug: messages sent while foo was answering kept 👀 forever after foo restarted.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { envelope, intake, type FakeLineIn } from '../../unit/m3-engine-helpers';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepAct, tool, type JobHarness } from './jobHarness';
import { restartEngine } from './restart';
import { fooTexts, until } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const poll = async (rounds = 40) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 2));
};
const replies = () => h!.messages().filter((m) => m.author_kind === 'foo' && m.kind === 'text');
const intakes = () => h!.turnsJsonl().filter((x) => x.purpose === 'intake');
const slow = (n: number, delayMs = 20_000) => Array.from({ length: n }, () => tool('fake.site', { site: 'stay.example' }, { delayMs }));

describe('J19 · a chat reply cut off by a restart', () => {
  for (const cleanStart of [true, false]) {
    it(`a message foo was still thinking about is answered after the restart (${cleanStart ? 'quit' : 'crash'})`, async () => {
      h = jobHarness({ script: [intake(envelope('Old engine answer.'), { delayMs: 30_000 })] });
      const userId = h.userSays('any news today?');
      await poll();
      expect(h.message(userId).badge).toBe('seen');
      restartEngine(h, [intake(envelope('Here is the news.'))], { safeMode: false, cleanStart }, undefined, { killed: true });
      await h.settle();
      expect(replies().map((m) => m.text)).toEqual(['Here is the news.']);
      expect(h.message(userId).badge).toBeNull();
    });
  }

  it('messages still waiting for the lane are answered too, oldest first, each once', async () => {
    h = jobHarness({ script: [intake(envelope('Old engine answer.'), { delayMs: 30_000, once: false })] });
    const first = h.userSays('any news today?');
    const second = h.userSays('which laptop should I buy?');
    await poll();
    expect(h.message(first).badge).toBe('seen');
    expect(h.message(second).status).toBe('sent');
    restartEngine(
      h,
      [
        intake(envelope('Here is the news.'), { match: { purpose: 'intake', promptIncludes: 'any news today?' } }),
        intake(envelope('Get the 16 GB one.'), { match: { purpose: 'intake', promptIncludes: 'which laptop' } }),
      ],
      { safeMode: false, cleanStart: true },
      undefined,
      { killed: true },
    );
    await h.settle();
    expect(replies().map((m) => m.text)).toEqual(['Here is the news.', 'Get the 16 GB one.']);
    expect(intakes().slice(-2)).toHaveLength(2);
    expect([h.message(first).badge, h.message(second).badge]).toEqual([null, null]);
  });

  it('an answered message is not answered again after a restart', async () => {
    h = jobHarness({ script: [intake(envelope('Hello there.'))] });
    h.userSays('hi');
    await h.settle();
    const before = intakes().length;
    restartEngine(h, [intake(envelope('Should not appear.'), { once: false })], { safeMode: false, cleanStart: false }, undefined, {
      killed: true,
    });
    await h.settle();
    expect(replies().map((m) => m.text)).toEqual(['Hello there.']);
    expect(intakes()).toHaveLength(before);
  });

  it('safe mode holds the cut-off message until "Start normally"', async () => {
    h = jobHarness({ script: [intake(envelope('Old engine answer.'), { delayMs: 30_000 })] });
    const userId = h.userSays('any news today?');
    await poll();
    restartEngine(h, [intake(envelope('Here is the news.'))], { safeMode: true, cleanStart: false }, undefined, { killed: true });
    await h.settle();
    expect(replies()).toHaveLength(0);
    const safe = h.cards('error').find((c) => String(c.payload).includes('SAFE_MODE'))!;
    h.answer(String(safe.id), 'start_normally');
    await h.settle();
    expect(replies().map((m) => m.text)).toEqual(['Here is the news.']);
    expect(h.message(userId).badge).toBeNull();
  });

  it('a reply still streaming when foo was killed is cut off with Try again, and Try again answers it', async () => {
    const chunked: FakeLineIn = {
      match: { purpose: 'intake' },
      chunks: [
        { text: '<say>The first sentence is here. ' },
        { text: 'The second never came.</say>', delayMs: 30_000 },
        { text: `<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>` },
      ],
    };
    h = jobHarness({ script: [chunked] });
    const userId = h.userSays('tell me a long story');
    await until(h, () => replies().some((m) => m.status === 'streaming'));
    const cut = replies()[0]!;
    restartEngine(h, [intake(envelope('A whole story.'))], { safeMode: false, cleanStart: true }, undefined, { killed: true });
    await h.settle();
    expect(h.message(String(cut.id)).status).toBe('failed');
    expect(replies()).toHaveLength(1);
    expect(h.message(userId).badge).toBeNull();
    h.bridge.send('reply.retry', { messageId: String(cut.id) });
    await h.settle();
    expect(replies().map((m) => m.text)).toContain('A whole story.');
    // One Try again per cut-off bubble.
    h.bridge.send('reply.retry', { messageId: String(cut.id) });
    await h.settle();
    expect(replies().filter((m) => m.text === 'A whole story.')).toHaveLength(1);
  });
});

describe('J19 · steer messages survive a restart (state.json steerQueue)', () => {
  const steerText = 'also check the electricity bill';
  const carriesSteer = (): FakeLineIn => ({
    match: { purpose: 'step', promptIncludes: steerText },
    reply: stepAct({ kind: 'done', result: 'Two bills due, electricity included.', unverified: true }),
  });

  /** A job working on a long step, and a steer queued behind it. */
  async function steeredMidJob(): Promise<{ jobId: string; steerId: string }> {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), ...slow(3)] });
    h.userSays('Find bills due this week');
    await until(h, () => h!.calls.length >= 1);
    const jobId = String(h.job().id);
    const steerId = h.userSays(steerText);
    await poll();
    expect(h.message(steerId).badge).toBe('seen');
    const state = JSON.parse(h.mirror(jobId, 'state.json') ?? '{}') as { steerQueue?: string[] };
    expect(state.steerQueue).toEqual([steerId]);
    return { jobId, steerId };
  }

  it('crash: the recovery card waits; "Pick up where I left off" reads the steer in the next step turn', async () => {
    const { jobId, steerId } = await steeredMidJob();
    restartEngine(h!, [carriesSteer(), ...slow(3, 1_000)], { safeMode: false, cleanStart: false }, undefined, { killed: true });
    await h!.settle();
    expect(h!.job(jobId).state).toBe('needs_you');
    // The steer is not answered as a separate chat message: it belongs to the job.
    expect(intakes().filter((x) => String(x.prompt).includes(steerText))).toHaveLength(0);
    h!.answer(String(h!.cards('error')[0]!.id), 'resume');
    await h!.settle();
    expect(h!.job(jobId).state).toBe('done_unverified');
    expect(fooTexts(h!)).toContain(t('thread.steer.folded'));
    expect(h!.message(steerId).badge).toBe('done_unverified');
  });

  it('quit: the job resumes silently and its next step turn reads the steer', async () => {
    const { jobId, steerId } = await steeredMidJob();
    await h!.bridge.request('jobs.pauseAll', { reason: 'app_quit' });
    restartEngine(h!, [carriesSteer(), ...slow(3, 1_000)], { safeMode: false, cleanStart: true }, undefined, { killed: true });
    await h!.settle();
    expect(h!.job(jobId).state).toBe('done_unverified');
    expect(h!.cards('error')).toHaveLength(0);
    expect(fooTexts(h!)).toContain(t('thread.steer.folded'));
    expect(h!.message(steerId).badge).toBe('done_unverified');
  });

  it('"Stop it" on the recovery card stops the steer with the job (⛔, nothing left queued)', async () => {
    const { jobId, steerId } = await steeredMidJob();
    restartEngine(h!, [], { safeMode: false, cleanStart: false }, undefined, { killed: true });
    await h!.settle();
    h!.answer(String(h!.cards('error')[0]!.id), 'stop');
    await h!.settle();
    expect(h!.job(jobId).state).toBe('cancelled');
    expect(h!.message(steerId).badge).toBe('stopped');
    const state = JSON.parse(h!.mirror(jobId, 'state.json') ?? '{}') as { steerQueue?: string[] };
    expect(state.steerQueue).toEqual([]);
  });

  it('a steer the step turn was reading when foo was killed is kept in state.json', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), tool('fake.site', { site: 'stay.example' }, { delayMs: 500 }), ...slow(2)] });
    h.userSays('Find bills due this week');
    await until(h, () => h!.calls.length >= 1);
    const jobId = String(h.job().id);
    const steerId = h.userSays(steerText);
    // The first tool returns, so the next step turn drains the steer and runs for 20 s.
    await until(h, () => h!.turnsJsonl().some((x) => x.purpose === 'step' && String(x.prompt).includes(steerText)));
    const state = JSON.parse(h.mirror(jobId, 'state.json') ?? '{}') as { steerQueue?: string[] };
    expect(state.steerQueue).toEqual([steerId]);
  });
});

describe('J19 · a finished job after a restart', () => {
  it('its message and result get nothing new: no second intake, no new bubble', async () => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), step({ kind: 'done', result: 'Two bills due.', unverified: true })] });
    h.userSays('Find bills due this week');
    await h.settle();
    const before = h.messages().length;
    restartEngine(h, [{ match: { purpose: 'intake' }, reply: envelope('Should not appear.'), once: false }], {
      safeMode: false,
      cleanStart: false,
    });
    await h.settle();
    expect(h.messages()).toHaveLength(before);
  });
});
