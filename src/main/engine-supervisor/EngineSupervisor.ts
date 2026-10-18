// Spec: 08-1 §2.1 (utility `engine`: forked by EngineSupervisor at app ready + 300 ms, after first paint; on a crash the
// supervisor restarts it), §2.2 step 6, §2.4 (transport: `utilityProcess.fork(engine.js)` + one MessageChannelMain, 08-0 §G.6),
// 08-0 §E.6 (the engine sees the same {DATA}/{LOCAL} and test overrides as main).
// Deferred: `engineCrashes` in launches.json and safe mode at 3 crashes (08-0 §G.14) arrive with launches.json (M11); until
// then a crash restarts the engine at most 3 times per launch (implementation-notes "M3").
import { app, MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { MainToEngine } from '../../engine/protocol';
import type { EngineBridge } from './EngineBridge';

const MAX_RESTARTS = 3;

export interface SupervisorPaths {
  data: string;
  local: string;
}

export function resourcesDir(): string {
  // electron-builder.yml packs resources/** into app.asar, which the utility process reads through Electron's asar fs.
  return join(app.getAppPath(), 'resources');
}

export class EngineSupervisor {
  private child: UtilityProcess | null = null;
  private port: MessagePortMain | null = null;
  private restarts = 0;
  private stopping = false;
  /** Called after every (re)start once the port is wired: main sends settings and the network state. */
  onStarted: () => void = () => {};

  constructor(
    private bridge: EngineBridge,
    private paths: SupervisorPaths,
  ) {
    bridge.post = (msg: MainToEngine) => this.port?.postMessage(msg);
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
      console.error(`engine exited (${code})`);
      if (this.restarts < MAX_RESTARTS) {
        this.restarts += 1;
        this.start();
      }
    });
    this.child = child;
    this.port = port1;
    this.bridge.live = true;
    this.onStarted();
  }

  stop(): void {
    this.stopping = true;
    this.child?.kill();
  }
}
