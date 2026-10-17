// Spec: 08-3 §22.2 (injected Clock: now and timers; the fake clock drives expiry, routines, quiet hours, catch-up),
// X-10 (tests start at Fri 16 Oct 2026, 9:00 AM IST). Code that needs the time reads it from a Clock, never from Date.now().
export type TimerId = number;

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
}

/** X-10: Fri 16 Oct 2026, 9:00 AM IST (UTC+5:30) = 03:30 UTC. */
export const TEST_EPOCH_MS = Date.UTC(2026, 9, 16, 3, 30, 0);

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as TimerId,
  clearTimeout: (id) => globalThis.clearTimeout(id as unknown as ReturnType<typeof globalThis.setTimeout>),
};

interface Pending {
  id: TimerId;
  at: number;
  fn: () => void;
}

/** A clock that moves only when told to; timers fire in due order during advance()/set(). */
export class FakeClock implements Clock {
  private t: number;
  private nextId = 1;
  private timers: Pending[] = [];

  constructor(start: number = TEST_EPOCH_MS) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): TimerId {
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(id: TimerId): void {
    this.timers = this.timers.filter((p) => p.id !== id);
  }

  /** Moves forward by `ms`, firing every timer that falls due, in order. */
  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError('advance needs a finite, non-negative number of ms');
    this.runUntil(this.t + ms);
  }

  /** Jumps to `at`. Forward jumps fire due timers; a backward jump fires nothing. */
  set(at: number): void {
    if (!Number.isFinite(at)) throw new RangeError('set needs a finite time');
    if (at >= this.t) this.runUntil(at);
    else this.t = at;
  }

  /** Drops every timer and returns to `start`. */
  reset(start: number = TEST_EPOCH_MS): void {
    this.timers = [];
    this.t = start;
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  private runUntil(end: number): void {
    for (;;) {
      const due = this.timers.filter((p) => p.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((p) => p !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}
