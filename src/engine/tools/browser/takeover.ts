// Spec: 06-3 §11.2 Take over (foo pauses all clicks and AI calls for this job; the real Edge window comes to the front with
// the take-over banner; checklist "✋ You took over"), Hand back (X-135: one meaning, foo re-reads the page and carries on,
// chat line "Carrying on from here."), 08-2 §8.3.3 (no capture while the user is in control), §8.3.6 (the mask stylesheet is
// removed on take-over and put back on hand back), 09 §9.27.3 (closing Edge during take-over = Stop with the J18 stop report,
// no confirm), 08-1 §3.2 `job:takeOver { on: true }` / `job:handBack { jobId }`, §3.3 `live:state` (`taken_over`, `running`),
// 10-1 AT-058 (no foo click until Hand back), AT-078 (Edge closed → the job is cancelled with the same report). A take-over of a
// job that waits on its Sign-in card is the sign-in lanes' (signinLanes.ts); this is the take-over of a running job. M9 T7.
import { t } from '../../../shared/copy/t';
import type { LaneDeps, LaneRunner, SigninLanes } from './signinLanes';

export class TakeOver {
  /** Jobs the user is in control of (running jobs; a sign-in card's take-over is the lanes' state). */
  private taken = new Set<string>();
  private runner_: LaneRunner | null = null;

  constructor(
    private readonly d: LaneDeps,
    private readonly lanes: SigninLanes,
  ) {}

  attach(runner: LaneRunner): void {
    this.runner_ = runner;
  }
  private get r(): LaneRunner {
    if (!this.runner_) throw new Error('TakeOver used before attach()');
    return this.runner_;
  }

  has(jobId: string): boolean {
    return this.taken.has(jobId);
  }

  /** `job.takeOver { on: true }`: the loop stops (no click, no AI call), the mask comes off, Edge comes to the front. */
  async on(jobId: string): Promise<boolean> {
    if (await this.lanes.takeOver(jobId)) return true;
    if (this.taken.has(jobId)) return true;
    const job = await this.r.core.job(jobId);
    const win = this.d.window(jobId);
    if (!job || !win || job.state !== 'working') return false;
    this.taken.add(jobId);
    this.r.core.halt(jobId);
    this.d.log('takeover.on');
    const w = this.lanes.windows;
    await w.noCapture(win.page(), true);
    await this.d.masker.remove(win.page()).catch(() => undefined);
    await w.front(win);
    w.banner(jobId, 'open', { mode: 'take_over', url: win.url(), bounds: await w.bounds(win) });
    w.live(jobId, 'taken_over');
    // CR-0030 pick 3: the checklist row "You took over" (06-3 §11.2).
    const took = await this.r.core.tookOverOps(job);
    if (took.length) await this.r.core.tx(took);
    w.watch(
      jobId,
      win,
      () => undefined,
      () => void this.closed(jobId),
    );
    return true;
  }

  /** `job.handBack { jobId }`: the mask goes back on, foo re-reads the page and carries on from where the user left it. */
  async handBack(jobId: string): Promise<boolean> {
    if (await this.lanes.handBack(jobId)) return true;
    if (!this.taken.has(jobId)) return false;
    this.release(jobId);
    const page = this.d.window(jobId)?.page();
    if (page) {
      await this.d.masker.apply(page).catch(() => undefined);
      await this.lanes.windows.noCapture(page, false);
    }
    this.d.reread(jobId);
    this.lanes.windows.banner(jobId, 'close');
    this.lanes.windows.live(jobId, 'running');
    this.d.log('takeover.handed_back');
    const job = await this.r.core.job(jobId);
    if (!job) return false;
    await this.r.core.tx([this.r.core.textOp(job, t('cards.signin.hand_back_line'))]);
    if (job.state === 'working') this.r.core.launch(jobId);
    return true;
  }

  /** AT-078: the user closed the job's Edge window while in control → Stop, with the stop report. */
  private async closed(jobId: string): Promise<void> {
    if (!this.taken.has(jobId)) return;
    this.release(jobId);
    this.lanes.windows.banner(jobId, 'close');
    this.d.log('takeover.window_closed');
    await this.r.stop(jobId, 'window_closed', true);
  }

  private release(jobId: string): void {
    this.taken.delete(jobId);
    this.lanes.windows.unwatch(jobId);
  }

  jobEnded(jobId: string): void {
    if (!this.taken.has(jobId)) return;
    this.release(jobId);
    this.lanes.windows.banner(jobId, 'close');
  }
}
