// Spec: 03-shell-1 §3.3.2 type 1 (offline banner after no internet for ≥ 10 s, J19.1), 08-3 §21.2 NET_OFFLINE
// (`net.isOnline()` false), 08-3 §22.2 (Net and Clock injected: test runs flip `deps.net.online` through test:setOnline).
// No electron import: the probe is passed in, so the monitor is unit-tested with the fake clock.
import type { Clock, TimerId } from '../../shared/clock';

export const OFFLINE_CONFIRM_MS = 10_000;
export const POLL_MS = 5_000;

export class NetMonitor {
  private raw = true;
  private confirmed = false;
  private timer: TimerId | null = null;
  private poller: TimerId | null = null;
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(private readonly clock: Clock) {}

  /** True once the network has been down for OFFLINE_CONFIRM_MS (what the banner and AiStatus use). */
  get offline(): boolean {
    return this.confirmed;
  }

  get rawOnline(): boolean {
    return this.raw;
  }

  onChange(fn: (online: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Reports the current raw state. Going offline is confirmed after 10 s; coming back is immediate. */
  report(online: boolean): void {
    if (online === this.raw) return;
    this.raw = online;
    if (online) {
      if (this.timer !== null) this.clock.clearTimeout(this.timer);
      this.timer = null;
      if (this.confirmed) {
        this.confirmed = false;
        this.listeners.forEach((fn) => fn(true));
      }
      return;
    }
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (this.raw) return;
      this.confirmed = true;
      this.listeners.forEach((fn) => fn(false));
    }, OFFLINE_CONFIRM_MS);
  }

  /** Production: polls the probe every 5 s on the injected clock. */
  poll(probe: () => boolean): void {
    const tick = () => {
      this.report(probe());
      this.poller = this.clock.setTimeout(tick, POLL_MS);
    };
    tick();
  }

  stop(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    if (this.poller !== null) this.clock.clearTimeout(this.poller);
    this.timer = null;
    this.poller = null;
  }
}
