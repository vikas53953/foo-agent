// Spec: 08-2 §5.4.1 (3 WORKING slots; NEEDS_YOU and WAITING release the slot; FIFO by created_at among startable jobs;
// start needs the AI verified within 10 min, else a verify first), 08-4 §26.8 items 1–3 (a queued browser job also needs one
// of the 3 job windows), AT-105 (3 WORKING + a 4th → QUEUED; never 4 at once), AT-106 (verify first when stale).
import { describe, expect, it } from 'vitest';
import { MAX_WORKING, needsVerify, pickStartable, type QueueJob } from '../../../src/engine/jobs/queue';

const job = (id: string, state: QueueJob['state'], createdAt: number, usesBrowser = false): QueueJob => ({
  id,
  state,
  createdAt,
  usesBrowser,
});

describe('08-2 §5.4.1 scheduling', () => {
  it('AT-105: with 3 WORKING a 4th stays queued; never 4 at once', () => {
    expect(MAX_WORKING).toBe(3);
    const jobs = [job('a', 'working', 1), job('b', 'working', 2), job('c', 'working', 3), job('d', 'queued', 4)];
    expect(pickStartable(jobs, 0)).toEqual([]);
  });

  it('starts the oldest queued jobs first, up to the free slots', () => {
    const jobs = [job('w', 'working', 1), job('q3', 'queued', 30), job('q1', 'queued', 10), job('q2', 'queued', 20)];
    expect(pickStartable(jobs, 0)).toEqual(['q1', 'q2']);
  });

  it('NEEDS_YOU and WAITING jobs do not hold a slot', () => {
    const jobs = [job('n', 'needs_you', 1), job('w', 'waiting', 2), job('x', 'working', 3), job('q', 'queued', 4)];
    expect(pickStartable(jobs, 0)).toEqual(['q']);
  });

  it('08-4 §26.8: a queued browser job waits for one of the 3 job windows; a later non-browser job may start', () => {
    const jobs = [job('b', 'queued', 1, true), job('p', 'queued', 2)];
    expect(pickStartable(jobs, 3)).toEqual(['p']);
    expect(pickStartable(jobs, 2)).toEqual(['b', 'p']);
    expect(pickStartable([job('b1', 'queued', 1, true), job('b2', 'queued', 2, true)], 2)).toEqual(['b1']);
  });

  it('the AI must have been verified in the last 10 min', () => {
    const now = 1_000_000_000;
    expect(needsVerify(undefined, now)).toBe(true);
    expect(needsVerify(now - 10 * 60_000, now)).toBe(false);
    expect(needsVerify(now - 10 * 60_000 - 1, now)).toBe(true);
  });
});
