// Spec: AT-083 (the AI spend cap is reached → no further AI call for jobs until the cap is raised or the month changes),
// 08-2 §5.10 items 2–4 (pre-call cap check on every key call; jobs → WAITING spend_cap; the Spend-cap card; raising the cap
// resumes in FIFO order), 05-3 §5.21 (payload `{ which: 'ai', capPaise, spentPaise }`; `raised` when the cap goes up),
// 07-2 §4 (working → waiting; badge ⏳ stays "working" while WAITING per BADGE_OF_STATE).
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, BILLS_PLAN, type JobHarness } from './jobHarness';
import { keyBilling, seedSpend, stepTurnsSince } from './t3Helpers';
import type { Settings } from '../../../src/shared/settings';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const CAP = 100_000;

/** A key-billed job that reaches the cap on its first step turn (spend already at ₹1,000 this month). */
async function cappedJob(): Promise<{ userId: string; from: number }> {
  h = jobHarness({ settings: keyBilling(CAP), script: [jobIntake(BILLS_PLAN), step({ kind: 'done', result: 'Done.', unverified: true })] });
  seedSpend(h, CAP);
  const userId = h.userSays('Find my bills');
  await h.settle();
  const from = h.clock.now();
  h.answer(String(h.cards('plan')[0]!.id), 'go');
  await h.settle();
  return { userId, from };
}

const setCap = (capPaise: number) => {
  const s: Settings = { ...h!.settings(), money: { ...h!.settings().money, aiCapPaise: capPaise } };
  h!.send('settings.changed', { paths: ['money.aiCapPaise'], settings: s });
};

describe('AT-083 · the AI spend cap', () => {
  it('AT-083: at the cap the job waits, no step turn is made, and one Spend-cap card shows the cap and the spend', async () => {
    const { userId, from } = await cappedJob();
    const job = h!.job();
    expect(job.state).toBe('waiting');
    expect(job.waiting_reason).toBe('spend_cap');
    expect(stepTurnsSince(h!, from)).toBe(0);
    const cards = h!.cards('spend_cap');
    expect(cards).toHaveLength(1);
    expect(JSON.parse(String(cards[0]!.payload))).toEqual({ which: 'ai', capPaise: CAP, spentPaise: CAP });
    expect(h!.message(userId).badge).toBe('working');
    // Time passing changes nothing: still no call.
    h!.clock.advance(30 * 60_000);
    await h!.settle();
    expect(stepTurnsSince(h!, from)).toBe(0);
    expect(h!.job().state).toBe('waiting');
  });

  it('AT-083: raising the cap resumes the job; the Spend-cap card becomes "raised"', async () => {
    const { from } = await cappedJob();
    setCap(2 * CAP);
    await h!.settle();
    expect(stepTurnsSince(h!, from)).toBe(1);
    expect(h!.job().state).toBe('done_unverified');
    expect(h!.cards('spend_cap')[0]!.state).toBe('raised');
  });

  it('AT-083: a settings change that leaves the cap reached keeps the job waiting', async () => {
    const { from } = await cappedJob();
    setCap(CAP);
    await h!.settle();
    expect(stepTurnsSince(h!, from)).toBe(0);
    expect(h!.job().state).toBe('waiting');
    expect(h!.cards('spend_cap').map((c) => c.state)).toEqual(['shown']);
  });

  it('AT-083: another setting changing does not resume the capped job or mark its card raised', async () => {
    const { from } = await cappedJob();
    const s = h!.settings();
    h!.send('settings.changed', { paths: [], settings: { ...s, appearance: { ...s.appearance, theme: 'dark' } } });
    await h!.settle();
    expect(stepTurnsSince(h!, from)).toBe(0);
    expect(h!.job().state).toBe('waiting');
    expect(h!.cards('spend_cap').map((c) => c.state)).toEqual(['shown']);
  });

  it('AT-083: the month changes → the spend meter starts again and the job resumes', async () => {
    const { from } = await cappedJob();
    // Past the 1st of next month 00:00 in the user's zone (at most 31 days away).
    h!.clock.advance(32 * 86_400_000);
    await h!.settle();
    expect(stepTurnsSince(h!, from)).toBe(1);
    expect(h!.job().state).toBe('done_unverified');
  });
});
