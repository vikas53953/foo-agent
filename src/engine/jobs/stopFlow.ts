// Spec: 08-2 §5.2.1 (isStopCommand), §5.2.2 (looksLikeYes: never approves, only the G16 reply), §5.7 (stopJob halts within
// 1 s: abort, then one transaction — job → cancelled with stop_reason, open approvals → WITHDRAWN, open choice cards →
// withdrawn, checklist `stopped` ("Stopped by you"), badge ⛔, pill cleared by main — then the report built only from
// activity rows; step 6 stopAll), 08-4 §26.9 (stopFlow: "stop everything" → stopAll; no live job → "Nothing's running right
// now."; one → stopJob(user_word); two or three → Choice card "Stop which one?" with "Both" / "All of them", 15 min →
// expired, nothing stopped), §26.4 item 4 + X-80 (stuck_stop), 06-3 §9.4 (activity `stopped_job` / `stopped_all`),
// CR-0008 G-M4-06 ("Stopped by you" only for user stop reasons), G-M4-11 (the stuck Stop reports with thread.stop.report.*),
// G-M4-14 (bare "cancel" only).
import { t } from '../../shared/copy/t';
import { formatTime, type TimeOptions } from '../../shared/format';
import { TERMINAL } from '../../shared/jobMachine';
import type { ActivityRow, CardRow, JobRow, StopReason, StopReport } from '../../shared/types';
import type { ActivityOpRow, DbOp } from '../protocol';
import type { RunnerCore } from './JobRunner';

const STOP_RE = /^(stop|stop that|stop it|cancel|stop everything|ruko|ruk jao|bas|band karo|rok do)\b[.! ]*$/;
const STOP_ALL_RE = /^stop everything\b[.! ]*$/;
const YES_RE = /^(yes|yep|yeah|ok|okay|haan|ha|ji|theek hai|kar do|go|do it|send it|book it|pay|approve)\b/;

export const isStopCommand = (text: string): boolean => STOP_RE.test(text.trim().toLowerCase());
export const isStopEverything = (text: string): boolean => STOP_ALL_RE.test(text.trim().toLowerCase());
export const looksLikeYes = (text: string): boolean => YES_RE.test(text.trim().toLowerCase());

/** 08-0 §G.4: "done" rows are sent / paid / booked / deleted with outcome done. */
const DONE_KINDS = new Set<ActivityRow['kind']>(['sent', 'paid', 'booked', 'deleted']);
export const doneRows = (rows: ActivityRow[]): ActivityRow[] => rows.filter((r) => DONE_KINDS.has(r.kind) && r.outcome === 'done');

/** The J18 report line, from activity rows only (never from the AI). */
export function stopReportText(rows: ActivityRow[], o: TimeOptions): string {
  const done = doneRows(rows);
  if (!done.length) return t('thread.stop.report.nothing');
  const last = done[done.length - 1]!;
  return t('thread.stop.report.partial', { summary: done.map((r) => r.summary).join(', '), time: formatTime(last.at, o) });
}

/** CR-0030 pick 1: the J18 "Stop everything" result line in foo's chat, from the stopped jobs' activity rows only. */
export function stopAllReportText(titles: string[], done: ActivityRow[]): string {
  const lead =
    titles.length === 1
      ? t('thread.stop.all.lead_one', { titles: titles[0]! })
      : t('thread.stop.all.lead', { count: titles.length, titles: titles.join(', ') });
  if (!done.length) return `${lead} ${t('thread.stop.all.nothing')}`;
  const paid = done.some((r) => r.kind === 'paid');
  const already = t('thread.stop.all.already', { summaries: done.map((r) => r.summary).join(', ') });
  return paid ? `${lead} ${already}` : `${lead} ${t('thread.stop.all.nothing_paid')} ${already}`;
}

/** An activity row with every column not given left NULL (08-1 §4.3.11). */
export function activityRow(
  o: Pick<ActivityOpRow, 'kind' | 'event' | 'actor' | 'summary' | 'outcome'> & Partial<ActivityOpRow>,
): ActivityOpRow {
  return {
    chatId: null,
    chatTitle: null,
    jobId: null,
    approvalId: null,
    paymentId: null,
    routineId: null,
    toLabel: null,
    fromLabel: null,
    amountPaise: null,
    approvedHow: null,
    ruleText: null,
    proofKind: null,
    proofRef: null,
    ...o,
  };
}

/** User stop reasons write the checklist row "Stopped by you" and the activity line (G-M4-06). */
const USER_REASONS = new Set<StopReason>(['user_word', 'user_button', 'stop_all', 'stuck_stop', 'window_closed']);
/** 08-4 §26.9 item 4: an unanswered "Stop which one?" card expires after 15 min; nothing is stopped. */
export const STOP_WHICH_MS = 15 * 60_000;
/** Card types that are "open" choices of a job and end `withdrawn` on stop (08-0 §G.2). */
const WITHDRAW_TO: Record<string, string> = {
  choice: 'withdrawn',
  tiles: 'withdrawn',
  draft: 'withdrawn',
  secret: 'withdrawn',
  signin: 'withdrawn',
  approval: 'WITHDRAWN',
  payment: 'WITHDRAWN',
  plan: 'withdrawn',
};

export class StopFlow {
  private timers = new Map<string, ReturnType<RunnerCore['d']['clock']['setTimeout']>>();

  constructor(private core: RunnerCore) {}

  /** 08-2 §5.7: halt within 1 s, one transaction, then the report. JOB_GONE when the job is gone or already final. */
  async stopJob(jobId: string, reason: StopReason, opts: { report?: boolean } = {}): Promise<StopReport | null> {
    const job = await this.core.job(jobId);
    if (!job || TERMINAL.has(job.state)) return null;
    // Step 1 first: no more AI calls or tool calls for this job from now on.
    this.core.halt(jobId);
    const now = this.core.d.clock.now();
    const steps = await this.core.steps(jobId);
    const open = ((await this.core.query<CardRow[]>('cardsOpenForChat', job.chatId)) ?? []).filter((c) => c.jobId === jobId);
    const resolve = { resolved_by: 'system', resolved_at: now };
    const cardOps: DbOp[] = [];
    for (const c of open) {
      if (c.type === 'stuck') cardOps.push({ op: 'update', table: 'cards', id: c.id, set: { state: 'stopped', ...resolve } });
      else if (WITHDRAW_TO[c.type])
        cardOps.push({ op: 'update', table: 'cards', id: c.id, set: { state: WITHDRAW_TO[c.type], ...resolve } });
    }
    const user = USER_REASONS.has(reason);
    const activity = (await this.core.query<ActivityRow[]>('activityForJob', jobId)) ?? [];
    const report = stopReportText(activity, this.timeOpts());
    const ops: DbOp[] = [
      {
        op: 'transition',
        table: 'jobs',
        id: jobId,
        from: ['queued', 'working', 'needs_you', 'waiting'],
        to: 'cancelled',
        set: { stop_reason: reason, finished_at: now, needs_you_card_id: null },
      },
      ...steps
        .filter((s) => s.state === 'running' || s.state === 'pending' || s.state === 'waiting_user')
        .map((s): DbOp => ({ op: 'update', table: 'steps', id: s.id, set: { state: 'skipped' } })),
      ...cardOps,
      ...this.core.badgeOps(job, 'cancelled'),
      ...(await this.core.editChecklistOps(job, 'stopped')),
    ];
    if (user && reason !== 'stop_all')
      ops.push({
        op: 'activity',
        row: activityRow({
          kind: 'stopped',
          event: 'stopped_job',
          actor: 'user',
          chatId: job.chatId,
          jobId,
          summary: `Stopped "${job.title}"`,
          outcome: 'done',
        }),
      });
    if (opts.report !== false) ops.push(this.core.textOp(job, report));
    const r = await this.core.tx(ops);
    if (!r.ok) {
      this.core.d.log('job.stop_refused', r.error.kind, { jobId });
      return null;
    }
    await this.core.ended(jobId);
    void this.core.startNext();
    return { jobId, done: doneRows(activity), nothingDone: doneRows(activity).length === 0 };
  }

  /** 08-2 §5.7 step 6: every job not final, routines untouched; J18 / 06-3 §14 C-13: one combined report in foo's chat (CR-0030
   * pick 1). A job in another chat keeps its own report line there; a job in foo's chat is covered by the combined line. */
  async stopAll(): Promise<StopReport[]> {
    const live = (await this.core.query<JobRow[]>('jobsByState', ['queued', 'working', 'needs_you', 'waiting'])) ?? [];
    for (const j of live) this.core.halt(j.id);
    const fooChat = await this.core.query<string>('chats.foo');
    const out: StopReport[] = [];
    const titles: string[] = [];
    for (const j of live) {
      const r = await this.stopJob(j.id, 'stop_all', { report: j.chatId !== fooChat });
      if (!r) continue;
      out.push(r);
      titles.push(j.title);
    }
    if (out.length)
      await this.core.tx([
        {
          op: 'activity',
          row: activityRow({
            kind: 'stopped',
            event: 'stopped_all',
            actor: 'user',
            summary: `Stopped ${out.length} jobs`,
            outcome: 'done',
          }),
        },
        ...(fooChat
          ? [
              this.core.textOp(
                { chatId: fooChat, id: null, ownerId: null },
                stopAllReportText(
                  titles,
                  out.flatMap((r) => r.done as ActivityRow[]),
                ),
              ),
            ]
          : []),
      ]);
    return out;
  }

  /** 08-4 §26.9: a typed stop word in chat C. */
  async stopFlow(m: { chatId: string; text: string }): Promise<void> {
    if (isStopEverything(m.text)) {
      await this.stopAll();
      return;
    }
    const live = ((await this.core.query<JobRow[]>('jobs.liveForChat', m.chatId)) ?? []).filter((j) => !TERMINAL.has(j.state));
    if (live.length === 0) {
      await this.core.tx([this.core.textOp({ chatId: m.chatId, id: null, ownerId: null }, t('thread.stop.none'))]);
      return;
    }
    if (live.length === 1) {
      await this.stopJob(live[0]!.id, 'user_word');
      return;
    }
    const options = live.slice(0, 3).map((j, i) => ({ id: `o${i + 1}`, label: j.title, jobId: j.id }));
    options.push({
      id: `o${options.length + 1}`,
      label: live.length === 2 ? t('cards.choice.option.stop_both') : t('cards.choice.option.stop_all'),
      jobId: '*',
    });
    const payload = {
      question: t('cards.choice.question.stop_which'),
      options: options.map(({ id, label }) => ({ id, label })),
      multi: false,
      reversible: false,
      purpose: 'stop_which',
      jobIds: options.map((o) => o.jobId),
    };
    const { cardId, ops } = this.core.cardOps(m.chatId, 'choice', 'asking', payload, null, null);
    const r = await this.core.tx(ops);
    if (!r.ok) return;
    this.timers.set(
      cardId,
      this.core.d.clock.setTimeout(() => {
        this.timers.delete(cardId);
        void this.expire(cardId);
      }, STOP_WHICH_MS),
    );
  }

  /** An answer on a "Stop which one?" card. */
  async answerStopWhich(card: CardRow, choice: string | undefined, resolvedBy: string): Promise<void> {
    if (card.resolvedAt !== null) return;
    const options = (card.payload.options as { id: string }[] | undefined) ?? [];
    const jobIds = (card.payload.jobIds as string[] | undefined) ?? [];
    const i = options.findIndex((o) => o.id === choice);
    if (i < 0) return;
    const timer = this.timers.get(card.id);
    if (timer !== undefined) this.core.d.clock.clearTimeout(timer);
    this.timers.delete(card.id);
    const now = this.core.d.clock.now();
    await this.core.tx([
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { state: 'answered', resolved_by: resolvedBy, resolved_at: now, answer: { optionId: choice } },
      },
    ]);
    const picked = jobIds[i] === '*' ? jobIds.filter((id) => id !== '*') : [jobIds[i]!];
    for (const id of picked) this.core.halt(id);
    for (const id of picked) await this.stopJob(id, 'user_word');
  }

  private async expire(cardId: string): Promise<void> {
    const card = await this.core.query<CardRow>('cardById', cardId);
    if (!card || card.resolvedAt !== null) return;
    await this.core.tx([
      { op: 'update', table: 'cards', id: cardId, set: { state: 'expired', resolved_by: 'system', resolved_at: this.core.d.clock.now() } },
    ]);
  }

  /** Test teardown and engine stop: no stray expiry timers. */
  dispose(): void {
    for (const id of this.timers.values()) this.core.d.clock.clearTimeout(id);
    this.timers.clear();
  }

  private timeOpts(): TimeOptions {
    const s = this.core.d.settings();
    return { timeZone: s.locale.timeZone };
  }
}
