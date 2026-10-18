// Spec: 08-3 §22.2 (injected dependencies: Clock, Net; Power, IdGen, Hello, Vault and Notifier arrive with their milestones).
// Production uses the system clock and real network state; FOO_TEST runs swap in the fake clock at X-10 (Fri 16 Oct 2026,
// 9:00 AM IST) and a network flag that test:setOnline flips.
import { FakeClock, systemClock, TEST_EPOCH_MS, type Clock } from '../shared/clock';
import type { Notifier } from './notify/types';

export interface Net {
  online: boolean;
}

export interface Deps {
  clock: Clock;
  net: Net;
  /** M11 (CR-0015 G-M11-16): FOO_TEST runs set the recording Notifier (src/main/test); otherwise T3's Windows Notifier. */
  notifier?: Notifier;
}

export const deps: Deps = { clock: systemClock, net: { online: true } };

/** Called once at startup in FOO_TEST runs, before any window opens. */
export function installTestDeps(): FakeClock {
  const clock = new FakeClock(TEST_EPOCH_MS);
  deps.clock = clock;
  deps.net = { online: true };
  return clock;
}
