// Spec: 08-1 §2.1 (utility process `engine`), §2.4 (one MessagePort from main: `{ id, kind, payload }`, requests answered
// `{ re, result }`, every payload zod-validated on receipt), 08-2 §30.8 (on engine start every `sys-*.md` in the scratch
// folders is deleted), 08-3 §22 (FOO_TEST: fake clock that follows main's; FOO_FAKE_AI). The engine's logic is Engine.ts;
// this file only connects it to the port Electron hands over.
import { FakeClock, systemClock, TEST_EPOCH_MS } from '../shared/clock';
import { Engine } from './Engine';
import { mainToEngineSchema, type MainLink } from './protocol';
import type { Result } from '../shared/errors';

interface PortLike {
  postMessage(msg: unknown): void;
  on(event: 'message', fn: (e: { data: unknown; ports?: PortLike[] }) => void): void;
  start(): void;
}
interface ParentPort {
  on(event: 'message', fn: (e: { data: unknown; ports: PortLike[] }) => void): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
const testRun = process.env.FOO_TEST === '1';
const clock = testRun ? new FakeClock(TEST_EPOCH_MS) : systemClock;

function connect(port: PortLike): void {
  let seq = 0;
  const waiters = new Map<string, (r: Result<unknown>) => void>();
  const link: MainLink = {
    request<T>(kind: 'db.tx' | 'db.query' | 'file.write', payload: unknown): Promise<Result<T>> {
      seq += 1;
      const id = `e${seq}`;
      return new Promise((resolve) => {
        waiters.set(id, (r) => resolve(r as Result<T>));
        port.postMessage({ id, kind, payload });
      });
    },
    send(kind, payload) {
      seq += 1;
      port.postMessage({ id: `e${seq}`, kind, payload });
    },
  };
  const engine = Engine.create({
    link,
    clock,
    env: process.env,
    dataDir: process.env.FOO_DATA_DIR_RESOLVED ?? '',
    localDir: process.env.FOO_LOCAL_DIR_RESOLVED ?? '',
    resourcesDir: process.env.FOO_RESOURCES ?? '',
    execPath: process.env.FOO_ELECTRON_EXEC ?? process.execPath,
    testRun,
  });
  port.on('message', (e) => {
    const raw = e.data as { re?: string; id?: string } | null;
    if (raw && typeof raw === 'object' && typeof raw.re === 'string') {
      const r = raw as { re: string; result: Result<unknown> };
      waiters.get(r.re)?.(r.result);
      waiters.delete(r.re);
      return;
    }
    const parsed = mainToEngineSchema.safeParse(raw);
    if (!parsed.success) {
      if (raw?.id) port.postMessage({ re: raw.id, result: { ok: false, error: { kind: 'IPC_REJECTED' } } });
      return;
    }
    const msg = parsed.data;
    // M8 (T3): the wa-bridge port arrives as a transferred port on `bridge.port` (08-1 §2.4.2).
    if (msg.kind === 'bridge.port') {
      const bridgePort = e.ports?.[0];
      if (bridgePort) engine.attachBridge(bridgePort);
      return;
    }
    if (msg.kind === 'test.clock') {
      if (clock instanceof FakeClock) clock.set(msg.payload.now);
      return;
    }
    void engine.handle(msg).then((result) => {
      if (result !== undefined) port.postMessage({ re: msg.id, result });
    });
  });
  port.start();
}

parentPort?.on('message', (e) => {
  const port = e.ports[0];
  if (port) connect(port);
});
