// Spec: 08-1 §2.1 row wa-bridge (utility process forked by main's EngineSupervisor), §2.4.2 (main posts one end of a
// MessageChannelMain here and the other to the engine; engine and bridge then talk directly, every message zod-checked on
// receipt), 08-3 §16.4.1 (Baileys config), §22 (FOO_TEST: a fake phone instead of Baileys, driven from main's test channel,
// on the fake clock that follows main's). This file only connects BridgeCore to the port Electron hands over.
import { FakeClock, systemClock, TEST_EPOCH_MS } from '../shared/clock';
import { bridgeTestSchema, engineToBridgeSchema } from '../shared/waBridge';
import { baileysSocket } from './baileys';
import { BridgeCore } from './core';
import { FakePhone } from './fakeSocket';

interface PortLike {
  postMessage(msg: unknown): void;
  on(event: 'message', fn: (e: { data: unknown }) => void): void;
  start(): void;
}
interface ParentPort {
  on(event: 'message', fn: (e: { data: unknown; ports: PortLike[] }) => void): void;
  postMessage(msg: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
const testRun = process.env.FOO_TEST === '1';
const clock = testRun ? new FakeClock(TEST_EPOCH_MS) : systemClock;
// M8 T7: a test run tells main what the fake phone sent (`test.outbound`), so an e2e can count it.
const phone = testRun ? new FakePhone(clock, (m) => parentPort?.postMessage({ kind: 'test.outbound', ...m })) : null;
let core: BridgeCore | null = null;

function connect(port: PortLike): void {
  core = new BridgeCore({
    clock,
    send: (m) => port.postMessage(m),
    socket: phone ? phone.factory : baileysSocket(process.env.FOO_APP_VERSION ?? '0.0.0'),
  });
  const c = core;
  port.on('message', (e) => {
    const parsed = engineToBridgeSchema.safeParse(e.data);
    if (!parsed.success) return;
    void c.handle(parsed.data).catch(() => undefined);
  });
  port.start();
}

parentPort?.on('message', (e) => {
  const raw = e.data as { kind?: string; now?: number; op?: unknown } | null;
  if (raw?.kind === 'port' && e.ports[0]) connect(e.ports[0]);
  if (!testRun || !raw) return;
  if (raw.kind === 'test.clock' && typeof raw.now === 'number' && clock instanceof FakeClock) clock.set(raw.now);
  if (raw.kind === 'test.wa') {
    const op = bridgeTestSchema.safeParse(raw.op);
    if (op.success) phone?.act(op.data);
  }
});
