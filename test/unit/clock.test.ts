// 08-3 §22.2 injected Clock; X-10 test start Fri 16 Oct 2026, 9:00 AM IST.
import { describe, expect, it } from 'vitest';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';

describe('FakeClock', () => {
  it('starts at Fri 16 Oct 2026, 9:00 AM IST', () => {
    expect(new Date(TEST_EPOCH_MS).toISOString()).toBe('2026-10-16T03:30:00.000Z');
    expect(new FakeClock().now()).toBe(TEST_EPOCH_MS);
  });
  it('fires timers in due order on advance, at their due time', () => {
    const c = new FakeClock(0);
    const seen: [string, number][] = [];
    c.setTimeout(() => seen.push(['b', c.now()]), 200);
    c.setTimeout(() => seen.push(['a', c.now()]), 100);
    const gone = c.setTimeout(() => seen.push(['x', c.now()]), 150);
    c.clearTimeout(gone);
    c.advance(150);
    expect(seen).toEqual([['a', 100]]);
    c.advance(100);
    expect(seen).toEqual([
      ['a', 100],
      ['b', 200],
    ]);
    expect(c.now()).toBe(250);
  });
  it('runs timers scheduled by timers within the same advance', () => {
    const c = new FakeClock(0);
    let n = 0;
    c.setTimeout(() => c.setTimeout(() => n++, 10), 10);
    c.advance(20);
    expect(n).toBe(1);
  });
  it('set jumps; backwards fires nothing; reset clears timers', () => {
    const c = new FakeClock(1000);
    let fired = 0;
    c.setTimeout(() => fired++, 10);
    c.set(500);
    expect(fired).toBe(0);
    c.set(2000);
    expect(fired).toBe(1);
    c.setTimeout(() => fired++, 10);
    c.reset();
    expect(c.now()).toBe(TEST_EPOCH_MS);
    expect(c.pendingTimers).toBe(0);
    expect(() => c.advance(-1)).toThrow(RangeError);
  });
});
