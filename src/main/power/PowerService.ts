// Spec: 09 §9.22 (powerSaveBlocker('prevent-app-suspension') only while a job is WORKING, never for routines or idle
// waiting; sleep → jobs WAITING asleep; resume → re-test the AI, then resume; sign-out / shutdown → save every job's state at
// once, never block or delay shutdown, no shutdown reason), 08-1 §2.3 steps 4–5 (quit: engine `jobs.pauseAll` app_quit
// acked, then `clean: true` in launches.json, then exit; Windows shutdown: `power { event: 'shutdown' }`, G-M4-04), §2.4
// (`power.keepAwake { on, jobCount }` from the engine). Electron is injected so unit tests drive it without an app.
export interface PowerBlocker {
  start(type: 'prevent-app-suspension'): number;
  stop(id: number): void;
}

export type PowerEvent = 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen' | 'on-ac' | 'on-battery' | 'shutdown';

export interface PowerMonitorLike {
  on(event: PowerEvent, fn: () => void): void;
}

export interface PowerDeps {
  blocker: PowerBlocker;
  /** Fire-and-forget to the engine (EngineBridge.send). */
  send(kind: 'power', payload: { event: 'suspend' | 'resume' | 'lock' | 'unlock' | 'on-ac' | 'on-battery' | 'shutdown' }): void;
  /** The engine's `jobs.pauseAll` request; resolves on the ack, rejects when the engine refused or is gone. */
  pauseAll(reason: 'app_quit'): Promise<unknown>;
  markClean(): void;
  /** How long a quit waits for the engine's ack before it exits anyway (the jobs then recover as an unclean exit). */
  quitAckMs?: number;
}

const ENGINE_EVENT = {
  suspend: 'suspend',
  resume: 'resume',
  'lock-screen': 'lock',
  'unlock-screen': 'unlock',
  'on-ac': 'on-ac',
  'on-battery': 'on-battery',
  shutdown: 'shutdown',
} as const;

export class PowerService {
  private blockerId: number | null = null;
  private quitting: Promise<void> | null = null;
  jobCount = 0;

  constructor(private d: PowerDeps) {}

  /** The engine's `power.keepAwake`: hold the blocker while at least one job is WORKING. */
  keepAwake(on: boolean, jobCount: number): void {
    this.jobCount = on ? jobCount : 0;
    if (on && this.blockerId === null) this.blockerId = this.d.blocker.start('prevent-app-suspension');
    else if (!on && this.blockerId !== null) {
      this.d.blocker.stop(this.blockerId);
      this.blockerId = null;
    }
  }

  get keepingAwake(): boolean {
    return this.blockerId !== null;
  }

  /** Forwards every power event to the engine; Windows sign-out / shutdown goes as `shutdown` and is never delayed. */
  attach(monitor: PowerMonitorLike): void {
    for (const ev of Object.keys(ENGINE_EVENT) as PowerEvent[]) monitor.on(ev, () => this.d.send('power', { event: ENGINE_EVENT[ev] }));
  }

  /** Windows `query-session-end` on the main window: the same as powerMonitor `shutdown` (09 §9.22). */
  sessionEnding(): void {
    this.d.send('power', { event: 'shutdown' });
  }

  /** §2.3 step 4: pause every WORKING job (bounded wait for the ack), then mark the launch clean. Repeat calls share one run. */
  beforeQuit(): Promise<void> {
    this.quitting ??= (async () => {
      const ms = this.d.quitAckMs ?? 3_000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const acked = await Promise.race([
        this.d.pauseAll('app_quit').then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((r) => (timer = setTimeout(() => r(false), ms))),
      ]);
      if (timer) clearTimeout(timer);
      this.keepAwake(false, 0);
      // An engine that never acked left its jobs as they were: the record stays unclean and the next launch recovers them.
      if (acked) this.d.markClean();
    })();
    return this.quitting;
  }
}
