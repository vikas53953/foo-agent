// Spec: 08-1 §2.1 (the engine is forked at first paint + 300 ms), §2.2 step 7 (the wa-bridge at +20 s), §2.3 step 5 (on quit
// main stops the engine, then closes the database). Windows CI on PR #159: a quit that landed before the +300 ms timer closed
// the database first; the timer then started an engine whose onStarted read the closed database, and Electron's "A JavaScript
// error occurred in the main process" dialog held foo open. Once stopped for the quit, the supervisor starts nothing again.
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const forks: string[] = [];

class FakeChild extends EventEmitter {
  postMessage(): void {}
  kill(): void {
    this.emit('exit', 0);
  }
}

class FakePort extends EventEmitter {
  postMessage(): void {}
  start(): void {}
  close(): void {}
}

vi.mock('electron', () => ({
  app: { getAppPath: () => '/app', getVersion: () => '0.0.1' },
  MessageChannelMain: class {
    port1 = new FakePort();
    port2 = new FakePort();
  },
  utilityProcess: {
    fork: (entry: string) => {
      forks.push(entry);
      return new FakeChild();
    },
  },
}));

const { EngineSupervisor } = await import('../../src/main/engine-supervisor/EngineSupervisor');
type Bridge = ConstructorParameters<typeof EngineSupervisor>[0];

function supervisor() {
  const receive = vi.fn(() => null);
  const bridge = { live: false, failPending: () => undefined, receive, nextId: () => 1 } as unknown as Bridge;
  const s = new EngineSupervisor(bridge, { data: '/data', local: '/local' });
  const started = vi.fn();
  s.onStarted = started;
  return { s, started, receive };
}

describe('the engine supervisor after the quit has stopped it', () => {
  beforeEach(() => {
    forks.length = 0;
    vi.stubEnv('FOO_TEST', '');
  });

  it('a start timer that fires after stop() forks no engine and runs nothing that reads the database', () => {
    const { s, started } = supervisor();
    s.stop();
    s.start();
    expect(forks).toEqual([]);
    expect(started).not.toHaveBeenCalled();
  });

  it('a running engine stopped for the quit is not restarted, then or by a late start', () => {
    const { s, started } = supervisor();
    s.start();
    expect(forks).toHaveLength(1);
    expect(started).toHaveBeenCalledTimes(1);
    s.stop();
    s.start();
    expect(forks).toHaveLength(1);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('the +20 s wa-bridge timer after stop() forks no bridge', () => {
    const { s } = supervisor();
    s.stop();
    s.startBridge();
    expect(forks).toEqual([]);
  });

  it('an engine message still queued when the quit stopped it is not applied (its db.tx would hit the closed database)', () => {
    const { s, receive } = supervisor();
    s.start();
    const port = (s as unknown as { port: FakePort }).port;
    port.emit('message', { data: { id: 1, kind: 'db.query', payload: {} } });
    expect(receive).toHaveBeenCalledTimes(1);
    s.stop();
    port.emit('message', { data: { id: 2, kind: 'db.tx', payload: {} } });
    expect(receive).toHaveBeenCalledTimes(1);
  });

  it('a crash before any quit still restarts the engine (08-1 §2.1)', () => {
    const { s, started } = supervisor();
    s.start();
    const child = (s as unknown as { child: FakeChild }).child;
    child.emit('exit', 1);
    expect(forks).toHaveLength(2);
    expect(started).toHaveBeenCalledTimes(2);
  });
});
