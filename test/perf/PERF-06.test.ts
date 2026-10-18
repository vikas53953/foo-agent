// PERF-06 (10-2 §E, J18): stop < 1 s: from "stop" sent to the job's last click or AI call, 0 events after 1 s (08-2 §5.7:
// halt aborts the AI turn and the tool call in flight; the cancel lands in one transaction). 20 runs, stopping at a
// different point of the job each time.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, tool, BILLS_PLAN, type JobHarness } from '../integration/jobs/jobHarness';
import { stepTurnsSince, until } from '../integration/jobs/t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

describe('PERF-06 stop is fast', () => {
  it('PERF-06: 20 runs, "stop" → no click or AI call for the job after 1 s', async () => {
    for (let run = 0; run < 20; run++) {
      const delayMs = 400 + 150 * (run % 7);
      h = jobHarness({
        script: [jobIntake(BILLS_PLAN), ...Array.from({ length: 12 }, () => tool('fake.site', { site: 'stay.example' }, { delayMs }))],
      });
      h.userSays('Find my bills');
      await until(h, () => h!.calls.length >= 1 + (run % 4), 70);
      const stopId = h.userSays('stop');
      const stopAt = Number(h.message(stopId).created_at);
      await until(h, () => h!.job().state === 'cancelled', 100);
      expect(h.clock.now() - stopAt, `run ${run}`).toBeLessThanOrEqual(1_000);
      await h.settle();
      expect(
        h.calls.filter((c) => c.at > stopAt),
        `run ${run}`,
      ).toHaveLength(0);
      expect(stepTurnsSince(h, stopAt + 1), `run ${run}`).toBe(0);
      h.close();
      h = null;
    }
  }, 60_000);
});
