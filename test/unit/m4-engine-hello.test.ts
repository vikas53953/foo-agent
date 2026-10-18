// Spec: 08-1 §2.4 (main's half of the engine port; on every engine (re)start main sends settings and the network state),
// 08-3 §22 (FOO_TEST: the engine's fake clock follows main's through `test.clock`). Ticket M4 T8: a `test:clock` set while
// the engine is not live is dropped, so the hello sends main's clock first, before `settings.changed`.
import { describe, expect, it } from 'vitest';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { engineHello } from '../../src/main/engine-supervisor/hello';

type Sent = { kind: string; payload: unknown };

/** Stands in for EngineBridge.send: drops messages while the engine is not live, as the real one does. */
function fakeBridge() {
  const sent: Sent[] = [];
  const bridge = {
    live: false,
    send(kind: string, payload: unknown): boolean {
      if (!bridge.live) return false;
      sent.push({ kind, payload });
      return true;
    },
  };
  return { bridge, sent };
}

const AT_941 = Date.parse('2026-10-18T04:11:00.000Z'); // 9:41 AM IST

describe('engine hello (M4 T8)', () => {
  it('sends main’s test clock first after a set made while the engine was not live', () => {
    const clock = new FakeClock(TEST_EPOCH_MS);
    const { bridge, sent } = fakeBridge();
    clock.set(AT_941);
    bridge.send('test.clock', { now: clock.now() }); // what test:clock does before the engine forks: dropped
    expect(sent).toEqual([]);

    bridge.live = true; // the supervisor wired the port, then calls onStarted
    engineHello(bridge.send, { settings: () => settingsDefaults, online: () => true, testClock: clock });

    expect(sent.map((m) => m.kind)).toEqual(['test.clock', 'settings.changed', 'net']);
    expect(sent[0]!.payload).toEqual({ now: AT_941 });
    expect(sent[1]!.payload).toEqual({ paths: [], settings: settingsDefaults });
    expect(sent[2]!.payload).toEqual({ online: true });
  });

  it('sends the clock again on every restart, at main’s current time', () => {
    const clock = new FakeClock(AT_941);
    const { bridge, sent } = fakeBridge();
    bridge.live = true;
    const hello = () => engineHello(bridge.send, { settings: () => settingsDefaults, online: () => false, testClock: clock });
    hello();
    clock.advance(60_000);
    hello();
    const clocks = sent.filter((m) => m.kind === 'test.clock').map((m) => m.payload);
    expect(clocks).toEqual([{ now: AT_941 }, { now: AT_941 + 60_000 }]);
    expect(sent.at(-1)).toEqual({ kind: 'net', payload: { online: false } });
  });

  it('sends no clock outside a test run', () => {
    const { bridge, sent } = fakeBridge();
    bridge.live = true;
    engineHello(bridge.send, { settings: () => settingsDefaults, online: () => true, testClock: null });
    expect(sent.map((m) => m.kind)).toEqual(['settings.changed', 'net']);
  });
});
