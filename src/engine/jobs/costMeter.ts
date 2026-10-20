// Spec: 08-2 §5.10 items 2–4 (cost per turn; spend meter = SUM(cost_paise) of key turns since the 1st of the month 00:00 in
// the user's zone; pre-call cap check on every key AI call: monthSpent + estimateNextCall > cap → no call, jobs →
// waiting(spend_cap), the Spend-cap card (J19.3); raising the cap resumes in FIFO order), §5.4.2 (capCheck at the top of
// each loop turn), 08-4 §26.3 item 3 (the default-model rate), 05-3 §5.21 (card payload `{ which, capPaise, spentPaise }`,
// AI variant only in M4: CR-0008 G-M4-10), 07-2 §4 (working → waiting with waiting_reason; badge per BADGE_OF_STATE),
// AT-083, ART-13a (cap reached → 0 AI calls for jobs until the cap is raised or the month changes).
import { monthKey } from '../../shared/format';
import type { CardRow, JobRow } from '../../shared/types';
import type { RunnerCore } from './JobRunner';
import { MAX_WORKING } from './queue';

/** chars per token used for the next-call estimate (08-2 §5.10 item 2 "estimated"). */
const CHARS_PER_TOKEN = 3.5;

/** The month of `now` in the zone: [1st 00:00, next 1st 00:00). Binary search on monthKey, so DST and odd offsets are right. */
export function monthBounds(now: number, timeZone: string): { from: number; to: number } {
  const key = monthKey(now, timeZone);
  const edge = (lo: number, hi: number, inside: (t: number) => boolean) => {
    // Smallest t in (lo, hi] with inside(t), given inside(hi) and !inside(lo).
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (inside(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const DAY = 86_400_000;
  const from = edge(now - 32 * DAY, now, (t) => monthKey(t, timeZone) === key);
  const to = edge(now, now + 32 * DAY, (t) => monthKey(t, timeZone) !== key);
  return { from, to };
}

export function overCap(o: { billing: 'plan' | 'key' | 'local'; spentPaise: number; estimatePaise: number; capPaise: number }): boolean {
  return o.billing === 'key' && o.spentPaise + o.estimatePaise > o.capPaise;
}

/** The next call's cost, rounded up: prompt chars / 3.5 tokens in + the max output, at the provider's rate. */
export function estimateCallPaise(
  promptChars: number,
  maxOutputTokens: number,
  rate: { inPerMTokUsd: number; outPerMTokUsd: number } | null,
  usdToInr: number,
): number {
  if (!rate) return 0;
  const usd = ((promptChars / CHARS_PER_TOKEN) * rate.inPerMTokUsd + maxOutputTokens * rate.outPerMTokUsd) / 1_000_000;
  return Math.ceil(usd * usdToInr * 100 - 1e-9);
}

export class CostMeter {
  private monthTimer: ReturnType<RunnerCore['d']['clock']['setTimeout']> | null = null;
  /** The next-call estimate each capped job paused on: it resumes only when that call fits (08-2 §5.10 item 4). */
  private pausedEstimate = new Map<string, number>();

  constructor(private core: RunnerCore) {}

  async monthSpent(): Promise<number> {
    const d = this.core.d;
    const b = monthBounds(d.clock.now(), d.settings().locale.timeZone);
    const r = await this.core.query<{ paise: number }>('monthAiSpend', b.from, b.to);
    return r?.paise ?? 0;
  }

  /** Pre-call check (key billing only). True when the call may go; false when the cap stops it. */
  async allows(estimatePaise: number): Promise<boolean> {
    const pick = this.core.d.ai.pick();
    if (!pick || pick.billing !== 'key') return true;
    const capPaise = this.core.d.settings().money.aiCapPaise;
    return !overCap({ billing: pick.billing, spentPaise: await this.monthSpent(), estimatePaise, capPaise });
  }

  /**
   * M5 T10 (CR-0008 (j) row 5): the chat-lane turns (intake, repair, rewrite) are checked before the call too ("every AI call
   * on a key provider", 08-2 §5.10 item 4). False = no call; the month timer is armed so the new month lifts it.
   */
  async allowChatCall(promptChars: number, maxOutputTokens: number): Promise<boolean> {
    const pick = this.core.d.ai.pick();
    if (!pick || pick.billing !== 'key') return true;
    const est = estimateCallPaise(promptChars, maxOutputTokens, this.core.d.rateOf(pick.providerId), this.core.d.usdToInr);
    if (await this.allows(est)) return true;
    this.core.d.log('chat.spend_cap', 'SPEND_CAP', {});
    this.armMonthTimer();
    return false;
  }

  /** The next step turn of a WORKING job: the estimate from its prompt; at the cap the job waits and no call is made. */
  async allowStep(job: JobRow, promptChars: number, maxOutputTokens: number): Promise<boolean> {
    const pick = this.core.d.ai.pick();
    if (!pick || pick.billing !== 'key') return true;
    const est = estimateCallPaise(promptChars, maxOutputTokens, this.core.d.rateOf(pick.providerId), this.core.d.usdToInr);
    if (await this.allows(est)) return true;
    this.pausedEstimate.set(job.id, est);
    await this.pause(job);
    return false;
  }

  /** working → waiting(spend_cap); one open Spend-cap card per chat; a re-check when the month turns. */
  private async pause(job: JobRow): Promise<void> {
    const d = this.core.d;
    const capPaise = d.settings().money.aiCapPaise;
    const spentPaise = await this.monthSpent();
    const open = (await this.core.query<CardRow[]>('cards.openForChat', job.chatId, 'spend_cap')) ?? [];
    const card = open.length
      ? []
      : this.core.cardOps(job.chatId, 'spend_cap', 'shown', { which: 'ai', capPaise, spentPaise }, null, null).ops;
    const r = await this.core.tx([
      { op: 'transition', table: 'jobs', id: job.id, from: ['working'], to: 'waiting', set: { waiting_reason: 'spend_cap' } },
      ...this.core.badgeOps(job, 'waiting'),
      ...(await this.core.editChecklistOps(job)),
      ...card,
    ]);
    if (!r.ok) return;
    d.log('job.spend_cap', 'SPEND_CAP', { jobId: job.id });
    await this.core.writeMirrors(job.id);
    this.armMonthTimer();
  }

  private armMonthTimer(): void {
    if (this.monthTimer !== null) return;
    const d = this.core.d;
    const now = d.clock.now();
    const { to } = monthBounds(now, d.settings().locale.timeZone);
    this.monthTimer = d.clock.setTimeout(() => {
      this.monthTimer = null;
      void this.resumeCapped();
    }, to - now);
  }

  /** Cap raised or a new month: waiting(spend_cap) jobs resume, oldest first, within the free WORKING slots. */
  async resumeCapped(): Promise<void> {
    // M5 T10: messages that waited at the cap go now too (04 §3.3 Waiting to send).
    this.core.d.hooks?.onCapLifted?.();
    const live = (await this.core.query<JobRow[]>('jobsByState', ['working', 'waiting'])) ?? [];
    const capped = live.filter((j) => j.state === 'waiting' && j.waitingReason === 'spend_cap').sort((a, b) => a.createdAt - b.createdAt);
    if (!capped.length) return;
    let free = MAX_WORKING - live.filter((j) => j.state === 'working').length;
    const now = this.core.d.clock.now();
    const chats = new Set<string>();
    let stillCapped = false;
    for (const job of capped) {
      if (free <= 0) break;
      if (!(await this.allows(this.pausedEstimate.get(job.id) ?? 0))) {
        stillCapped = true;
        continue;
      }
      const r = await this.core.tx([
        {
          op: 'transition',
          table: 'jobs',
          id: job.id,
          from: ['waiting'],
          to: 'working',
          set: { waiting_reason: null, last_progress_at: now },
        },
        ...this.core.badgeOps(job, 'working'),
        ...(await this.core.editChecklistOps(job)),
      ]);
      if (!r.ok) continue;
      this.pausedEstimate.delete(job.id);
      free -= 1;
      chats.add(job.chatId);
      this.core.launch(job.id);
    }
    if (stillCapped) this.armMonthTimer();
    // 05-3 §5.21 "raised": the open Spend-cap cards of the chats that carry on.
    for (const chatId of chats) {
      const open = (await this.core.query<CardRow[]>('cards.openForChat', chatId, 'spend_cap')) ?? [];
      if (open.length)
        await this.core.tx(
          open.map((c) => ({
            op: 'update' as const,
            table: 'cards' as const,
            id: c.id,
            set: { state: 'raised', resolved_by: 'system', resolved_at: now },
          })),
        );
    }
  }

  dispose(): void {
    if (this.monthTimer !== null) this.core.d.clock.clearTimeout(this.monthTimer);
    this.monthTimer = null;
  }
}
