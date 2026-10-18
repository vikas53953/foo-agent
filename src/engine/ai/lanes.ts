// Spec: 08-2 §6.9 (lanes and AI concurrency: job 3, chat 1 per chat and 2 total, background 1 that never starts while
// 3 jobs are WORKING; total CLI children ≤ 4, extra calls wait in FIFO, no error).

export type Release = () => void;

interface Waiter<T> {
  key: T;
  resolve: (r: Release) => void;
  reject: (e: unknown) => void;
  cleanup?: () => void;
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/** A FIFO gate: waiters are started in arrival order whenever `canStart` lets them. */
class FifoGate<T> {
  private queue: Waiter<T>[] = [];

  constructor(
    private readonly canStart: (key: T) => boolean,
    private readonly onStart: (key: T) => void,
    private readonly onEnd: (key: T) => void,
  ) {}

  acquire(key: T, signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<Release>((resolve, reject) => {
      const w: Waiter<T> = { key, resolve, reject };
      if (signal) {
        const onAbort = (): void => {
          const i = this.queue.indexOf(w);
          if (i >= 0) {
            this.queue.splice(i, 1);
            reject(abortError());
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        w.cleanup = () => signal.removeEventListener('abort', onAbort);
      }
      this.queue.push(w);
      this.pump();
    });
  }

  get waiting(): number {
    return this.queue.length;
  }

  pump(): void {
    for (let i = 0; i < this.queue.length;) {
      const w = this.queue[i]!;
      if (!this.canStart(w.key)) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      w.cleanup?.();
      this.onStart(w.key);
      let done = false;
      w.resolve(() => {
        if (done) return;
        done = true;
        this.onEnd(w.key);
        this.pump();
      });
    }
  }
}

/** Total CLI children ≤ 4 (08-2 §6.9). Strict FIFO. */
export class CliLimiter {
  private running = 0;
  private readonly gate: FifoGate<null>;

  constructor(readonly max = 4) {
    // Strict FIFO: only the head may start, so a later caller never overtakes an earlier one.
    this.gate = new FifoGate<null>(
      () => this.running < this.max,
      () => this.running++,
      () => this.running--,
    );
  }

  acquire(signal?: AbortSignal): Promise<Release> {
    return this.gate.acquire(null, signal);
  }

  get active(): number {
    return this.running;
  }

  get waiting(): number {
    return this.gate.waiting;
  }
}

export type Lane = 'job' | 'chat' | 'background';
export interface LaneKey {
  lane: Lane;
  /** Required for the chat lane (1 per chat). */
  chatId?: string;
}

export const LANE_LIMITS = { job: 3, chatTotal: 2, chatPerChat: 1, background: 1, workingJobsBlockBackground: 3 } as const;

/** The three lanes of 08-2 §6.9. `setWorkingJobs` tells the background lane when to yield. */
export class LaneLimiter {
  private job = 0;
  private chat = 0;
  private perChat = new Map<string, number>();
  private background = 0;
  private workingJobs = 0;
  private readonly gate: FifoGate<LaneKey>;

  constructor() {
    this.gate = new FifoGate<LaneKey>(
      (k) => this.canStart(k),
      (k) => this.add(k, 1),
      (k) => this.add(k, -1),
    );
  }

  acquire(key: LaneKey, signal?: AbortSignal): Promise<Release> {
    return this.gate.acquire(key, signal);
  }

  /** Number of jobs in WORKING; the background lane never starts while it is ≥ 3. */
  setWorkingJobs(n: number): void {
    this.workingJobs = n;
    this.gate.pump();
  }

  get counts(): { job: number; chat: number; background: number; waiting: number } {
    return { job: this.job, chat: this.chat, background: this.background, waiting: this.gate.waiting };
  }

  private canStart(k: LaneKey): boolean {
    switch (k.lane) {
      case 'job':
        return this.job < LANE_LIMITS.job;
      case 'chat': {
        const c = this.perChat.get(k.chatId ?? '') ?? 0;
        return this.chat < LANE_LIMITS.chatTotal && c < LANE_LIMITS.chatPerChat;
      }
      case 'background':
        return this.background < LANE_LIMITS.background && this.workingJobs < LANE_LIMITS.workingJobsBlockBackground;
    }
  }

  private add(k: LaneKey, d: number): void {
    if (k.lane === 'job') this.job += d;
    else if (k.lane === 'background') this.background += d;
    else {
      this.chat += d;
      const id = k.chatId ?? '';
      const n = (this.perChat.get(id) ?? 0) + d;
      if (n <= 0) this.perChat.delete(id);
      else this.perChat.set(id, n);
    }
  }
}
