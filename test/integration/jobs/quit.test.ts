// Spec: AT-089 (quit with running jobs → saved as WAITING, resume on next open), 08-1 §2.3 steps 4–5 (`jobs.pauseAll`
// app_quit / windows_shutdown, acked before main exits; G-M4-04), 08-4 §26.10 (a clean pause resumes with a checklist edit
// only: no message, no recovery card), 08-2 §5.9 step 4.
import { afterEach, describe, expect, it } from 'vitest';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, type JobHarness } from './jobHarness';
import { restartEngine } from './restart';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const poll = async (rounds = 40) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 2));
};
const finish = () => [stepDone(0), stepDone(1), step({ kind: 'done', result: 'Two bills due.', unverified: true })];

describe('AT-089 · quit with a running job', () => {
  for (const reason of ['app_quit', 'windows_shutdown'] as const) {
    it(`jobs.pauseAll ${reason} → WAITING ${reason}, acked with the job ids; next open resumes silently`, async () => {
      h = jobHarness({ script: [jobIntake(BILLS_PLAN), tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })] });
      h.userSays('Find bills due this week');
      await poll();
      h.clock.advance(2_000);
      await poll();
      const jobId = String(h.job().id);
      expect(h.job().state).toBe('working');
      const ack = await h.bridge.request<{ paused: string[] }, 'jobs.pauseAll'>('jobs.pauseAll', { reason });
      expect(ack).toEqual({ ok: true, value: { paused: [jobId] } });
      expect(h.job().state).toBe('waiting');
      expect(h.job().waiting_reason).toBe(reason);
      expect(h.cards('error')).toHaveLength(0);
      const state = JSON.parse(h.mirror(jobId, 'state.json') ?? '{}') as { job: { state: string; waitingReason: string } };
      expect(state.job.state).toBe('waiting');
      expect(state.job.waitingReason).toBe(reason);

      // Reopen: the job resumes from the same step; no recovery card, no new message but the result.
      const before = h.messages().length;
      restartEngine(h, [tool('gmail.search', { query: 'bill' }), ...finish()], { safeMode: false, cleanStart: true });
      await h.settle();
      expect(h.job().state).toBe('done_unverified');
      expect(h.cards('error')).toHaveLength(0);
      const checklistIds = new Set(h.cards('checklist').map((c) => c.message_id));
      expect(
        h
          .messages()
          .slice(before)
          .filter((m) => !checklistIds.has(m.id))
          .map((m) => m.text),
      ).toEqual(['Two bills due.']);
    });
  }

  it('nothing starts after pauseAll (a queued job stays queued while foo quits)', async () => {
    h = jobHarness({
      script: [
        ...['one', 'two', 'three', 'four'].map((w) => jobIntake(BILLS_PLAN, { match: w })),
        ...[1, 2, 3].map(() => tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })),
        { ...step({ kind: 'done', result: 'Done.', unverified: true }), once: false },
      ],
    });
    for (const w of ['one', 'two', 'three', 'four']) h.userSays(w);
    await poll();
    h.clock.advance(2_000);
    await poll();
    await h.bridge.request('jobs.pauseAll', { reason: 'app_quit' });
    await h.settle(1_000);
    const states = h.jobs().map((j) => j.state);
    expect(states.filter((s) => s === 'waiting')).toHaveLength(3);
    expect(states.filter((s) => s === 'queued')).toHaveLength(1);
  });
});
