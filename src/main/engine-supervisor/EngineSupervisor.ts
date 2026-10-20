// Spec: 08-1 §2.1 (utility `engine`: forked by EngineSupervisor at app ready + 300 ms, after first paint; on a crash the
// supervisor restarts it), §2.2 step 6, §2.4 (transport: `utilityProcess.fork(engine.js)` + one MessageChannelMain, 08-0 §G.6),
// 08-0 §E.6 (the engine sees the same {DATA}/{LOCAL} and test overrides as main).
// M8 (T3): 08-1 §2.1 row wa-bridge and §2.4.2: `startBridge()` forks `wa-bridge` only when a whatsapp row exists or on
// whatsapp:linkStart, posts one end of a MessageChannelMain to it and the other to the engine on `bridge.port`; restart and
// back-off run in BridgeLifecycle (src/main/whatsapp); an engine restart re-wires a fresh pair.
// M4 T4: each crash is counted in launches.json (`onCrashed`, 08-1 §4.1.3); at 3 crashes in one launch the restarted engine
// runs in safe mode (08-0 §G.14). A crash restarts the engine at most 3 times per launch.
import { app, MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { MainToEngine } from '../../engine/protocol';
import { logEvent } from '../log/techLog';
import type { EngineBridge } from './EngineBridge';
import { deps } from '../deps';
import { BridgeLifecycle, type BridgeProcess } from '../whatsapp/bridgeLifecycle';

const MAX_RESTARTS = 3;

export interface SupervisorPaths {
  data: string;
  local: string;
}

export function resourcesDir(): string {
  // electron-builder.yml packs resources/** into app.asar, which the utility process reads through Electron's asar fs.
  return join(app.getAppPath(), 'resources');
}

/** M8 T7: FOO_TEST only, every message the fake phone sent (read by e2e through `globalThis.__fooWaOutbound`). */
export const waOutboundForTest: { jid: string; keyId: string }[] = [];
if (process.env.FOO_TEST === '1') (globalThis as { __fooWaOutbound?: unknown }).__fooWaOutbound = waOutboundForTest;

export class EngineSupervisor {
  private child: UtilityProcess | null = null;
  private port: MessagePortMain | null = null;
  private restarts = 0;
  private stopping = false;
  /** Called after every (re)start once the port is wired: main sends settings and the network state. */
  onStarted: () => void = () => {};
  /** M8 (T3): the fourth bridge failure in a row (main marks the whatsapp row `error`). */
  onBridgeGaveUp: () => void = () => {};
  readonly bridgeLife: BridgeLifecycle;
  /** Called on every crash before the restart (launches.json `engineCrashes`). */
  onCrashed: () => void = () => {};

  constructor(
    private bridge: EngineBridge,
    private paths: SupervisorPaths,
  ) {
    bridge.post = (msg: MainToEngine) => this.port?.postMessage(msg);
    this.bridgeLife = new BridgeLifecycle({
      clock: deps.clock,
      fork: () => this.forkBridge(),
      wire: (child) => this.wireBridge(child as BridgeProcess & { utility: UtilityProcess }),
      onGiveUp: () => this.onBridgeGaveUp(),
    });
  }

  /** M8 (T3): 08-1 §2.1, only when a whatsapp row exists or on whatsapp:linkStart. */
  startBridge(): void {
    if (EngineSupervisor.wanted()) this.bridgeLife.start();
  }

  stopBridge(): void {
    this.bridgeLife.stop();
  }

  private forkBridge(): BridgeProcess & { utility: UtilityProcess } {
    const entry = join(__dirname, '..', '..', 'wa-bridge', 'index.js');
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.FOO_APP_VERSION = app.getVersion();
    const utility = utilityProcess.fork(entry, [], { serviceName: 'foo wa-bridge', env, stdio: 'inherit' });
    // M8 T7: a FOO_TEST run keeps what the fake phone sent, for e2e counts (AT-269: a mirror sends nothing).
    if (process.env.FOO_TEST === '1')
      utility.on('message', (m: { kind?: string; jid?: string; keyId?: string }) => {
        if (m?.kind === 'test.outbound') waOutboundForTest.push({ jid: String(m.jid), keyId: String(m.keyId) });
      });
    return {
      utility,
      kill: () => void utility.kill(),
      onExit: (fn) => void utility.on('exit', fn),
      post: (m) => utility.postMessage(m),
    };
  }

  private wireBridge(child: BridgeProcess & { utility: UtilityProcess }): void {
    const { port1, port2 } = new MessageChannelMain();
    child.utility.postMessage({ kind: 'port' }, [port2]);
    if (process.env.FOO_TEST === '1') child.post({ kind: 'test.clock', now: deps.clock.now() });
    this.port?.postMessage({ id: this.bridge.nextId(), kind: 'bridge.port', payload: {} }, [port1]);
  }

  /** 08-2 §1 rule 5 / plan §1 rule 5: a FOO_TEST run never reaches a real AI, so it runs an engine only with FOO_FAKE_AI. */
  static wanted(): boolean {
    return process.env.FOO_TEST !== '1' || Boolean(process.env.FOO_FAKE_AI);
  }

  start(): void {
    if (this.child || !EngineSupervisor.wanted()) return;
    this.stopping = false;
    const entry = join(__dirname, '..', '..', 'engine', 'index.js');
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.FOO_DATA_DIR_RESOLVED = this.paths.data;
    env.FOO_LOCAL_DIR_RESOLVED = this.paths.local;
    env.FOO_RESOURCES = resourcesDir();
    env.FOO_ELECTRON_EXEC = process.execPath;
    const child = utilityProcess.fork(entry, [], { serviceName: 'foo engine', env, stdio: 'inherit' });
    const { port1, port2 } = new MessageChannelMain();
    child.postMessage({ kind: 'port' }, [port2]);
    port1.on('message', (e) => {
      const reply = this.bridge.receive(e.data);
      if (reply) port1.postMessage(reply);
    });
    port1.start();
    child.on('exit', (code) => {
      this.bridge.live = false;
      this.bridge.failPending();
      this.port = null;
      this.child = null;
      if (this.stopping) return;
      logEvent({ lvl: 'error', mod: 'engine', evt: 'ENGINE_EXITED', kind: String(code) });
      this.onCrashed();
      if (this.restarts < MAX_RESTARTS) {
        this.restarts += 1;
        this.start();
      }
    });
    this.child = child;
    this.port = port1;
    this.bridge.live = true;
    this.onStarted();
    // M8 (T3): a new engine needs a fresh bridge port (08-1 §2.4.2).
    this.bridgeLife.rewire();
  }

  stop(): void {
    this.stopping = true;
    this.bridgeLife.stop();
    this.child?.kill();
  }
}
