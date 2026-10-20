// Spec: 07-1 J8 + research/journeys-2 J8 "Timeout rules" (a reversible preference: Best fit after 15 min and say so; anything
// that leads to a send, booking or payment or picks between real-world options: no auto-pick, one reminder toast at 15 min,
// at 24 h the job → CANCELLED with the stop line), 05-1 §5.3.2 rows "Auto-picked", "Reminder", "Cancelled after 24 h"
// (summary "{question} → no answer"; "I stopped the {job} because I didn't hear back. …"), §5.3.3 (`auto_picked`,
// `expired`), 08-4 §26.7 (only `effectiveReversible` cards auto-pick; the payload's `reversible` is that value), 08-0
// StopReason `choice_timeout`, 08-3 §15 NotificationRequest (`notify`, kind choice; main stubs it until M11), AT-033, AT-034.
// Runs on the runner's 15 s tick. Purposes the runner answers itself (stop_which, fold_which), file_in and photo_notice have
// their own rules (05-1 §5.3.3, 08-4 §26.9) and are left alone. `{job}` / `{what}` take jobs.title unchanged, as the stuck
// card does (G-M5-34: 08-4 §26.2 titles are running phrases, 05-1 §5.3.2 reads a noun; spec keeper). The [ Search again ] button
// under the stop line needs a message-button contract no ticket owns yet (lead hand-off); the line is posted without it.
import { t } from '../../shared/copy/t';
import type { CardRow, ChoicePayload, JobRow } from '../../shared/types';
import type { DbOp } from '../protocol';
import type { RunnerCore } from '../jobs/JobRunner';

/** J8: 15 min to the auto-pick or the reminder. */
export const CHOICE_NUDGE_MS = 15 * 60_000;
/** J8: 24 h to the stop. */
export const CHOICE_EXPIRE_MS = 24 * 3_600_000;

const OWN_RULES = new Set(['stop_which', 'fold_which', 'file_in', 'photo_notice']);

export interface ChoiceTimeoutDeps {
  core: RunnerCore;
  /** The runner takes an auto-picked answer as it takes a tap (decision line, resume when a slot frees). */
  answered(job: JobRow, card: CardRow, optionId: string, label: string): Promise<void>;
}

export class ChoiceTimeouts {
  /** Cards whose one reminder went out (RAM; after a restart a card may be reminded once more). */
  private reminded = new Set<string>();

  constructor(private d: ChoiceTimeoutDeps) {}

  async run(): Promise<void> {
    const core = this.d.core;
    const now = core.d.clock.now();
    const waiting = (await core.query<JobRow[]>('jobsByState', ['needs_you'])) ?? [];
    for (const job of waiting) {
      if (!job.needsYouCardId) continue;
      const card = await core.query<CardRow>('cardById', job.needsYouCardId);
      if (!card || (card.type !== 'choice' && card.type !== 'tiles') || card.state !== 'asking' || card.resolvedAt !== null) continue;
      const p = card.payload as unknown as ChoicePayload;
      if (OWN_RULES.has(String(p.purpose))) continue;
      const age = now - card.createdAt;
      if (p.reversible === true) {
        if (age >= CHOICE_NUDGE_MS) await this.autoPick(job, card, p);
      } else if (age >= CHOICE_EXPIRE_MS) await this.expire(job, card);
      else if (age >= CHOICE_NUDGE_MS && !this.reminded.has(card.id)) await this.remind(job, card);
    }
  }

  /** AT-033: Best fit (o1), the card `auto_picked`, and the one line saying so. */
  private async autoPick(job: JobRow, card: CardRow, p: ChoicePayload): Promise<void> {
    const core = this.d.core;
    const best = p.options.find((o) => o.bestFit) ?? p.options[0];
    if (!best) return;
    const now = core.d.clock.now();
    const r = await core.tx([
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { state: 'auto_picked', resolved_by: 'auto', resolved_at: now, answer: { optionId: best.id } },
      },
      core.textOp(job, t('cards.choice.auto_picked_line', { option: best.label })),
    ]);
    if (r.ok) await this.d.answered(job, card, best.id, best.label);
  }

  /** J8: one reminder toast at 15 min for a real-world choice (no auto-pick). */
  private async remind(job: JobRow, card: CardRow): Promise<void> {
    const core = this.d.core;
    this.reminded.add(card.id);
    const chat = await core.query<{ title: string }>('chatOpen', job.chatId);
    core.d.link.send('notify', {
      kind: 'choice',
      chatId: job.chatId,
      title: chat?.title ?? '',
      body: t('cards.choice.reminder_toast', { chat: chat?.title ?? '', what: job.title }),
      prompted: true,
      ref: card.id,
    });
  }

  /** AT-034: 24 h with no answer → the card `expired`, the job CANCELLED (`choice_timeout`) and the stop line. */
  private async expire(job: JobRow, card: CardRow): Promise<void> {
    const core = this.d.core;
    const now = core.d.clock.now();
    const steps = await core.steps(job.id);
    const r = await core.tx([
      { op: 'update', table: 'cards', id: card.id, set: { state: 'expired', resolved_by: 'auto', resolved_at: now } },
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['needs_you'],
        to: 'cancelled',
        set: { needs_you_card_id: null, stop_reason: 'choice_timeout', finished_at: now },
      },
      ...steps
        .filter((s) => s.state === 'waiting_user' || s.state === 'pending' || s.state === 'running')
        .map((s): DbOp => ({ op: 'update', table: 'steps', id: s.id, set: { state: 'skipped' } })),
      core.textOp(job, t('cards.choice.expired_line', { job: job.title })),
      ...core.badgeOps(job, 'cancelled'),
      ...(await core.editChecklistOps(job, 'stopped')),
    ]);
    if (!r.ok) return;
    this.reminded.delete(card.id);
    await core.ended(job.id);
    await core.startNext();
  }
}
