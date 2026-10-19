// Spec: 08-2 §5.9 (crash recovery: safe mode holds every job; WORKING / QUEUED after an unclean exit → NEEDS_YOU with a
// recovery card; WAITING re-evaluated; unfinished side-effect tool calls → `unknown`), §6.7 (AI error → runner effect:
// NET_OFFLINE / AI_SERVICE_DOWN after 2 failures in a row per provider, AI_SIGNED_OUT, AI_KEY_INVALID, AI_LIMIT → WAITING;
// AI_TIMEOUT and the rest count as one failed turn), §5.4.1 (start needs an AI verified in the last 10 min; slots are
// released on WAITING), 08-1 §2.3 steps 4–5 (`jobs.pauseAll` app_quit / windows_shutdown), 08-3 §21.2 (error card words and
// the one button per kind; NET_OFFLINE shows no card, the app banner carries it, 05-3 §5.20 / X-13), 05-3 §5.20 (states
// asking / fixed / resumed / stopped; recovery variant), 08-4 §26.10 (resume after a clean pause: checklist edit only),
// 09 §9.22 (sleep → WAITING asleep; resume re-tests the AI), 07-2 §4 + SM-A10 (WAITING → WORKING edits the error card in
// place, never a new message), CR-0008 G-M4-02, G-M4-04, G-M4-13 (main decides safe mode and tells the engine).
// The runner (JobRunner.ts) owns the loop; this file fills its T4 hooks and moves jobs in and out of WAITING / recovery.
import { newNonce } from '../../shared/canon';
import { t } from '../../shared/copy/t';
import type { Clock } from '../../shared/clock';
import { formatTime } from '../../shared/format';
import { BADGE_OF_STATE } from '../../shared/jobMachine';
import type { Settings } from '../../shared/settings';
import type {
  ActivityRow,
  AiStatus,
  CardRow,
  ErrorKind,
  FixAction,
  JobRow,
  JobState,
  ProviderId,
  StepRow,
  WaitingReason,
} from '../../shared/types';
import type { AiErrorKind } from '../ai/types';
import type { DbOp, DbTxReply, MainLink } from '../protocol';
import type { Result } from '../../shared/errors';
import { MAX_WORKING, needsVerify } from './queue';
import { activityRow, stopReportText } from './stopFlow';

/** Waiting reasons a clean pause writes; their resume is a checklist edit only (08-4 §26.10, G-M4-02). */
export const QUIET_REASONS: ReadonlySet<WaitingReason> = new Set<WaitingReason>(['app_quit', 'windows_shutdown', 'asleep']);
/** Reasons another part of the runner clears (T3 caps, the opens_at tick); recovery never resumes them on its own. */
const NOT_MINE: ReadonlySet<WaitingReason> = new Set<WaitingReason>(['spend_cap', 'opens_at']);

/** 08-2 §6.7: AI error kinds that park a job in WAITING, and the reason written. */
export const WAITING_OF_KIND: Partial<Record<AiErrorKind, WaitingReason>> = {
  NET_OFFLINE: 'net_offline',
  AI_SERVICE_DOWN: 'ai_down',
  AI_SIGNED_OUT: 'ai_signed_out',
  AI_KEY_INVALID: 'ai_signed_out',
  AI_LIMIT: 'ai_limit',
  AI_CLI_INCOMPATIBLE: 'ai_down',
};

const KIND_OF_STATE: Record<AiStatus['state'], AiErrorKind> = {
  ok: 'AI_SERVICE_DOWN',
  offline: 'NET_OFFLINE',
  down: 'AI_SERVICE_DOWN',
  signed_out: 'AI_SIGNED_OUT',
  limit: 'AI_LIMIT',
  key_invalid: 'AI_KEY_INVALID',
  unverified: 'AI_SERVICE_DOWN',
};

/** What recovery needs from the runner (public seams of JobRunner). */
export interface RecoveryRunner {
  launch(jobId: string): void;
  track<T>(p: Promise<T>): Promise<T>;
  startNext(): Promise<void>;
  /** fail_streak + 1; at 3 the stuck seam takes over. True when the job's loop must end. */
  countFailure(job: JobRow): Promise<boolean>;
  writeMirrors(jobId: string): Promise<void>;
  /** Aborts the job's running loop: a turn still in flight returns and its decision is dropped. */
  halt(jobId: string): void;
  // M5 T10: the foo (or helper) text message tied to the job, as every runner message is written.
  textOp(job: Pick<JobRow, 'chatId' | 'ownerId'> & { id: string | null }, text: string): DbOp;
}

export interface RecoveryAi {
  pick(): { providerId: ProviderId; billing: 'plan' | 'key' | 'local'; backup: boolean } | null;
  status(): AiStatus;
  verify(providerId: ProviderId): Promise<{ ok: boolean }>;
}

export interface RecoveryDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'k' | 'm'): string;
  settings(): Settings;
  ai: RecoveryAi;
  log(evt: string, kind?: string, ids?: { chatId?: string; jobId?: string }): void;
}

export interface LaunchInfo {
  safeMode: boolean;
  /** The previous exit was clean (queued jobs stay queued); false after a crash or an engine restart. */
  cleanStart: boolean;
}

type Hold = 'safe_mode' | 'asleep' | 'quitting';

export class JobRecovery {
  private runner: RecoveryRunner | null = null;
  private holds = new Set<Hold>();
  private online = true;

  constructor(private d: RecoveryDeps) {}

  attach(runner: RecoveryRunner): void {
    this.runner = runner;
  }
  private get r(): RecoveryRunner {
    if (!this.runner) throw new Error('JobRecovery used before attach()');
    return this.runner;
  }

  /** Nothing starts while foo is in safe mode, the PC sleeps or foo is quitting (08-2 §5.9 step 1, 09 §9.22). */
  held(): boolean {
    return this.holds.size > 0;
  }

  // ---- db helpers ----

  private tx(ops: DbOp[]): Promise<Result<DbTxReply>> {
    return this.d.link.request<DbTxReply>('db.tx', { ops });
  }
  private async query<T>(q: string, ...args: unknown[]): Promise<T | null> {
    const res = await this.d.link.request<T>('db.query', { q, args });
    return res.ok ? res.value : null;
  }
  private job(id: string): Promise<JobRow | null> {
    return this.query<JobRow>('jobById', id);
  }
  private async jobsIn(states: JobState[]): Promise<JobRow[]> {
    return (await this.query<JobRow[]>('jobsByState', states)) ?? [];
  }
  private async steps(jobId: string): Promise<StepRow[]> {
    return (await this.query<StepRow[]>('stepsForJob', jobId)) ?? [];
  }
  private badgeOp(job: JobRow, to: JobState): DbOp[] {
    return job.userMessageId ? [{ op: 'update', table: 'messages', id: job.userMessageId, set: { badge: BADGE_OF_STATE[to] } }] : [];
  }
  private async cardsOf(job: JobRow, type: string): Promise<CardRow[]> {
    const open = (await this.query<CardRow[]>('cards.openForChat', job.chatId, type)) ?? [];
    return open.filter((c) => c.payload.jobId === job.id);
  }
  /** The checklist renders from the job and its steps; an empty update bumps its rev so it re-renders in place. */
  private async checklistOps(job: JobRow, state?: string): Promise<DbOp[]> {
    const [card] = await this.cardsOf(job, 'checklist');
    return card ? [{ op: 'update', table: 'cards', id: card.id, set: state ? { state } : {} }] : [];
  }
  private cardOps(chatId: string, payload: Record<string, unknown>, jobId: string | null, ownerId: string | null) {
    const cardId = this.d.newId('k');
    const messageId = this.d.newId('m');
    const now = this.d.clock.now();
    const ops: DbOp[] = [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: messageId,
          chat_id: chatId,
          author_kind: ownerId ? 'helper' : 'foo',
          author_id: ownerId,
          kind: 'card',
          card_id: cardId,
          job_id: jobId,
          status: 'complete',
          created_at: now,
        },
      },
      {
        op: 'insert',
        table: 'cards',
        row: {
          id: cardId,
          chat_id: chatId,
          message_id: messageId,
          job_id: jobId,
          type: 'error',
          state: 'asking',
          payload,
          // M5 T7: 08-1 §3.2 card nonces are 32 hex (card:answer refuses any other, IPC_REJECTED).
          nonce: newNonce(),
          created_at: now,
        },
      },
    ];
    return { cardId, ops };
  }
  private time(at: number): string {
    return formatTime(at, { timeZone: this.d.settings().locale.timeZone });
  }
  private stepNo(job: JobRow, steps: StepRow[]): number {
    const live = steps.filter((s) => s.state !== 'skipped');
    const current = live.findIndex((s) => s.state === 'running' || s.state === 'waiting_user' || s.state === 'pending');
    return current >= 0 ? current + 1 : Math.max(1, Math.min(job.stepCount, (job.currentStepIdx ?? 0) + 1));
  }

  // ---- 08-3 §21.2 error card words per kind (literal t() calls so check:copy sees every key) ----

  private errorPayload(kind: AiErrorKind, job: JobRow, n: number): Record<string, unknown> | null {
    const status = this.d.ai.status();
    const AI = status.displayName;
    const providerId = status.primary;
    let words: { kind: ErrorKind; whatHappened: string; whatIsSafe: string; label: string; action: FixAction };
    switch (kind) {
      case 'NET_OFFLINE':
        // 05-3 §5.20: offline is shown only by the app banner strip and the composer placeholder (X-13).
        return null;
      case 'AI_SERVICE_DOWN':
        words = {
          kind,
          whatHappened: t('errors.ai_service_down.what_happened', { AI }),
          whatIsSafe: t('errors.ai_service_down.what_is_safe', { job: job.title, n }),
          label: t('errors.ai_service_down.button'),
          action: { kind: 'retry' },
        };
        break;
      case 'AI_SIGNED_OUT':
        words = {
          kind,
          whatHappened: t('errors.ai_signed_out.what_happened', { AI }),
          whatIsSafe: t('errors.ai_signed_out.what_is_safe'),
          label: t('errors.ai_signed_out.button'),
          action: providerId ? { kind: 'sign_in_ai', providerId } : { kind: 'retry' },
        };
        break;
      case 'AI_KEY_INVALID':
        words = {
          kind,
          whatHappened: t('errors.ai_key_invalid.what_happened', { AI }),
          whatIsSafe: t('errors.ai_key_invalid.what_is_safe'),
          label: t('errors.ai_key_invalid.button'),
          action: providerId ? { kind: 'replace_key', providerId } : { kind: 'retry' },
        };
        break;
      case 'AI_LIMIT':
        words =
          status.resetAt !== undefined
            ? {
                kind,
                whatHappened: t('errors.ai_limit.what_happened', { AI, time: this.time(status.resetAt) }),
                whatIsSafe: t('errors.ai_limit.what_is_safe'),
                label: t('errors.ai_limit.button', { time: this.time(status.resetAt) }),
                action: { kind: 'remind_at', at: status.resetAt },
              }
            : {
                kind,
                whatHappened: t('errors.ai_limit.what_happened.no_reset', { AI }),
                whatIsSafe: t('errors.ai_limit.what_is_safe.no_reset'),
                label: t('errors.ai_limit.button.no_reset'),
                action: { kind: 'retry' },
              };
        break;
      default:
        words = {
          kind: 'UNKNOWN',
          whatHappened: t('errors.unknown.what_happened'),
          whatIsSafe: t('errors.unknown.what_is_safe'),
          label: t('errors.unknown.button'),
          action: { kind: 'retry' },
        };
    }
    return {
      variant: 'error',
      kind: words.kind,
      whatHappened: words.whatHappened,
      whatIsSafe: words.whatIsSafe,
      button: { label: words.label, action: words.action },
      jobId: job.id,
      atStep: n,
    };
  }

  // ---- WORKING → WAITING ----

  /** The runner's `onAiError` hook (08-2 §6.7). */
  async onAiError(job: JobRow, kind: AiErrorKind): Promise<void> {
    const reason = WAITING_OF_KIND[kind];
    const pick = this.d.ai.pick();
    // One failure in a row does not rest the provider (2 in a row do, AiService): the turn counts as one failed turn and
    // the loop goes on; so do AI_TIMEOUT, PROTOCOL_INVALID and every kind with no WAITING effect.
    const usable = pick !== null && (!pick.backup || job.intent === 'read_only');
    if (!reason || (usable && (kind === 'NET_OFFLINE' || kind === 'AI_SERVICE_DOWN'))) {
      if (!(await this.r.countFailure(job))) this.r.launch(job.id);
      return;
    }
    await this.pause(job.id, reason, kind);
  }

  /** The runner's `onCannotStart` hook: a queued job whose AI is unavailable or whose verify failed (AT-106 → WAITING). */
  async onCannotStart(job: JobRow, kind?: string): Promise<void> {
    const k = (kind as AiErrorKind | undefined) ?? (this.online ? KIND_OF_STATE[this.d.ai.status().state] : 'NET_OFFLINE');
    const reason = WAITING_OF_KIND[k] ?? 'ai_down';
    // The machine has no queued → waiting: the job starts and pauses in the same transaction (slot_free, then pause).
    await this.pause(job.id, reason, k, ['queued']);
  }

  /** WORKING (or QUEUED, see onCannotStart) → WAITING with its reason; one error card per job and outage (AT-112). */
  async pause(jobId: string, reason: WaitingReason, kind?: AiErrorKind, startFrom: JobState[] = []): Promise<boolean> {
    const job = await this.job(jobId);
    if (!job) return false;
    const fromQueued = startFrom.includes(job.state);
    if (job.state !== 'working' && !fromQueued) return false;
    const steps = await this.steps(jobId);
    const n = this.stepNo(job, steps);
    const now = this.d.clock.now();
    const ops: DbOp[] = [];
    if (fromQueued) {
      const first = steps.find((s) => s.state === 'pending' || s.state === 'running');
      ops.push({
        op: 'transition',
        table: 'jobs',
        id: jobId,
        from: ['queued'],
        to: 'working',
        set: { started_at: job.startedAt ?? now, current_step_idx: first?.idx ?? null },
      });
      if (first && first.state === 'pending')
        ops.push({ op: 'update', table: 'steps', id: first.id, set: { state: 'running', started_at: now } });
    }
    ops.push({ op: 'transition', table: 'jobs', id: jobId, from: ['working'], to: 'waiting', set: { waiting_reason: reason } });
    ops.push(...this.badgeOp(job, 'waiting'));
    const payload = kind && !QUIET_REASONS.has(reason) ? this.errorPayload(kind, job, n) : null;
    if (payload) {
      const [open] = (await this.cardsOf(job, 'error')).filter((c) => c.state === 'asking');
      if (open) ops.push({ op: 'update', table: 'cards', id: open.id, set: { payload } });
      else ops.push(...this.cardOps(job.chatId, payload, job.id, job.ownerId).ops);
    }
    ops.push(...(await this.checklistOps(job)));
    const res = await this.tx(ops);
    if (!res.ok) return false;
    // A WAITING job does nothing: the turn in flight is dropped, and resume starts the loop again (08-2 §5.8).
    this.r.halt(jobId);
    this.d.log('job.waiting', kind ?? reason, { jobId, chatId: job.chatId });
    await this.r.writeMirrors(jobId);
    return true;
  }

  /** 08-1 §2.3 steps 4–5, 09 §9.22 sleep: every WORKING job → WAITING with the reason; nothing starts afterwards. */
  async pauseAll(reason: 'app_quit' | 'windows_shutdown' | 'asleep'): Promise<string[]> {
    return this.r.track(
      (async () => {
        this.holds.add(reason === 'asleep' ? 'asleep' : 'quitting');
        const paused: string[] = [];
        for (const job of await this.jobsIn(['working'])) if (await this.pause(job.id, reason)) paused.push(job.id);
        return paused;
      })(),
    );
  }

  // ---- WAITING → WORKING ----

  private cleared(job: JobRow): boolean {
    const reason = job.waitingReason;
    if (!reason || NOT_MINE.has(reason)) return false;
    if (reason === 'asleep' && this.holds.has('asleep')) return false;
    const pick = this.d.ai.pick();
    return pick !== null && (!pick.backup || job.intent === 'read_only');
  }

  /**
   * Called by the runner before it starts queued jobs (`beforeSchedule`): waiting jobs whose condition cleared go back to
   * WORKING first (they were started earlier), FIFO, within the 3 WORKING slots. False holds every start.
   */
  async beforeSchedule(): Promise<boolean> {
    if (this.held()) return false;
    const waiting = (await this.jobsIn(['waiting'])).filter((j) => this.cleared(j)).sort((a, b) => a.createdAt - b.createdAt);
    if (!waiting.length) return true;
    const pick = this.d.ai.pick();
    if (!pick) return true;
    // 08-4 §26.10: resume as soon as the AI is available, verified within 10 min.
    const lastVerifiedAt = this.d.settings().ai.providers[pick.providerId]?.lastVerifiedAt;
    if (needsVerify(lastVerifiedAt, this.d.clock.now())) {
      const v = await this.d.ai.verify(pick.providerId).catch(() => ({ ok: false }));
      if (!v.ok) return true;
    }
    let working = (await this.jobsIn(['working'])).length;
    for (const job of waiting) {
      if (working >= MAX_WORKING) break;
      if (await this.resume(job)) working += 1;
    }
    return true;
  }

  /** WAITING → WORKING: the error card is edited in place ("Back on it. Picking up from step {n}.", SM-A10); no new message. */
  async resume(job: JobRow): Promise<boolean> {
    const steps = await this.steps(job.id);
    const n = this.stepNo(job, steps);
    const now = this.d.clock.now();
    const ops: DbOp[] = [
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['waiting'],
        to: 'working',
        set: { waiting_reason: null, last_progress_at: now },
      },
      ...this.badgeOp(job, 'working'),
    ];
    for (const card of (await this.cardsOf(job, 'error')).filter((c) => c.state === 'asking' && c.payload.variant === 'error'))
      ops.push({
        op: 'update',
        table: 'cards',
        id: card.id,
        set: {
          state: 'fixed',
          payload: { ...card.payload, resumedLine: t('cards.checklist.resumed', { n }) },
          resolved_by: 'system',
          resolved_at: now,
        },
      });
    ops.push(...(await this.checklistOps(job)));
    const res = await this.tx(ops);
    if (!res.ok) return false;
    this.d.log('job.resumed', job.waitingReason ?? undefined, { jobId: job.id, chatId: job.chatId });
    await this.r.writeMirrors(job.id);
    this.r.launch(job.id);
    return true;
  }

  // ---- events from main ----

  netChanged(online: boolean): Promise<void> {
    this.online = online;
    return this.r.track(
      (async () => {
        if (!online) {
          // AT-081: within 10 s of the network dropping (main's NetMonitor), every WORKING job waits; the banner says why.
          for (const job of await this.jobsIn(['working'])) await this.pause(job.id, 'net_offline', 'NET_OFFLINE');
        } else await this.r.startNext();
      })(),
    );
  }

  /** 09 §9.22 power events. */
  async power(event: string): Promise<void> {
    if (event === 'suspend') await this.pauseAll('asleep');
    else if (event === 'shutdown') await this.pauseAll('windows_shutdown');
    else if (event === 'resume') {
      this.holds.delete('asleep');
      await this.r.startNext();
    }
  }

  // ---- 08-2 §5.9 recovery on engine start ----

  async recoverAll(launch: LaunchInfo): Promise<void> {
    return this.r.track(this.recoverInner(launch));
  }

  private async recoverInner(launch: LaunchInfo): Promise<void> {
    if (launch.safeMode) {
      this.holds.add('safe_mode');
      await this.postSafeMode();
    }
    // Step 5: side-effect calls that started and never finished are `unknown` (never repeated blindly).
    const unknown = (await this.query<{ id: string; outcome: string | null }[]>('toolCallsUnknown')) ?? [];
    const marks = unknown
      .filter((c) => c.outcome === null)
      .map((c): DbOp => ({ op: 'update', table: 'tool_calls', id: c.id, set: { outcome: 'unknown' } }));
    if (marks.length) await this.tx(marks);
    // Step 3: WORKING (always an unclean exit: a clean quit pauses them) and, after an unclean exit, QUEUED. In safe mode too
    // (M5 T10, CR-0009 G-M5-22): a recovery card starts nothing, so a job that was working shows it is waiting on the user
    // instead of a working job with nothing running; the hold keeps every start back until "Start normally".
    const found = await this.jobsIn(launch.cleanStart ? ['working'] : ['working', 'queued']);
    for (const job of found) await this.recoveryCard(job);
    if (launch.safeMode) return;
    // Step 4: WAITING jobs are re-evaluated by the next schedule pass (beforeSchedule).
    await this.r.startNext();
  }

  private async recoveryCard(job: JobRow): Promise<void> {
    const steps = await this.steps(job.id);
    const n = this.stepNo(job, steps);
    const at = Math.max(job.lastProgressAt ?? 0, job.startedAt ?? 0, job.createdAt);
    const done = (await this.query<ActivityRow[]>('activityForJob', job.id)) ?? [];
    const payload = {
      variant: 'recovery',
      kind: 'CRASH_RECOVERY',
      whatHappened: t('errors.crash_recovery.what_happened', { time: this.time(at) }),
      whatIsSafe: t('errors.crash_recovery.what_is_safe', { job: job.title, n, of: job.stepCount }),
      button: { label: t('errors.crash_recovery.button'), action: { kind: 'resume_job' } },
      secondary: { label: t('errors.crash_recovery.link'), action: { kind: 'stop' } },
      jobId: job.id,
      atStep: n,
      of: job.stepCount,
      doneLines: done.map((a) => a.summary).filter(Boolean),
    };
    const { cardId, ops } = this.cardOps(job.chatId, payload, job.id, job.ownerId);
    const current = steps.find((s) => s.state === 'running');
    const res = await this.tx([
      ...ops,
      { op: 'transition', table: 'jobs', id: job.id, from: ['working', 'queued'], to: 'needs_you', set: { needs_you_card_id: cardId } },
      ...(current ? [{ op: 'update', table: 'steps', id: current.id, set: { state: 'waiting_user' } } as DbOp] : []),
      ...this.badgeOp(job, 'needs_you'),
      ...(await this.checklistOps(job)),
    ]);
    if (res.ok) await this.r.writeMirrors(job.id);
  }

  private async postSafeMode(): Promise<void> {
    const chatId = await this.query<string>('chats.foo');
    if (!chatId) return;
    const open = (await this.query<CardRow[]>('cards.openForChat', chatId, 'error')) ?? [];
    if (open.some((c) => c.payload.kind === 'SAFE_MODE')) return;
    const agentName = this.d.settings().identity.agentName;
    const payload = {
      variant: 'error',
      kind: 'SAFE_MODE',
      whatHappened: t('errors.safe_mode.what_happened', { agentName }),
      whatIsSafe: t('errors.safe_mode.what_is_safe'),
      button: { label: t('errors.safe_mode.button'), action: { kind: 'start_normally' } },
    };
    await this.tx(this.cardOps(chatId, payload, null, null).ops);
  }

  /**
   * card.answered on a card this file owns: the recovery card (resume | stop), the safe-mode card (start_normally) and a
   * waiting job's error card (retry = re-test the AI now). False when the card is not one of them (the runner handles it).
   */
  async onCardAnswered(a: { cardId: string; choice?: string; resolvedBy: string }): Promise<boolean> {
    const card = await this.query<CardRow>('cardById', a.cardId);
    if (!card || card.type !== 'error' || card.resolvedAt !== null) return false;
    const now = this.d.clock.now();
    const resolve = { resolved_by: a.resolvedBy, resolved_at: now };
    if (card.payload.kind === 'SAFE_MODE') {
      if (a.choice !== 'start_normally') return true;
      await this.tx([{ op: 'update', table: 'cards', id: card.id, set: { state: 'fixed', ...resolve } }]);
      this.holds.delete('safe_mode');
      await this.recoverAll({ safeMode: false, cleanStart: false });
      return true;
    }
    const job = card.jobId ? await this.job(card.jobId) : null;
    if (!job) return false;
    if (card.payload.variant === 'recovery') {
      if (job.state !== 'needs_you' || job.needsYouCardId !== card.id) return true;
      if (a.choice === 'resume') {
        // The answered card lets the runner's schedule pass resume the job when a slot is free (NEEDS_YOU → WORKING).
        await this.tx([
          { op: 'update', table: 'cards', id: card.id, set: { state: 'resumed', ...resolve, answer: { optionId: 'resume' } } },
        ]);
        await this.r.startNext();
      } else if (a.choice === 'stop') await this.stopRecovered(job, card, resolve);
      return true;
    }
    if (job.state === 'waiting' && a.choice === 'retry') {
      const primary = this.d.ai.status().primary;
      if (primary) await this.d.ai.verify(primary).catch(() => undefined);
      await this.r.startNext();
      return true;
    }
    return false;
  }

  /**
   * "Stop it" on the recovery card: NEEDS_YOU → CANCELLED (user_button), badge ⛔, checklist stopped, and like every stop the
   * activity line `stopped_job` and the J18 report from the job's activity rows (08-2 §5.7 steps 3–4; M5 T10, CR-0008 (j) row 10).
   */
  private async stopRecovered(job: JobRow, card: CardRow, resolve: Record<string, unknown>): Promise<void> {
    const now = this.d.clock.now();
    const steps = await this.steps(job.id);
    const activity = (await this.query<ActivityRow[]>('activityForJob', job.id)) ?? [];
    const report = stopReportText(activity, { timeZone: this.d.settings().locale.timeZone });
    const res = await this.tx([
      { op: 'update', table: 'cards', id: card.id, set: { state: 'stopped', ...resolve, answer: { optionId: 'stop' } } },
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['needs_you'],
        to: 'cancelled',
        set: { needs_you_card_id: null, stop_reason: 'user_button', finished_at: now },
      },
      ...steps
        .filter((s) => s.state === 'waiting_user' || s.state === 'pending' || s.state === 'running')
        .map((s): DbOp => ({ op: 'update', table: 'steps', id: s.id, set: { state: 'skipped' } })),
      ...this.badgeOp(job, 'cancelled'),
      ...(await this.checklistOps(job, 'stopped')),
      {
        op: 'activity',
        row: activityRow({
          kind: 'stopped',
          event: 'stopped_job',
          actor: 'user',
          chatId: job.chatId,
          jobId: job.id,
          summary: `Stopped "${job.title}"`,
          outcome: 'done',
        }),
      },
      this.r.textOp(job, report),
    ]);
    if (res.ok) await this.r.writeMirrors(job.id);
  }
}
