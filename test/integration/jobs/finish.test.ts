// Spec: AT-114 (all steps finish with a proof → DONE ✅; the Proof chip and receipt footer render from the stored proof, T5),
// AT-115 (no proof possible → done_unverified ✅, "⚠ Not checked live" only on the proof line, never on the bubble), 08-2 §5.8
// (a confirmation code must appear verbatim in the pre-redaction result of `seenInToolCallId` of this job; the AI's result
// text is posted as one message), 08-4 §26.11 (a code that is also a secret → PROOF_INVALID → done_unverified).
// Engine ids are counters in these tests: `tc_000001` is the job's first tool call.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, stepDone, tool, type JobHarness, type PlanStepIn } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const SITE_PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'stay.example' } }, { phraseKey: 'find_proof' }];
const confirmation = (code: string, seenInToolCallId = 'tc_000001') => ({
  kind: 'confirmation',
  code,
  site: 'stay.example',
  seenInToolCallId,
});

async function run(done: Record<string, unknown>) {
  h = jobHarness({
    script: [
      jobIntake(SITE_PLAN),
      tool('fake.site', { site: 'stay.example' }, { delayMs: 1_000 }),
      stepDone(0, { delayMs: 1_000 }),
      step({ kind: 'done', ...done }),
    ],
  });
  const userId = h.userSays('Check my stay booking');
  await h.settle();
  return { h, userId };
}

describe('AT-114 · DONE with a checked proof', () => {
  it('a confirmation code in this job’s tool result → done ✅, proof stored, checklist done, result posted once', async () => {
    const { h, userId } = await run({ result: 'Your stay is booked. Reference ABC123.', proof: confirmation('ABC123') });
    const job = h.job();
    expect(job.state).toBe('done');
    expect(JSON.parse(String(job.proof))).toEqual(confirmation('ABC123'));
    expect(h.message(userId).badge).toBe('done');
    expect(h.cards('checklist')[0]!.state).toBe('done');
    expect(h.message(String(job.result_message_id)).text).toBe('Your stay is booked. Reference ABC123.');
    expect(h.steps().map((s) => s.state)).toEqual(['done', 'done']);
  });
});

describe('AT-115 · done_unverified', () => {
  it('a code that is not in the named result → done_unverified, no proof stored, ✅ badge value done_unverified', async () => {
    const { h, userId } = await run({ result: 'Booked.', proof: confirmation('ZZZ999') });
    expect(h.job().state).toBe('done_unverified');
    expect(h.job().proof).toBeNull();
    expect(h.message(userId).badge).toBe('done_unverified');
    expect(h.cards('checklist')[0]!.state).toBe('done_unverified');
  });

  it('a tool call id that is not this job’s → done_unverified', async () => {
    const { h } = await run({ result: 'Booked.', proof: confirmation('ABC123', 'tc_999999') });
    expect(h.job().state).toBe('done_unverified');
  });

  it('`unverified: true` with no proof → done_unverified', async () => {
    const { h } = await run({ result: 'I could not check it live.', unverified: true });
    expect(h.job().state).toBe('done_unverified');
  });

  it('a proof the app cannot re-check yet (email, M8) → done_unverified', async () => {
    const { h } = await run({
      result: 'Sent.',
      proof: { kind: 'email', connectionId: 'cn_1', messageId: 'x1', from: 'a@b.example', subject: 'Hi' },
    });
    expect(h.job().state).toBe('done_unverified');
  });
});

describe('finish when the job already left WORKING', () => {
  it('no result message is posted and the job keeps its state', async () => {
    h = jobHarness({
      script: [
        jobIntake(SITE_PLAN),
        tool('fake.site', { site: 'stay.example' }),
        step({ kind: 'done', result: 'Booked. Reference ABC123.', proof: confirmation('ABC123') }, { delayMs: 5_000 }),
      ],
    });
    h.userSays('Check my stay booking');
    // Wait for intake to open the job (a fixed few ticks was too short on a slow Windows runner, PR #85 run 39590106580).
    for (let i = 0; i < 1_000 && h.job()?.state !== 'working'; i++) await new Promise((r) => setTimeout(r, 2));
    h.db.prepare("UPDATE jobs SET state = 'cancelled' WHERE id = ?").run(String(h.job().id));
    await h.settle();
    expect(h.job().state).toBe('cancelled');
    expect(h.job().result_message_id).toBeNull();
    expect(h.messages().some((m) => String(m.text).startsWith('Booked.'))).toBe(false);
  });
});

describe('08-4 §26.11 · proof hardening', () => {
  it('a code shorter than 4 characters is not a proof', async () => {
    const { h } = await run({ result: 'Booked.', proof: confirmation('ABC') });
    expect(h.job().state).toBe('done_unverified');
  });

  it('a code found only in a tool call that ended in an error is not a proof', async () => {
    h = jobHarness({
      tools: { blockedSites: ['stay.example'] },
      script: [
        jobIntake(SITE_PLAN),
        tool('fake.site', { site: 'stay.example' }, { delayMs: 1_000 }),
        step({ kind: 'done', result: 'Booked.', proof: { ...confirmation('stay.example') } }, { delayMs: 1_000 }),
      ],
    });
    h.userSays('Check my stay booking');
    await h.settle();
    expect(h.toolCalls()[0]!.outcome).toBe('error');
    expect(h.job().state).toBe('done_unverified');
  });

  it('a code that matches only JSON punctuation or key names is not a proof', async () => {
    const { h } = await run({ result: 'Booked.', proof: confirmation('"site"') });
    expect(h.job().state).toBe('done_unverified');
  });
});
