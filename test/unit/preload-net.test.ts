// Spec: 08-3 §22.0 (the preload allow-lists equal the 08-1 §3 channel lists; the test preload repeats the same lists
// because a sandboxed preload cannot require local files), 03-shell-1 §3.3.2 type 1 / Article 29 (offline is confirmed
// after 10 s without internet; coming back clears it at once).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NetMonitor, OFFLINE_CONFIRM_MS } from '../../src/main/net/netMonitor';
import { FakeClock } from '../../src/shared/clock';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../src/shared/ipc';

function setOf(file: string, name: string): string[] {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(`const ${name} = new Set([`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = src.slice(start, src.indexOf(']);', start));
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();
}

describe('preload allow-lists', () => {
  for (const file of ['src/preload/preload.ts', 'src/preload/preloadTest.ts']) {
    it(`${file} invokes match the shared list`, () => expect(setOf(file, 'INVOKES')).toEqual([...INVOKE_CHANNELS].sort()));
    it(`${file} events match the shared list`, () => expect(setOf(file, 'EVENTS')).toEqual([...EVENT_CHANNELS].sort()));
  }
});

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
