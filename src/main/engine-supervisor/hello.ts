// Spec: 08-1 §2.4 (on every engine (re)start main sends the settings and the network state), 08-3 §22 (FOO_TEST: the
// engine's fake clock follows main's through `test.clock`). A `test:clock` set while the engine is not live is dropped by
// EngineBridge.send, so in a test run the hello sends main's clock first, before anything that could stamp a time. M4 T4
// (G-M4-13): the first settings.changed also carries main's launches.json decision (08-2 §5.9 step 1).
import type { Clock } from '../../shared/clock';
import type { Settings } from '../../shared/settings';
import type { EngineBridge } from './EngineBridge';
import type { EngineLaunch } from '../store/launches';

export interface HelloSources {
  settings: () => Settings;
  online: () => boolean;
  /** Main's fake clock in a FOO_TEST run; null otherwise. */
  testClock: Clock | null;
  /** G-M4-13: safe mode and a clean previous exit, decided by main from launches.json for this engine start. */
  launch?: () => EngineLaunch;
}

/** What main sends right after the supervisor wires a (re)started engine. */
export function engineHello(send: EngineBridge['send'], src: HelloSources): void {
  if (src.testClock) send('test.clock', { now: src.testClock.now() });
  send('settings.changed', { paths: [], settings: src.settings(), ...(src.launch ? { launch: src.launch() } : {}) });
  send('net', { online: src.online() });
}
