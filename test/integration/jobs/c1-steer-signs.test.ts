// Spec: AT-432 (a message answered while a job runs shows ✓✓ read, not ⏳, once its answer posts; 08-2 §5.5 item 4, CR-0024
// F9), AT-433 (a failed tool call with the job carrying on shows "Slow here, trying another way" under the current step until
// the next successful call; 05 §5.2.2, CR-0024 F10). Both through the real runner and main's job view (jobRows).
import { afterEach, describe, expect, it } from 'vitest';
import { sendMessage } from '../../../src/main/store/composerQueries';
import { jobRows, tickOf } from '../../../src/main/store/queries';
import { TEST_EPOCH_MS } from '../../../src/shared/clock';
import { newId } from '../../../src/shared/ids';
import { badgeSets, envelope, jobHarness, jobIntake, step, stepDone, tool, type JobHarness, type PlanStepIn } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN: PlanStepIn[] = [{ phraseKey: 'read_email' }, { phraseKey: 'look_for', slots: { what: 'bills' } }];
const QUESTION = 'which AI are you using';
const FOLD = 'only this month please';
const ANSWER = 'I am using Claude on your PC.';

/** A step reply that also settles the queued steer messages (08-4 §25.3 `steer`). */
function steerStep(promptIncludes: string, say: string, steer: { messageId: string; effect: string }[]) {
  const decision = { kind: 'tool', call: { tool: 'gmail.search', args: { query: 'bill' } }, why: 'next' };
  return {
    match: { purpose: 'step', promptIncludes },
    reply: `<say>${say}</say><act>${JSON.stringify({ decision, steer, usedMemoryIds: [] })}</act>`,
    delayMs: 2_000,
  };
}

/** The user's message stored the way message:send does, with an id the script already names. */
function sayWithId(x: JobHarness, id: string, text: string): void {
  x.clock.advance(1_000);
  const r = sendMessage(
    x.db,
    { chatId: x.chatId, clientId: newId('k', x.clock.now()), text },
    { now: x.clock.now(), newId: () => id, waiting: false, attachment: () => undefined },
  );
  if (!r.ok) throw new Error(`sendMessage: ${r.reason}`);
  x.bridge.send('user.message', { messageId: id, chatId: x.chatId });
}

/** Lets queued engine work run without advancing the fake clock. */
async function spin(): Promise<void> {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 2));
}

const view = (x: JobHarness) => jobRows(x.db, 'id = ?', [String(x.job().id)], x.clock.now())[0]!;

describe('AT-432 Answered steer tick', () => {
  it('a question answered during a job shows ✓✓ read with no badge at once, and keeps it when the job ends', async () => {
    const asked = newId('m', TEST_EPOCH_MS);
    const folded = newId('m', TEST_EPOCH_MS + 1);
    h = jobHarness({
      script: [
        steerStep(QUESTION, ANSWER, [
          { messageId: asked, effect: 'answered' },
          { messageId: folded, effect: 'folded' },
        ]),
        jobIntake(PLAN),
        tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 }),
        stepDone(0),
        stepDone(1),
        step({ kind: 'done', result: 'Two bills are due.', unverified: true }),
      ],
    });
    const started = h.userSays('Find bills due this week');
    await spin();
    h.clock.advance(2_000);
    await spin();
    expect(h.job().state).toBe('working');
    sayWithId(h, asked, QUESTION);
    sayWithId(h, folded, FOLD);
    await h.settle();

    expect(h.job().state).toBe('done_unverified');
    expect(h.message(started).badge).toBe('done_unverified');
    // The answered question: no ⏳ / 🛠 once the answer posted, and the job's end never reaches it.
    const sets = badgeSets(h, asked);
    expect(sets.at(-1)).toBeNull();
    expect(sets).not.toContain('done_unverified');
    expect(h.message(asked).badge).toBeNull();
    expect(tickOf(h.message(asked) as never)).toBe('read');
    // A folded message still follows the job (08-2 §5.5 item 4).
    expect(h.message(folded).badge).toBe('done_unverified');
    // The answer itself posted once.
    expect(h.messages().filter((m) => m.text === ANSWER)).toHaveLength(1);
  });

  it('a plain answered message stays ✓✓ read after its answer posts (04 §3.3)', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: envelope('Yes, I am here.') }] });
    const id = h.userSays('are you there?');
    await h.settle();
    expect(badgeSets(h, id)).toEqual(['seen', null]);
    expect(tickOf(h.message(id) as never)).toBe('read');
  });
});

describe('AT-433 Trying another way', () => {
  it('a failed tool call sets the retry line on the job view; the next good call clears it', async () => {
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 1 } },
      script: [
        jobIntake(PLAN),
        tool('gmail.search', { query: 'bill' }, { delayMs: 1_000 }),
        tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 }),
        stepDone(0),
        stepDone(1),
        step({ kind: 'done', result: 'Two bills are due.', unverified: true }),
      ],
    });
    h.userSays('Find bills due this week');
    await spin();
    expect(view(h).retrying).toBe(false);
    for (let i = 0; i < 5 && Number(h.job().fail_streak) === 0; i++) {
      h.clock.advance(1_000);
      await spin();
    }
    expect(h.toolCalls()[0]).toMatchObject({ outcome: 'error' });
    expect(h.job().state).toBe('working');
    expect(view(h).retrying).toBe(true);

    await h.settle();
    expect(h.toolCalls().map((c) => c.outcome)).toEqual(['error', 'ok']);
    expect(view(h).retrying).toBe(false);
  });

  it('the line is only for a WORKING job', async () => {
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 1 } },
      script: [jobIntake(PLAN), tool('gmail.search', { query: 'bill' }), step({ kind: 'fail', reason: 'Gmail is not answering.' })],
    });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(h.job().state).toBe('failed');
    expect(view(h).retrying).toBe(false);
  });
});
