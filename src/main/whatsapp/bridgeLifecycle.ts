// Spec: 08-1 §2.1 row wa-bridge (forked by main only when a whatsapp row exists or on whatsapp:linkStart; on a crash main's
// supervisor restarts it with back-off 5 s, 30 s, 2 min, 10 min and re-wires the port; after 4 failures the connection
// status is `error`), §2.4.2 (after a restart main re-sends `bridge.port` with a fresh port pair), 08-3 §16.4 (Unlink ends
// it). Electron-free: EngineSupervisor passes the real utilityProcess fork and port wiring.
import type { Clock, TimerId } from '../../shared/clock';

export const BRIDGE_BACKOFF_MS = [5_000, 30_000, 120_000, 600_000] as const;
const GIVE_UP_AT = 4;

export interface BridgeProcess {
  kill(): void;
  onExit(fn: (code: number | null) => void): void;
  post(msg: unknown): void;
}

export class BridgeLifecycle {
  private child: BridgeProcess | null = null;
  private failures = 0;
  private timer: TimerId | null = null;

  constructor(
    private o: {
      clock: Clock;
      fork(): BridgeProcess;
      /** A fresh MessageChannelMain: one end to the bridge, the other to the engine on `bridge.port`. */
      wire(child: BridgeProcess): void;
      /** The fourth failure in a row: main marks the whatsapp row `error`. */
      onGiveUp(): void;
    },
  ) {}

  get running(): boolean {
    return this.child !== null;
  }

  start(): void {
    if (this.child) return;
    this.cancelRestart();
    const child = this.o.fork();
    this.child = child;
    child.onExit(() => {
      if (this.child !== child) return;
      this.child = null;
      this.failures += 1;
      if (this.failures === GIVE_UP_AT) this.o.onGiveUp();
      const delay = BRIDGE_BACKOFF_MS[Math.min(this.failures, BRIDGE_BACKOFF_MS.length) - 1]!;
      this.timer = this.o.clock.setTimeout(() => {
        this.timer = null;
        this.start();
      }, delay);
    });
    this.o.wire(child);
  }

  /** Unlink or quit: no restart. */
  stop(): void {
    this.cancelRestart();
    this.failures = 0;
    const child = this.child;
    this.child = null;
    child?.kill();
  }

  /** The engine (re)started: its old bridge port is gone, so the bridge starts again on a fresh pair. */
  rewire(): void {
    if (!this.child) return;
    const failures = this.failures;
    this.stop();
    this.failures = failures;
    this.start();
  }

  /** FOO_TEST control lines (the fake phone, the clock). False when no bridge runs. */
  post(msg: unknown): boolean {
    if (!this.child) return false;
    this.child.post(msg);
    return true;
  }

  private cancelRestart(): void {
    if (this.timer !== null) this.o.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
