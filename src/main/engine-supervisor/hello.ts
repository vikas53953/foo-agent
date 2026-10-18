// Spec: 08-1 §2.4 (on every engine (re)start main sends the settings and the network state), 08-3 §22 (FOO_TEST: the
// engine's fake clock follows main's through `test.clock`). A `test:clock` set while the engine is not live is dropped by
// EngineBridge.send, so in a test run the hello sends main's clock first, before anything that could stamp a time.
import type { Clock } from '../../shared/clock';
import type { Settings } from '../../shared/settings';
import type { EngineBridge } from './EngineBridge';

export interface HelloSources {
  settings: () => Settings;
  online: () => boolean;
  /** Main's fake clock in a FOO_TEST run; null otherwise. */
  testClock: Clock | null;
}

/** What main sends right after the supervisor wires a (re)started engine. */
export function engineHello(send: EngineBridge['send'], src: HelloSources): void {
  if (src.testClock) send('test.clock', { now: src.testClock.now() });
  send('settings.changed', { paths: [], settings: src.settings() });
  send('net', { online: src.online() });
}
