// Spec: 08-2 §8.3.2 (one browser process, a window per job, at most 3), 08-4 §26.8 items 3–5 (a browser job waits for a free
// window, FIFO; while it waits its row reads the queued caption; windows close on every terminal state).
import { describe, expect, it } from 'vitest';
import { MAX_JOB_WINDOWS, WindowPool } from '../../../src/engine/tools/browser/windows';

describe('08-4 §26.8 job windows', () => {
  it('at most 3 windows; a 4th job waits and is reported queued until one closes', async () => {
    expect(MAX_JOB_WINDOWS).toBe(3);
    const pool = new WindowPool();
    await pool.acquire('j1');
    await pool.acquire('j2');
    await pool.acquire('j3');
    expect(pool.open).toBe(3);
    let fourth = false;
    const p4 = pool.acquire('j4').then(() => (fourth = true));
    await Promise.resolve();
    expect(fourth).toBe(false);
    expect(pool.isQueued('j4')).toBe(true);
    pool.release('j2');
    await p4;
    expect(fourth).toBe(true);
    expect(pool.isQueued('j4')).toBe(false);
    expect(pool.open).toBe(3);
  });

  it('a job that already holds a window gets it again without waiting', async () => {
    const pool = new WindowPool();
    await pool.acquire('j1');
    await pool.acquire('j1');
    expect(pool.open).toBe(1);
  });

  it('waiting jobs start first in, first out', async () => {
    const pool = new WindowPool(1);
    await pool.acquire('a');
    const order: string[] = [];
    const b = pool.acquire('b').then(() => order.push('b'));
    const c = pool.acquire('c').then(() => order.push('c'));
    pool.release('a');
    await b;
    pool.release('b');
    await c;
    expect(order).toEqual(['b', 'c']);
  });

  it('a waiting job that is cancelled leaves the queue', async () => {
    const pool = new WindowPool(1);
    await pool.acquire('a');
    const ac = new AbortController();
    const p = pool.acquire('b', ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
    expect(pool.isQueued('b')).toBe(false);
    pool.release('a');
    expect(pool.open).toBe(0);
  });

  it('a job stopped before its wait began is refused at once and never takes a freed slot', async () => {
    const pool = new WindowPool(1);
    await pool.acquire('a');
    const ac = new AbortController();
    ac.abort();
    await expect(pool.acquire('b', ac.signal)).rejects.toThrow();
    expect(pool.isQueued('b')).toBe(false);
    pool.release('a');
    expect(pool.holds('b')).toBe(false);
  });
});
