// Spec: AT-081 (the internet drops mid-job → WAITING within 10 s, the banner carries it, no extra bar above the composer and
// no error card; it returns → the job resumes from the same step without redoing finished steps), 08-3 §21.2 NET_OFFLINE
// (the app-wide banner shows the offline line, X-13), 05-3 §5.20 (offline shows no C16 card). The ≤ 10 s detection is
// main's NetMonitor (M1); the engine reacts to `net { online }` at once. The banner itself: test/e2e/m4-offline.spec.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const poll = async (rounds = 40) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 2));
};

describe('NET_OFFLINE mid-job, engine side (the app test is test/e2e/m4-offline.spec.ts)', () => {
  it('net offline → WAITING net_offline (no card); online → resumes from the same step, finished steps untouched', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        stepDone(0),
        tool('gmail.search', { query: 'bill' }, { delayMs: 5_000 }),
        stepDone(1),
        step({ kind: 'done', result: 'Two bills due.', unverified: true }),
      ],
    });
    h.userSays('Find bills due this week');
    await poll();
    h.clock.advance(1_000);
    await poll();
    expect(h.job().state).toBe('working');
    const step0 = h.steps()[0]!;
    expect(step0.state).toBe('done');

    h.send('net', { online: false });
    await poll();
    expect(h.job().state).toBe('waiting');
    expect(h.job().waiting_reason).toBe('net_offline');
    expect(h.cards('error')).toHaveLength(0);
    // The in-flight turn ends while offline; the job does not move on or start again.
    await h.settle();
    expect(h.job().state).toBe('waiting');

    h.send('net', { online: true });
    await h.settle();
    expect(h.job().state).toBe('done_unverified');
    const steps = h.steps();
    expect(steps.map((s) => s.state)).toEqual(['done', 'done']);
    expect(steps[0]!.finished_at).toBe(step0.finished_at);
    expect(h.cards('error')).toHaveLength(0);
  });
});
