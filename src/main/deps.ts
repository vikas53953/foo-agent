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

/** Called once at startup in FOO_TEST runs, before any window opens. */
export function installTestDeps(): FakeClock {
  const clock = new FakeClock(TEST_EPOCH_MS);
  deps.clock = clock;
  deps.net = { online: true };
  return clock;
}
