// Spec: 03-shell-1 §3.3.2 type 1 / Article 29 (offline is confirmed after 10 s without internet; coming back clears it at once).
// This focused file keeps the existing NetMonitor behavior assertions independent from the preload source-shape preflight
// so source text from a Stryker sandbox cannot affect mutation execution for src/main/net/netMonitor.ts.
import { describe, expect, it } from 'vitest';
import { NetMonitor, OFFLINE_CONFIRM_MS } from '../../src/main/net/netMonitor';
import { FakeClock } from '../../src/shared/clock';

describe('NetMonitor', () => {
  it('confirms offline after 10 s and clears it at once', () => {
    const clock = new FakeClock();
    const net = new NetMonitor(clock);
    const seen: boolean[] = [];
    net.onChange((o) => seen.push(o));
    net.report(false);
    clock.advance(OFFLINE_CONFIRM_MS - 1);
    expect(net.offline).toBe(false);
    clock.advance(1);
    expect(net.offline).toBe(true);
    net.report(true);
    expect(net.offline).toBe(false);
    expect(seen).toEqual([false, true]);
  });
  it('a blip shorter than 10 s never shows', () => {
    const clock = new FakeClock();
    const net = new NetMonitor(clock);
    net.report(false);
    clock.advance(5_000);
    net.report(true);
    clock.advance(20_000);
    expect(net.offline).toBe(false);
  });
});
