// Spec: 08-4 §26.8 item 6 (WAITING with waiting_reason 'opens_at' sleeps until jobs.wake_at; the 15 s runner tick moves it to
// WORKING at wake_at; no stuck timer and no AI turn while waiting), 08-0 §B.2 / 08-1 jobs.wake_at (set only with opens_at),
// 07-2 §4 (working → waiting with waiting_reason; waiting → working on resume), 12-1 §25 step 3 (the first producer: a job
// whose start is a future opening time sleeps once Go is tapped), 05-3 §5.12.2 ("No answer 24 h": the Plan card becomes
// `withdrawn` with "I didn't start {title} because I didn't hear back." + Start again; resolved_by 'auto'), 08-4 §26.8 item 3
// (3 WORKING max, FIFO). M5 T10, CR-0008 (j) rows 4 and 8.
// Not here yet: the "quit past wake_at → FAILED" rule of §26.8 item 6 posts `thread.trains.tatkal_missed`, which arrives with
// the trains journey (M9); until then a job that slept past its time wakes on the first tick.
import type { CardRow, JobRow } from '../../shared/types';
import type { RunnerCore } from './JobRunner';
import { MAX_WORKING } from './queue';

/** 08-4 §26.8 item 6. */
export const TICK_MS = 15_000;
/** 05-3 §5.12.2 "No answer 24 h". */
export const PLAN_WAIT_MS = 24 * 3_600_000;

export class RunnerTick {
  private timer: ReturnType<RunnerCore['d']['clock']['setTimeout']> | null = null;
  private stopped = false;

  constructor(private core: RunnerCore) {}

  /** Arms the 15 s tick (idempotent). */
  start(): void {
    if (this.timer !== null || this.stopped) return;
    this.timer = this.core.d.clock.setTimeout(() => {
      this.timer = null;
      void this.core.track(this.run()).finally(() => this.start());
    }, TICK_MS);
  }

  /** One pass: wake opens_at jobs that are due, withdraw Plan cards unanswered for 24 h. */
  async run(): Promise<void> {
    await this.wakeDue();
    await this.withdrawStalePlans();
  }

  /** WORKING → WAITING(opens_at) for a job whose start is still in the future (the loop calls it before any AI turn). */
  async sleep(job: JobRow): Promise<boolean> {
    const r = await this.core.tx([
      { op: 'transition', table: 'jobs', id: job.id, from: ['working'], to: 'waiting', set: { waiting_reason: 'opens_at' } },
      ...this.core.badgeOps(job, 'waiting'),
      ...(await this.core.editChecklistOps(job)),
    ]);
    if (!r.ok) return false;
    await this.core.writeMirrors(job.id);
    return true;
  }

  private async wakeDue(): Promise<void> {
    const now = this.core.d.clock.now();
    const live = (await this.core.query<JobRow[]>('jobsByState', ['working', 'waiting'])) ?? [];
    const due = live
      .filter((j) => j.state === 'waiting' && j.waitingReason === 'opens_at' && j.wakeAt !== null && j.wakeAt <= now)
      .sort((a, b) => (a.wakeAt ?? 0) - (b.wakeAt ?? 0) || a.createdAt - b.createdAt);
    let free = MAX_WORKING - live.filter((j) => j.state === 'working').length;
    for (const job of due) {
      if (free <= 0) return; // the next tick tries again
      const r = await this.core.tx([
        {
          op: 'transition',
          table: 'jobs',
          id: job.id,
          from: ['waiting'],
          to: 'working',
          set: { waiting_reason: null, wake_at: null, last_progress_at: now },
        },
        ...this.core.badgeOps(job, 'working'),
        ...(await this.core.editChecklistOps(job)),
      ]);
      if (!r.ok) continue;
      free -= 1;
      this.core.launch(job.id);
    }
  }

  private async withdrawStalePlans(): Promise<void> {
    const now = this.core.d.clock.now();
    const queued = (await this.core.query<JobRow[]>('jobsByState', ['queued'])) ?? [];
    const chats = new Set(queued.map((j) => j.chatId));
    for (const chatId of chats) {
      const plans = (await this.core.query<CardRow[]>('cards.openForChat', chatId, 'plan')) ?? [];
      for (const card of plans) {
        const job = queued.find((j) => j.id === card.jobId);
        if (!job || card.state !== 'pending' || now - card.createdAt < PLAN_WAIT_MS) continue;
        await this.core.tx([
          { op: 'update', table: 'cards', id: card.id, set: { state: 'withdrawn', resolved_by: 'auto', resolved_at: now } },
          {
            op: 'transition',
            table: 'jobs',
            id: job.id,
            from: ['queued'],
            to: 'cancelled',
            set: { stop_reason: 'system', finished_at: now },
          },
          ...this.core.badgeOps(job, 'cancelled'),
        ]);
      }
    }
  }

  dispose(): void {
    this.stopped = true;
    if (this.timer !== null) this.core.d.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
