// Spec: AT-120 (FAILED or CANCELLED + "Try again" → a new linked job "Trying again: {title}"; the old job never returns to
// WORKING), CR-0008 G-M4-01 (origin 'retry', origin_ref = old id; main allocates the new id, `job.retry { jobId, newJobId }`),
// 07-2 §4.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, tool, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN = [{ phraseKey: 'check_site', slots: { site: 'stay.example' } }, { phraseKey: 'compare', slots: { what: 'stays' } }];

describe('AT-120 · Try again', () => {
  it('makes a new linked job that runs; the old job stays FAILED', async () => {
    h = jobHarness({
      tools: { blockedSites: ['stay.example'] },
      script: [
        jobIntake(PLAN),
        tool('fake.site', { site: 'stay.example' }),
        step({ kind: 'fail', reason: 'Blocked.' }),
        step({ kind: 'done', result: 'Here are the stays.', unverified: true }),
      ],
    });
    const userId = h.userSays('Find a stay');
    await h.settle();
    const old = h.job();
    expect(old.state).toBe('failed');

    const r = await h.bridge.request<{ newJobId: string }, 'job.retry'>('job.retry', { jobId: String(old.id), newJobId: 'j_retry1' });
    expect(r).toEqual({ ok: true, value: { newJobId: 'j_retry1' } });
    await h.settle();

    const fresh = h.job('j_retry1');
    expect(fresh).toMatchObject({ origin: 'retry', origin_ref: old.id, title: 'Trying again: Checking stay.example', state: 'done_unverified' });
    expect(h.steps('j_retry1').map((s) => s.phrase_key)).toEqual(['check_site', 'compare']);
    expect(h.job(String(old.id)).state).toBe('failed');
    // The old job was never moved again: no transition op named it after it failed.
    const moves = h.txs.flatMap((t) => t.ops).filter((op) => op.op === 'transition' && op.id === old.id).map((op) => (op as { to: string }).to);
    expect(moves).toEqual(['working', 'failed']);
    expect(h.message(userId).badge).toBe('done_unverified');
  });

  it('a job that is not FAILED or CANCELLED cannot be retried', async () => {
    h = jobHarness({ script: [jobIntake(PLAN, { estimate: { minutes: 5 } })] });
    h.userSays('Find a stay');
    await h.settle();
    const r = await h.bridge.request('job.retry', { jobId: String(h.job().id), newJobId: 'j_retry2' });
    expect(r.ok).toBe(false);
  });
});
