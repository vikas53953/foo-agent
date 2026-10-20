// M8 T3: the wa-bridge process lifecycle in main's supervisor (08-1 §2.1 row wa-bridge: forked only when needed; on a crash
// restarted with back-off 5 s, 30 s, 2 min, 10 min and the port re-wired; after 4 failures the connection status is `error`;
// §2.4.2: after a restart main re-sends `bridge.port` with a fresh port pair). Fake fork and fake clock.
import { describe, expect, it } from 'vitest';
import { BridgeLifecycle, type BridgeProcess } from '../../src/main/whatsapp/bridgeLifecycle';
import { FakeClock } from '../../src/shared/clock';

function rig() {
  const clock = new FakeClock();
  const forks: { exit: (code: number | null) => void; killed: boolean; posted: unknown[] }[] = [];
  let wired = 0;
  let gaveUp = 0;
  const life = new BridgeLifecycle({
    clock,
    fork: (): BridgeProcess => {
      const f = { exit: (() => {}) as (code: number | null) => void, killed: false, posted: [] as unknown[] };
      forks.push(f);
      return {
        kill: () => {
          f.killed = true;
          f.exit(0);
        },
        onExit: (fn) => {
          f.exit = fn;
        },
        post: (m) => void f.posted.push(m),
      };
    },
    wire: () => void (wired += 1),
    onGiveUp: () => void (gaveUp += 1),
  });
  return { clock, forks, life, wired: () => wired, gaveUp: () => gaveUp };
}

describe('BridgeLifecycle (08-1 §2.1)', () => {
  it('forks once and wires a port pair; start while running does nothing', () => {
    const r = rig();
    expect(r.life.running).toBe(false);
    r.life.start();
    r.life.start();
    expect(r.forks).toHaveLength(1);
    expect(r.wired()).toBe(1);
    expect(r.life.running).toBe(true);
  });

  it('restarts after a crash on the 5 s, 30 s, 2 min, 10 min ladder, re-wiring each time, and gives up to `error` at 4', () => {
    const r = rig();
    r.life.start();
    const delays = [5_000, 30_000, 120_000, 600_000];
    for (const [i, d] of delays.entries()) {
      r.forks.at(-1)!.exit(1);
      expect(r.forks).toHaveLength(i + 1);
      r.clock.advance(d - 1);
      expect(r.forks).toHaveLength(i + 1);
      r.clock.advance(1);
      expect(r.forks).toHaveLength(i + 2);
      expect(r.wired()).toBe(i + 2);
      expect(r.gaveUp()).toBe(i === 3 ? 1 : 0);
    }
  });

  it('stop (unlink) kills it and never restarts', () => {
    const r = rig();
    r.life.start();
    r.life.stop();
    expect(r.forks[0]!.killed).toBe(true);
    r.clock.advance(3_600_000);
    expect(r.forks).toHaveLength(1);
    expect(r.life.running).toBe(false);
  });

  it('a new engine gets a fresh bridge and port pair without counting a failure', () => {
    const r = rig();
    r.life.start();
    r.life.rewire();
    expect(r.forks).toHaveLength(2);
    expect(r.forks[0]!.killed).toBe(true);
    r.clock.advance(3_600_000);
    expect(r.forks).toHaveLength(2);
    expect(r.gaveUp()).toBe(0);
  });

  it('passes test control lines to the running bridge', () => {
    const r = rig();
    expect(r.life.post({ kind: 'test.wa' })).toBe(false);
    r.life.start();
    expect(r.life.post({ kind: 'test.wa' })).toBe(true);
    expect(r.forks[0]!.posted).toEqual([{ kind: 'test.wa' }]);
  });
});
