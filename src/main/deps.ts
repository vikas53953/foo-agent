// Spec: 08-3 §22.2 (injected dependencies: Clock, Net; Power, IdGen, Hello, Vault and Notifier arrive with their milestones).
// Production uses the system clock and real network state; FOO_TEST runs swap in the fake clock at X-10 (Fri 16 Oct 2026,
// 9:00 AM IST) and a network flag that test:setOnline flips.
import { FakeClock, systemClock, TEST_EPOCH_MS, type Clock } from '../shared/clock';

export interface Net {
  online: boolean;
}

export interface Deps {
  clock: Clock;
  net: Net;
}

export const deps: Deps = { clock: systemClock, net: { online: true } };

/**
 * Called once at startup in FOO_TEST runs, before any window opens. `FOO_TEST_NOW` (an ISO time) starts the fake clock
 * elsewhere than X-10's epoch, for tests that need the window's own clock at a given hour from its first paint.
 */
export function installTestDeps(): FakeClock {
  const at = Date.parse(process.env.FOO_TEST_NOW ?? '');
  const clock = new FakeClock(Number.isNaN(at) ? TEST_EPOCH_MS : at);
  deps.clock = clock;
  deps.net = { online: true };
  return clock;
}
