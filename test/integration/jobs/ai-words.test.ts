// Spec: AT-119 (the fake AI says "All done!" without a proof object or `unverified` → the job is not DONE; badge and checklist
// keep the runner's state), Art. 12 (AI words never move a status), 08-2 §5.1.
import { afterEach, describe, expect, it } from 'vitest';
import { BILLS_PLAN, jobHarness, jobIntake, step, tool, type JobHarness } from './jobHarness';
import { until } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

describe('AT-119 · "All done!" is not DONE', () => {
  it('a done decision with no proof and no unverified flag leaves the job WORKING 🛠; the next turn decides', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        tool('gmail.search', { query: 'bill' }),
        step({ kind: 'done', result: 'All done!' }, { delayMs: 2_000 }),
        // Held so the test can look at the state between the two turns.
        step({ kind: 'done', result: 'Two bills.', unverified: true }, { delayMs: 60_000 }),
      ],
    });
    const userId = h.userSays('Find bills due this week');
    const run = h;
    await until(run, () => run.turnsJsonl().filter((t) => t.purpose === 'step').length === 3, 250);
    expect(h.turnsJsonl().filter((t) => t.purpose === 'step')).toHaveLength(3);
    expect(h.job().state).toBe('working');
    expect(h.message(userId).badge).toBe('working');
    expect(h.cards('checklist')[0]!.state).toBe('live');
    expect(h.messages().some((m) => m.text === 'All done!')).toBe(false);
    expect(Number(h.job().fail_streak)).toBe(1);

    await h.settle(1_000);
    expect(h.job().state).toBe('done_unverified');
  });
});
