// Spec: 08-2 §8.3.2 (one browser process; each job gets its own window, max 3; browser jobs wait for a free window), 08-4 §26.8
// items 3–5 (a queued browser job starts only when fewer than 3 job windows are open, FIFO; while its first browser call waits
// no AI turn is spent and its row shows `cards.checklist.caption.queued`, which the runner renders from `isQueued`; windows close
// on every terminal state and after 2 h in NEEDS_YOU, both called by the runner through `BrowserHandle.closeWindow`).

export const MAX_JOB_WINDOWS = 3;

interface Waiter {
  jobId: string;
  resolve(): void;
}

/** Window slots for jobs. The browser driver holds one per open job window; nothing here touches a real window. */
export class WindowPool {
  private readonly holders = new Set<string>();
  private readonly queue: Waiter[] = [];

  constructor(private readonly max = MAX_JOB_WINDOWS) {}

  get open(): number {
    return this.holders.size;
  }

  holds(jobId: string): boolean {
    return this.holders.has(jobId);
  }

  isQueued(jobId: string): boolean {
    return this.queue.some((w) => w.jobId === jobId);
  }

  /** Resolves once the job holds a window slot (at once when it already holds one). Rejects when `signal` aborts first. */
  acquire(jobId: string, signal?: AbortSignal): Promise<void> {
    if (this.holders.has(jobId)) return Promise.resolve();
    if (this.holders.size < this.max && this.queue.length === 0) {
      this.holders.add(jobId);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const w: Waiter = { jobId, resolve };
      this.queue.push(w);
      signal?.addEventListener(
        'abort',
        () => {
          const i = this.queue.indexOf(w);
          if (i >= 0) this.queue.splice(i, 1);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  }

  release(jobId: string): void {
    if (!this.holders.delete(jobId)) return;
    while (this.holders.size < this.max && this.queue.length) {
      const next = this.queue.shift();
      if (!next) break;
      this.holders.add(next.jobId);
      next.resolve();
    }
  }
}
