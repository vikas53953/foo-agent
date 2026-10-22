// Spec: 08-3 §21.2 rows `CONN_EXPIRED` (WAITING for the jobs needing it; "Your {app} connection expired." / "Bills and drafts
// are on hold." [ Reconnect ] · `reconnect` app google; {app} = the app the job was using, INT-28), `CONN_REVOKED` (same
// effect, "Google no longer lets me use your {app}."; also a 401 right after a successful refresh), `CONN_RATE_LIMITED` (the
// tool call fails; the step is retried once after 60 s, then counts toward STUCK; [ Try again ] · `retry`), §21.3
// `CONN_SCOPE_MISSING` (renderer-handled: the job shows the line `errors.conn_scope_missing.line`), §16.1 Tokens
// (`invalid_grant` → the three Google rows `needs_signin`; main writes them), §16.1.3 (the Gmail poller runs while connected;
// at login it waits 20 s; `resume` polls at once), §16.7 (Contacts sync), 07-2 SM-A10 (WAITING → WORKING edits the error card
// in place, "Back on it. Picking up from step {n}.", never a new message), 05-3 §5.20.2 (the copy), G-M8-10 (emoji are
// icons), 08-1 §2.4 (the engine never writes `connections`), 08-4 §27.1 (the catalogue lists only connected apps' tools).
// Gap picks T5-01…T5-05 (implementation-notes "M8 T5"): main holds the Google token and answers `connection.google`; jobs
// waiting on a connection keep `waiting_reason` NULL (WaitingReason has no connection member) and are found by their open
// CONN_* error card.
import { newNonce } from '../../shared/canon';
import { t } from '../../shared/copy/t';
import type { Clock, TimerId } from '../../shared/clock';
import { BADGE_OF_STATE } from '../../shared/jobMachine';
import type { CardRow, ErrorKind, JobRow, JobState, StepRow } from '../../shared/types';
import type { DbOp, DbTxReply, GoogleConnState, GoogleEngineReq, MainLink } from '../protocol';
import type { Result } from '../../shared/errors';
import { MAX_WORKING } from '../jobs/queue';
import type { RecoveryRunner } from '../jobs/recovery';
import type { GoogleConnectors, GoogleOptions } from '../tools/connectors/google-tools';
import { GoogleAccessError } from '../tools/connectors/google';
import type { GoogleBases } from '../tools/connectors/limiter';

/** The step waits this long after Google asks foo to slow down, then tries once more (08-3 §21.2). */
export const RATE_RETRY_MS = 60_000;

type GoogleApp = 'gmail' | 'gcal' | 'contacts';
type LostKind = 'CONN_EXPIRED' | 'CONN_REVOKED';
const LOST: ReadonlySet<string> = new Set<LostKind>(['CONN_EXPIRED', 'CONN_REVOKED']);

/** The Google app a tool belongs to, or null for any other tool. */
export function appOfTool(tool: string): GoogleApp | null {
  if (tool.startsWith('gmail.')) return 'gmail';
  if (tool.startsWith('gcal.')) return 'gcal';
  if (tool.startsWith('contacts.')) return 'contacts';
  return null;
}

const appName = (app: GoogleApp): string =>
  app === 'gmail'
    ? t('settings.connections.app.gmail')
    : app === 'gcal'
      ? t('settings.connections.app.calendar')
      : t('settings.connections.app.contacts');

/** The C16 error card words for a connection kind (literal t() calls so check:copy sees every key). */
export function troublePayload(kind: LostKind | 'CONN_RATE_LIMITED', app: GoogleApp, job: Pick<JobRow, 'id'>, n: number) {
  const name = appName(app);
  const words =
    kind === 'CONN_EXPIRED'
      ? {
          whatHappened: t('errors.conn_expired.what_happened', { app: name }),
          whatIsSafe: t('errors.conn_expired.what_is_safe'),
          label: t('errors.conn_expired.button'),
        }
      : kind === 'CONN_REVOKED'
        ? {
            whatHappened: t('errors.conn_revoked.what_happened', { app: name }),
            whatIsSafe: t('errors.conn_revoked.what_is_safe'),
            label: t('errors.conn_revoked.button'),
          }
        : {
            whatHappened: t('errors.conn_rate_limited.what_happened', { app: name }),
            whatIsSafe: t('errors.conn_rate_limited.what_is_safe'),
            label: t('errors.conn_rate_limited.button'),
          };
  return {
    variant: 'error' as const,
    kind,
    whatHappened: words.whatHappened,
    whatIsSafe: words.whatIsSafe,
    button: {
      label: words.label,
      action: kind === 'CONN_RATE_LIMITED' ? { kind: 'retry' as const } : { kind: 'reconnect' as const, app: 'google' as const },
    },
    jobId: job.id,
    atStep: n,
  };
}

/** The `{calendar}` slot of `errors.conn_scope_missing.line`: what foo may not see yet. */
const SCOPE_NOUN: Record<GoogleApp, string> = { gmail: 'Gmail', gcal: 'calendar', contacts: 'contacts' };

export interface TroubleDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'k' | 'm'): string;
  log(evt: string, kind?: string, ids?: { chatId?: string; jobId?: string }): void;
}

/** What the trouble handler uses of the runner (the same public seams recovery uses). */
export type TroubleRunner = Pick<RecoveryRunner, 'launch' | 'halt' | 'track' | 'startNext' | 'writeMirrors' | 'textOp'>;

/**
 * Connection trouble for jobs (08-3 §21.2–§21.3) and the start / stop of the Gmail poller and Contacts sync with the Google
 * rows. Main tells it the rows' state (`connection.state`); it never writes `connections`.
 */
export class ConnTrouble {
  private runner: TroubleRunner | null = null;
  private google: GoogleConnectors | null = null;
  /** Null until main answered: the state is unknown (a FOO_TEST run with the fixed fake token never asks). */
  private state: GoogleConnState | null = null;
  private atLogin = true;
  /** The Google tools take main's access (linkOptions): their catalogue lines follow the rows. */
  private viaMain = false;
  /** `{jobId}|{stepId}` of steps already retried after a rate limit (once each, then STUCK counts it). */
  private rateRetried = new Set<string>();
  private rateTimers = new Map<string, TimerId>();
  /** Jobs already told a scope is missing, by `{jobId}|{app}` (one line per job and app). */
  private scopeTold = new Set<string>();

  constructor(private d: TroubleDeps) {}

  attach(runner: TroubleRunner, google: GoogleConnectors | null): void {
    this.runner = runner;
    this.google = google;
  }
  private get r(): TroubleRunner {
    if (!this.runner) throw new Error('ConnTrouble used before attach()');
    return this.runner;
  }

  // ---- the link to main (gap pick T5-01) ----

  private ask<T>(req: GoogleEngineReq): Promise<Result<T>> {
    return this.d.link.request<T>('connection.google', req).catch((): Result<T> => ({ ok: false, error: { kind: 'UNKNOWN' } }));
  }

  /**
   * The engine's GoogleOptions when main holds the token: every access token, refresh and scope refusal is main's, and the
   * poller's history baseline is the gmail row's `history_id` (main writes it).
   */
  linkOptions(o: { bases?: Partial<GoogleBases>; contactsOn(): boolean; online(): boolean }): GoogleOptions {
    this.viaMain = true;
    const token = async (op: 'token' | 'refresh'): Promise<string> => {
      const r = await this.ask<string>({ op });
      if (r.ok && typeof r.value === 'string') return r.value;
      throw new GoogleAccessError(r.ok ? 'UNKNOWN' : r.error.kind);
    };
    return {
      access: {
        accessToken: () => token('token'),
        refreshAfter401: () => token('refresh'),
        scopeMissing: async (flag) => void (await this.ask({ op: 'scopeMissing', flag })),
        // "Open in Gmail" `authuser` is main's (DraftService); the engine's calls never need the address.
        email: () => null,
      },
      ...(o.bases ? { bases: o.bases } : {}),
      contactsConnectionId: () => this.state?.contactsConnectionId ?? null,
      contactsOn: o.contactsOn,
      online: o.online,
      historyStore: {
        load: async () => {
          const r = await this.ask<string | null>({ op: 'history' });
          return r.ok ? r.value : null;
        },
        save: async (historyId) => {
          const r = await this.ask({ op: 'saveHistory', historyId });
          if (!r.ok) throw new GoogleAccessError(r.error.kind);
        },
      },
    };
  }

  /** At engine start: main's current rows (a restart while connected starts the poller after the login delay). */
  async boot(): Promise<void> {
    const r = await this.ask<GoogleConnState>({ op: 'state' });
    if (r.ok && r.value) await this.onState(r.value);
  }

  /** 08-4 §27.1: Google tools are listed while a Google connection exists (connected, or waiting for its sign-in). */
  listed(tool: string): boolean {
    if (!appOfTool(tool) || !this.viaMain) return true;
    return (this.state?.status ?? 'disconnected') !== 'disconnected';
  }

  /** C1 T2 (04 §13.7): Gmail is connected now (not waiting for sign-in); a test run on the fixed fake token counts as connected. */
  gmailConnected(): boolean {
    return !this.viaMain || this.state?.status === 'connected';
  }

  /**
   * CR-0040: main holds the Google token and said Google is not connected (no rows, or disconnected): a job needing it asks
   * first. Before main's first answer the state is unknown and the job starts as before.
   */
  googleMissing(): boolean {
    return this.viaMain && this.state?.status === 'disconnected';
  }

  // ---- main's `connection.state` ----

  async onState(s: GoogleConnState): Promise<void> {
    const was = this.state?.status;
    this.state = s;
    const g = this.google;
    if (g) {
      if (s.status === 'connected') {
        // 09 §9.7: at login the first poll waits 20 s; a sign-in during the run polls (baselines) at once.
        if (was !== 'connected') g.poller.start({ atLogin: this.atLogin });
        if (s.contactsConnectionId) g.contactsSync.start();
        else g.contactsSync.stop();
      } else {
        g.poller.stop();
        g.contactsSync.stop();
      }
    }
    this.atLogin = false;
    // Reconnected: jobs waiting on the connection resume (the next schedule pass, within the WORKING slots).
    if (s.status === 'connected' && was !== 'connected') await this.r.startNext();
  }

  /** 09 §9.22: sleep holds the poller; `resume` polls at once (08-3 §16.1.3). */
  power(event: string): void {
    if (event === 'suspend') this.google?.poller.suspend();
    else if (event === 'resume') this.google?.poller.resume();
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
  private async steps(jobId: string): Promise<StepRow[]> {
    return (await this.query<StepRow[]>('stepsForJob', jobId)) ?? [];
  }
  private badgeOp(job: JobRow, to: JobState): DbOp[] {
    return job.userMessageId ? [{ op: 'update', table: 'messages', id: job.userMessageId, set: { badge: BADGE_OF_STATE[to] } }] : [];
  }
  private async openErrorCards(job: JobRow): Promise<CardRow[]> {
    const open = (await this.query<CardRow[]>('cards.openForChat', job.chatId, 'error')) ?? [];
    return open.filter((c) => c.payload.jobId === job.id && c.state === 'asking' && c.payload.variant === 'error');
  }
  private async checklistOps(job: JobRow): Promise<DbOp[]> {
    const open = (await this.query<CardRow[]>('cards.openForChat', job.chatId, 'checklist')) ?? [];
    const card = open.find((c) => c.payload.jobId === job.id);
    return card ? [{ op: 'update', table: 'cards', id: card.id, set: {} }] : [];
  }
  private stepNo(job: JobRow, steps: StepRow[]): number {
    const live = steps.filter((s) => s.state !== 'skipped');
    const current = live.findIndex((s) => s.state === 'running' || s.state === 'waiting_user' || s.state === 'pending');
    return current >= 0 ? current + 1 : Math.max(1, Math.min(job.stepCount, (job.currentStepIdx ?? 0) + 1));
  }
  /** One error card per job: an open one is edited in place, else a new card message (05-3 §5.20). */
  private cardOps(job: JobRow, payload: Record<string, unknown>, open: CardRow | undefined): DbOp[] {
    if (open) return [{ op: 'update', table: 'cards', id: open.id, set: { payload } }];
    const cardId = this.d.newId('k');
    const messageId = this.d.newId('m');
    const now = this.d.clock.now();
    return [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: messageId,
          chat_id: job.chatId,
          author_kind: job.ownerId ? 'helper' : 'foo',
          author_id: job.ownerId,
          kind: 'card',
          card_id: cardId,
          job_id: job.id,
          status: 'complete',
          created_at: now,
        },
      },
      {
        op: 'insert',
        table: 'cards',
        row: {
          id: cardId,
          chat_id: job.chatId,
          message_id: messageId,
          job_id: job.id,
          type: 'error',
          state: 'asking',
          payload,
          nonce: newNonce(),
          created_at: now,
        },
      },
    ];
  }

  // ---- the runner's `onToolError` hook ----

  /** A tool failed with `kind`. True when the trouble handler took the job over (the runner's loop ends this turn). */
  async onToolError(job: JobRow, tool: string, kind: ErrorKind, stepId: string | null): Promise<boolean> {
    const app = appOfTool(tool);
    if (!app) return false;
    if (LOST.has(kind)) {
      // §16.1 Tokens: main marks the three rows needs_signin (a no-op when its own refresh already did).
      await this.ask({ op: 'lost', kind: kind as LostKind });
      // Main pushes needs_signin before it answers; set it here too so beforeSchedule never resumes on a stale "connected".
      if (this.state?.status === 'connected') this.state = { ...this.state, status: 'needs_signin' };
      return this.pauseLost(job.id, kind as LostKind, app);
    }
    if (kind === 'CONN_RATE_LIMITED') return this.rateLimited(job, app, stepId);
    if (kind === 'CONN_SCOPE_MISSING') await this.scopeMissing(job, app);
    return false;
  }

  /** WORKING → WAITING with the job's one CONN card; `waiting_reason` stays NULL (gap pick T5-02). */
  private async pauseLost(jobId: string, kind: LostKind, app: GoogleApp): Promise<boolean> {
    const job = await this.job(jobId);
    if (!job || job.state !== 'working') return false;
    const n = this.stepNo(job, await this.steps(jobId));
    const [open] = await this.openErrorCards(job);
    const res = await this.tx([
      { op: 'transition', table: 'jobs', id: jobId, from: ['working'], to: 'waiting', set: { waiting_reason: null } },
      ...this.badgeOp(job, 'waiting'),
      ...this.cardOps(job, troublePayload(kind, app, job, n), open),
      ...(await this.checklistOps(job)),
    ]);
    if (!res.ok) return false;
    this.r.halt(jobId);
    this.d.log('job.waiting', kind, { jobId, chatId: job.chatId });
    await this.r.writeMirrors(jobId);
    return true;
  }

  /** §21.2: the card, then one more try of the step after 60 s; a second limit on the same step goes to STUCK as usual. */
  private async rateLimited(job: JobRow, app: GoogleApp, stepId: string | null): Promise<boolean> {
    const key = `${job.id}|${stepId ?? ''}`;
    if (this.rateRetried.has(key)) return false;
    this.rateRetried.add(key);
    const n = this.stepNo(job, await this.steps(job.id));
    const [open] = await this.openErrorCards(job);
    const res = await this.tx(this.cardOps(job, troublePayload('CONN_RATE_LIMITED', app, job, n), open));
    if (!res.ok) return false;
    this.r.halt(job.id);
    this.d.log('job.rate_limited', 'CONN_RATE_LIMITED', { jobId: job.id, chatId: job.chatId });
    this.rateTimers.set(
      job.id,
      this.d.clock.setTimeout(() => void this.r.track(this.retryNow(job.id)), RATE_RETRY_MS),
    );
    return true;
  }

  /** The rate-limit wait ended (or [ Try again ]): the card says "Back on it" and the step runs again. */
  private async retryNow(jobId: string): Promise<void> {
    const timer = this.rateTimers.get(jobId);
    if (timer === undefined) return;
    this.d.clock.clearTimeout(timer);
    this.rateTimers.delete(jobId);
    const job = await this.job(jobId);
    if (!job || job.state !== 'working') return;
    const n = this.stepNo(job, await this.steps(jobId));
    const now = this.d.clock.now();
    const cards = (await this.openErrorCards(job)).filter((c) => c.payload.kind === 'CONN_RATE_LIMITED');
    if (cards.length)
      await this.tx(
        cards.map((c): DbOp => ({
          op: 'update',
          table: 'cards',
          id: c.id,
          set: {
            state: 'fixed',
            payload: { ...c.payload, resumedLine: t('cards.checklist.resumed', { n }) },
            resolved_by: 'system',
            resolved_at: now,
          },
        })),
      );
    this.r.launch(jobId);
  }

  /** §21.3: one line per job and app; Settings → Connections already shows "Not allowed yet" + Allow (main flipped the flag). */
  private async scopeMissing(job: JobRow, app: GoogleApp): Promise<void> {
    const key = `${job.id}|${app}`;
    if (this.scopeTold.has(key)) return;
    this.scopeTold.add(key);
    await this.tx([this.r.textOp(job, t('errors.conn_scope_missing.line', { calendar: SCOPE_NOUN[app] }))]);
  }

  // ---- WAITING → WORKING after Reconnect ----

  /** The runner's schedule pass: jobs waiting on the connection resume once it is back, FIFO, within the WORKING slots. */
  async beforeSchedule(): Promise<boolean> {
    if (this.state?.status !== 'connected') return true;
    const waiting = ((await this.query<JobRow[]>('jobsByState', ['waiting'])) ?? [])
      .filter((j) => j.waitingReason === null)
      .sort((a, b) => a.createdAt - b.createdAt);
    let working = ((await this.query<JobRow[]>('jobsByState', ['working'])) ?? []).length;
    for (const job of waiting) {
      if (working >= MAX_WORKING) break;
      if (await this.resume(job)) working += 1;
    }
    return true;
  }

  /** SM-A10: the CONN card is edited in place ("Back on it. Picking up from step {n}."); the job goes on at the same step. */
  private async resume(job: JobRow): Promise<boolean> {
    const cards = (await this.openErrorCards(job)).filter((c) => LOST.has(String(c.payload.kind)));
    if (!cards.length) return false;
    const n = this.stepNo(job, await this.steps(job.id));
    const now = this.d.clock.now();
    const res = await this.tx([
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['waiting'],
        to: 'working',
        set: { waiting_reason: null, last_progress_at: now },
      },
      ...this.badgeOp(job, 'working'),
      ...cards.map((c): DbOp => ({
        op: 'update',
        table: 'cards',
        id: c.id,
        set: {
          state: 'fixed',
          payload: { ...c.payload, resumedLine: t('cards.checklist.resumed', { n }) },
          resolved_by: 'system',
          resolved_at: now,
        },
      })),
      ...(await this.checklistOps(job)),
    ]);
    if (!res.ok) return false;
    this.d.log('job.resumed', cards[0]!.payload.kind as string, { jobId: job.id, chatId: job.chatId });
    await this.r.writeMirrors(job.id);
    this.r.launch(job.id);
    return true;
  }

  /** `card.answered` on a CONN card: [ Try again ] on the rate-limit card runs the step now. Reconnect is main's sign-in. */
  async onCardAnswered(a: { cardId: string; choice?: string }): Promise<boolean> {
    const card = await this.query<CardRow>('cardById', a.cardId);
    if (!card || card.type !== 'error' || card.resolvedAt !== null) return false;
    if (card.payload.kind === 'CONN_RATE_LIMITED' && a.choice === 'retry' && card.jobId) {
      await this.r.track(this.retryNow(card.jobId));
      return true;
    }
    return LOST.has(String(card.payload.kind));
  }
}
