// Spec: 08-2 §5.2 (the runner's branches of onUserMessage: stop word → stopFlow; yes-text on an open approval / payment /
// draft card → the G16 reply; one live job → steer; more than one → Choice card "Fold this into which job?"; else intake),
// §5.5 (steer: queue in order, never interrupt a running turn; the next step turn carries part 10 and one steerEffect per
// message; folded/restart → "Got it, I'll fold that in."; answered → the AI's say first; new_job → normal intake; the
// message's badge follows the job's; do-verbs in a steer join do_verbs), §7.2 part 10 + 08-4 §24.14 (header), 08-4 §25.3
// (StepAct.steer), §26.5 (steer while NEEDS_YOU: open choice / approval / payment / draft cards superseded, the job → working,
// drain at once, the withdrawn line; a sign-in in progress is not interrupted), ART-18a/b.
// M5 T8: §26.5 item 3 for approval and payment cards goes through main's ApprovalGate (`approval.transition` SUPERSEDED,
// `superseded: 'steer'`, so the approvals row and the card move together; 08-2 §9.1 only main writes approvals.state), and the
// runner's gate learns which approval the job's next card replaces (superseded_by, AT-077b).
import { t } from '../../shared/copy/t';
import { BADGE_OF_STATE, TERMINAL } from '../../shared/jobMachine';
import type { CardRow, JobRow, StepRow } from '../../shared/types';
import type { DbOp } from '../protocol';
import type { RunnerCore } from './JobRunner';
import { isStopCommand, looksLikeYes, type StopFlow } from './stopFlow';
import { flightScopePayload, isFlightBooking } from './flights'; // M9 T8
import { extractDoVerbs } from './verbs';

export type SteerEffect = 'folded' | 'answered' | 'restart' | 'new_job';

const WITHDRAWN_LINE = 'A card was waiting; it has been withdrawn. Re-check the terms before asking again.';

/** Per-job steer messages, in order. Persisted through state.json `steerQueue` (08-1 §4.1.2). */
export class SteerQueue {
  private q = new Map<string, string[]>();
  push(jobId: string, messageId: string): void {
    const list = this.q.get(jobId) ?? [];
    if (!list.includes(messageId)) list.push(messageId);
    this.q.set(jobId, list);
  }
  pending(jobId: string): string[] {
    return [...(this.q.get(jobId) ?? [])];
  }
  take(jobId: string): string[] {
    const list = this.pending(jobId);
    this.q.delete(jobId);
    return list;
  }
  /** A turn that failed hands its steers back, ahead of any that arrived meanwhile. */
  putBack(jobId: string, ids: string[]): void {
    const rest = (this.q.get(jobId) ?? []).filter((id) => !ids.includes(id));
    this.q.set(jobId, [...ids, ...rest]);
  }
  forget(jobId: string): void {
    this.q.delete(jobId);
  }
}

/** Part 10: header, then one line per message. The withdrawn line comes first after a §26.5 supersede. */
export function steerBlock(firstName: string, messages: { id: string; text: string }[], withdrawn: boolean): string {
  return [
    ...(withdrawn ? [WITHDRAWN_LINE] : []),
    `New messages from ${firstName} while you work (answer or fold in each one):`,
    ...messages.map((m) => `- [${m.id}] ${m.text.replace(/\s+/g, ' ').trim()}`),
  ].join('\n');
}

/** One effect per queued message, in queue order; a message the AI left out is folded (it still reaches the plan's next turn). */
export function effectsFor(
  ids: string[],
  ai: { messageId: string; effect: SteerEffect }[] | undefined,
): { effects: { messageId: string; effect: SteerEffect }[]; missing: string[] } {
  const missing: string[] = [];
  const effects = ids.map((messageId) => {
    const e = ai?.find((x) => x.messageId === messageId)?.effect;
    if (!e) missing.push(messageId);
    return { messageId, effect: e ?? ('folded' as const) };
  });
  return { effects, missing };
}

interface MessageView {
  id: string;
  chatId: string;
  text: string;
  authorKind: string;
}

/** NEEDS_YOU card types a steer supersedes, and the state each moves to (08-4 §26.5 item 3; 08-0 §G.2). */
const SUPERSEDE_TO: Record<string, string> = {
  choice: 'superseded',
  tiles: 'superseded',
  draft: 'superseded',
  approval: 'SUPERSEDED',
  payment: 'SUPERSEDED',
};
/** M5 T8: cards whose state mirrors an approvals row (main moves both). */
const GATED = new Set(['approval', 'payment']);
/** Approval-like cards a typed "yes" never answers (Art. 6). */
const TAP_ONLY = new Set(['approval', 'payment', 'draft']);

export class Steer {
  readonly queue = new SteerQueue();
  private inflight = new Map<string, string[]>();
  /** Steer messages whose badge follows the job's badge (08-2 §5.5 item 4). */
  private followers = new Map<string, string[]>();
  private withdrawn = new Set<string>();

  constructor(
    private core: RunnerCore,
    private stop: StopFlow,
    // M5 T8
    private onSuperseded?: (jobId: string, approvalId: string) => void,
  ) {}

  /** The runner's branches of 08-2 §5.2. True when the message is handled here (no intake turn). */
  async onUserMessage(m: { chatId: string; messageId: string; text: string }): Promise<boolean> {
    const text = m.text.trim();
    if (!text) return false;
    if (isStopCommand(text)) {
      await this.seen(m.messageId);
      await this.stop.stopFlow({ chatId: m.chatId, text });
      return true;
    }
    // M9 T8 (08-2 §5.3.4, X-81): booking a flight is compare-and-open only; the fixed reply, before any AI turn.
    if (isFlightBooking(text)) {
      await this.seen(m.messageId);
      await this.core.tx(this.core.cardOps(m.chatId, 'choice', 'asking', flightScopePayload(m.messageId), null, null).ops);
      return true;
    }
    const open = (await this.core.query<CardRow[]>('cardsOpenForChat', m.chatId)) ?? [];
    const tapOnly = open.find((c) => TAP_ONLY.has(c.type) && (c.state === 'PENDING' || c.state === 'pending'));
    if (tapOnly && looksLikeYes(text)) {
      await this.seen(m.messageId);
      const words = tapOnly.type === 'draft' ? t('thread.approval_typed.send') : t('thread.approval_typed.approve');
      await this.core.tx([this.core.textOp({ chatId: m.chatId, id: null, ownerId: null }, words)]);
      return true;
    }
    const live = ((await this.core.query<JobRow[]>('jobs.liveForChat', m.chatId)) ?? []).filter(
      (j) => j.state === 'working' || j.state === 'needs_you',
    );
    if (live.length === 1) {
      await this.steer(live[0]!, { id: m.messageId, text });
      return true;
    }
    if (live.length > 1) {
      await this.seen(m.messageId);
      const options = live.slice(0, 4).map((j, i) => ({ id: `o${i + 1}`, label: j.title }));
      const payload = {
        question: t('cards.choice.question.fold_which'),
        options,
        multi: false,
        reversible: false,
        purpose: 'fold_which',
        jobIds: live.slice(0, 4).map((j) => j.id),
        messageId: m.messageId,
      };
      await this.core.tx(this.core.cardOps(m.chatId, 'choice', 'asking', payload, null, null).ops);
      return true;
    }
    return false;
  }

  private async seen(messageId: string): Promise<void> {
    await this.core.tx([{ op: 'update', table: 'messages', id: messageId, set: { status: 'complete', badge: 'seen' } }]);
  }

  /** An answer on a "Fold this into which job?" card. */
  async answerFoldWhich(card: CardRow, choice: string | undefined, resolvedBy: string): Promise<void> {
    if (card.resolvedAt !== null) return;
    const options = (card.payload.options as { id: string }[] | undefined) ?? [];
    const jobIds = (card.payload.jobIds as string[] | undefined) ?? [];
    const i = options.findIndex((o) => o.id === choice);
    const messageId = String(card.payload.messageId ?? '');
    if (i < 0 || !messageId) return;
    await this.core.tx([
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { state: 'answered', resolved_by: resolvedBy, resolved_at: this.core.d.clock.now(), answer: { optionId: choice } },
      },
    ]);
    const job = await this.core.job(jobIds[i]!);
    const m = await this.core.query<MessageView>('messageById', messageId);
    if (!job || !m || TERMINAL.has(job.state)) return;
    await this.steer(job, { id: messageId, text: m.text });
  }

  /** 08-2 §5.5 item 1: queue; 👀 on the message; never interrupt the running turn. */
  async steer(job: JobRow, m: { id: string; text: string }): Promise<void> {
    this.queue.push(job.id, m.id);
    const follow = this.followers.get(job.id) ?? [];
    if (!follow.includes(m.id)) this.followers.set(job.id, [...follow, m.id]);
    const ops: DbOp[] = [{ op: 'update', table: 'messages', id: m.id, set: { status: 'complete', badge: 'seen' } }];
    const verbs = extractDoVerbs(m.text).filter((v) => !job.doVerbs.includes(v));
    if (verbs.length) ops.push({ op: 'update', table: 'jobs', id: job.id, set: { do_verbs: [...job.doVerbs, ...verbs], intent: 'do' } });
    await this.core.tx(ops);
    await this.core.writeMirrors(job.id);
    if (job.state === 'needs_you') await this.supersede(job);
  }

  /** 08-4 §26.5: the open card is withdrawn and the job works again at once (a sign-in or a stuck card waits). */
  private async supersede(job: JobRow): Promise<void> {
    const card = job.needsYouCardId ? await this.core.query<CardRow>('cardById', job.needsYouCardId) : null;
    if (card && card.resolvedAt !== null) return; // answered already: it resumes when a slot frees
    const to = card ? SUPERSEDE_TO[card.type] : undefined;
    if (card && !to) return; // signin, secret, stuck: the steer waits for that card (§26.5 item 2)
    const now = this.core.d.clock.now();
    // M5 T8: an approval or payment card moves with its approvals row, in main.
    const approvalId = card && GATED.has(card.type) ? String(card.payload.approvalId ?? '') : '';
    if (approvalId) {
      const moved = await this.core.d.link.request('approval.transition', { approvalId, to: 'SUPERSEDED', data: { superseded: 'steer' } });
      if (!moved.ok) return; // answered or expired meanwhile: nothing to withdraw
      this.onSuperseded?.(job.id, approvalId);
    }
    const steps = await this.core.steps(job.id);
    const waiting = steps.find((s) => s.state === 'waiting_user');
    const r = await this.core.tx([
      ...(card && to && !approvalId
        ? [{ op: 'update', table: 'cards', id: card.id, set: { state: to, resolved_by: 'system', resolved_at: now } } as DbOp]
        : []),
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['needs_you'],
        to: 'working',
        set: { needs_you_card_id: null, last_progress_at: now },
      },
      ...(waiting ? [{ op: 'update', table: 'steps', id: waiting.id, set: { state: 'running' } } as DbOp] : []),
      ...this.core.badgeOps(job, 'working'),
      ...(await this.core.editChecklistOps(job)),
    ]);
    if (!r.ok) return;
    this.withdrawn.add(job.id);
    this.core.launch(job.id);
  }

  /** Message ids whose badge follows this job. */
  followersOf(jobId: string): string[] {
    return this.followers.get(jobId) ?? [];
  }

  /** At a loop boundary: part 10 for the next step turn, or null when nothing is queued. */
  async drain(job: JobRow): Promise<string | null> {
    const ids = this.queue.take(job.id);
    if (!ids.length) return null;
    const messages: { id: string; text: string }[] = [];
    for (const id of ids) {
      const m = await this.core.query<MessageView>('messageById', id);
      if (m) messages.push({ id, text: m.text });
    }
    this.inflight.set(
      job.id,
      messages.map((m) => m.id),
    );
    const withdrawn = this.withdrawn.delete(job.id);
    const firstName = this.core.d.settings().user.firstName ?? 'the user';
    return steerBlock(firstName, messages, withdrawn);
  }

  /**
   * After the step turn, before its decision is applied (Art. 18: answered before progress). `act` null = the turn failed:
   * the steers go back on the queue for the next turn.
   */
  async settle(job: JobRow, act: { steer?: { messageId: string; effect: SteerEffect }[] } | null, say: string): Promise<void> {
    const ids = this.inflight.get(job.id);
    if (!ids) return;
    this.inflight.delete(job.id);
    if (!act) {
      this.queue.putBack(job.id, ids);
      return;
    }
    const { effects, missing } = effectsFor(ids, act.steer);
    if (missing.length) this.core.d.log('job.steer_effect_missing', 'PROTOCOL_INVALID', { jobId: job.id });
    const ops: DbOp[] = [];
    let restart = false;
    for (const e of effects) {
      if (e.effect === 'folded' || e.effect === 'restart') ops.push(this.core.textOp(job, t('thread.steer.folded')));
      if (e.effect === 'restart') restart = true;
      if (e.effect === 'answered') {
        const text = this.core.d.prompts.filter(say);
        if (text.trim()) ops.push(this.core.textOp(job, text));
        else ops.push(this.core.textOp(job, t('thread.steer.folded')));
      }
    }
    if (restart) ops.push(...(await this.restartOps(job)));
    if (ops.length) await this.core.tx(ops);
    for (const e of effects)
      if (e.effect === 'new_job') {
        // An unrelated request: it leaves this job and goes to a normal intake turn of its own.
        this.followers.set(
          job.id,
          this.followersOf(job.id).filter((id) => id !== e.messageId),
        );
        this.core.intake(job.chatId, e.messageId);
      }
    await this.core.writeMirrors(job.id);
  }

  /** "restart": the plan goes back to step 1 (e.g. new dates); every step is to do again. */
  private async restartOps(job: JobRow): Promise<DbOp[]> {
    const steps = (await this.core.steps(job.id)).filter((s) => s.state !== 'skipped');
    const first = steps[0];
    if (!first) return [];
    const now = this.core.d.clock.now();
    return [
      ...steps.map((s: StepRow): DbOp => ({
        op: 'update',
        table: 'steps',
        id: s.id,
        set: { state: s === first ? 'running' : 'pending', started_at: s === first ? now : null, finished_at: null },
      })),
      { op: 'update', table: 'jobs', id: job.id, set: { current_step_idx: first.idx, last_progress_at: now } },
      ...(await this.core.editChecklistOps(job)),
    ];
  }

  /** The badge ops for the steer messages of a job moving to `state` (08-2 §5.5 item 4). */
  badgeOps(jobId: string, badge: (typeof BADGE_OF_STATE)[keyof typeof BADGE_OF_STATE]): DbOp[] {
    return this.followersOf(jobId).map((id) => ({ op: 'update', table: 'messages', id, set: { badge } }));
  }

  forget(jobId: string): void {
    this.queue.forget(jobId);
    this.inflight.delete(jobId);
    this.followers.delete(jobId);
    this.withdrawn.delete(jobId);
  }
}
