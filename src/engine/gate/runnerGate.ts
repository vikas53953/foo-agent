// Spec: 08-2 §9.4 (the gate's outcomes in a job: REFUSE line "I'm not allowed to {row}…" and the step skipped; app_use
// Choice "Can I use {app} for this?" once per job; read-only → Choice "Want me to {action}?", a Yes adds the verb to
// do_verbs; CARD → createApproval → PENDING card → job NEEDS_YOU; on APPROVED: second look → RUNNING → EXECUTE →
// COMPLETED / FAILED / CHECKING), §9.4.3 (untrusted origin: no card, `thread.injection.blocked`), §9.1 (expired payment /
// booking → job cancelled; other verbs stay needs_you), §5.9 step 5 (RECOVERY block; no repeat until a read ran), 08-4
// §28.1 (request_approval: APPROVAL_EVIDENCE → part 8 retry line, a second → stuck rules), item 8 (write-ahead
// `approval.transition RUNNING`, then the side-effect tool exactly once; outcome classified), §29.1 (no ack in 2 s → do not
// click, HELD cannot_check), §24.22 (part 8 "Approved so far", the RECOVERY list, the retry line), 07-2 §4 (needs_you →
// cancelled `approval_expired`), AT-111 (job half), X-125, CR-0008 (j) row 6.
// M5 T8: 08-2 §9.6 (second look after APPROVED; a fail → HELD with the card's copy, the job waits on the user again; the
// action's value → APPROVED proceeds, the user's own → DECLINED and the job re-prepares, G-M5-03), §9.4.2 (fresh terms right
// before executing; a change → SUPERSEDED + a new PENDING card), 08-4 §26.5 item 3 (the next card links the superseded one).
import { t } from '../../shared/copy/t';
import { formatDate, formatInr } from '../../shared/format';
import type { ApprovalDraft, ApprovalFields, ApprovalState, CardRow, JobRow, PermissionApp } from '../../shared/types';
import type { StepDecision } from '../../shared/schemas';
import type { RunnerCore } from '../jobs/JobRunner';
import type { DbOp } from '../protocol';
import type { ExecResult, ToolLayer } from '../tools/ToolLayer';
import { approvalText } from './approvalText';
import { classOfVerb, untrustedSource } from './classes';
import type { ActionClass, GateJob, GateLogic } from './GateLogic';
import { EVIDENCE_RETRY_LINE, verifyRequestApproval, type ApprovalSnapshot } from './requestApproval';
import type { ApprovalPayload, SecondLookResult } from '../../shared/types';
import { askSecondLook, readLiveTerms, userWordsFor } from './afterApproved';
import { checkLiveTerms } from './liveTerms';
import { secondLook as runSecondLook, verbingOf } from './secondLook';

/** M5 T8: what `approval.transition` may carry (08-4 §29.1; the second look; the card's HELD / SUPERSEDED copy). */
interface TransitionData {
  submittedAt?: number;
  secondLook?: SecondLookResult;
  held?: ApprovalPayload['held'];
  superseded?: ApprovalPayload['superseded'];
}

/** 08-4 §29.1 item 2: the write-ahead must be acknowledged within 2 s, else nothing is clicked. */
export const WRITE_AHEAD_MS = 2_000;

interface OpenApproval {
  approvalId: string;
  cardId: string;
  draft: ApprovalDraft;
  submitRef: string | null;
  untrusted: string[];
  // M5 T8
  /** The user picked the action's value on its HELD card: the second look does not ask again (08-2 §9.6). */
  confirmed?: boolean;
}

interface GateState {
  appAnswers: Map<PermissionApp, boolean>;
  helperApps: Record<string, boolean> | null | undefined;
  evidenceRetry: boolean;
  /** The RECOVERY list for the next step turn only (§5.9 step 5), then null. */
  recovery: string[] | null;
  recoveryLoaded: boolean;
  approved: string[];
  open: OpenApproval | null;
  toRun: OpenApproval | null;
  /** The job's open approval was read back from the DB (after an engine restart nothing is in RAM). */
  openLoaded: boolean;
  // M5 T8
  /** A steer or changed terms superseded this approval; the job's next card names it (08-4 §26.5 item 3). */
  supersedes: string | null;
}

/** `approvalsOpenForJob` / `approvals.byId` rows (main's queries.ts EngineApproval). */
interface ApprovalRowLite {
  id: string;
  cardId: string;
  jobId: string;
  verb: string;
  state: string;
  fields: ApprovalFields;
  submitRef: string | null;
  heldPicked?: boolean;
}

const fromRow = (a: ApprovalRowLite): OpenApproval => ({
  approvalId: a.id,
  cardId: a.cardId,
  draft: { verb: a.verb as ApprovalDraft['verb'], fields: a.fields, evidence: [] },
  submitRef: a.submitRef,
  untrusted: [],
  ...(a.heldPicked ? { confirmed: true } : {}),
});

/**
 * 08-2 §10.4: after the one click only a pre-click refusal (the call never ran) or the site's explicit refusal
 * (`{ refused: true }` in the result) is FAILED; a timeout, a cancel or anything unclear is CHECKING, never re-submitted.
 */
const PRE_CLICK: ReadonlySet<string> = new Set(['IDEMPOTENT_REPEAT', 'VALIDATION', 'USE_SUBMIT', 'URL_NOT_ALLOWED', 'PATH_NOT_ALLOWED']);
export function outcomeState(r: Pick<ExecResult, 'outcome' | 'errorKind' | 'result'>): ApprovalState {
  if (r.outcome === 'ok') return 'COMPLETED';
  if (r.outcome !== 'error') return 'CHECKING';
  if (r.errorKind && PRE_CLICK.has(r.errorKind)) return 'FAILED';
  return (r.result as { refused?: unknown } | null)?.refused === true ? 'FAILED' : 'CHECKING';
}

export interface RunnerGateDeps {
  core: RunnerCore;
  gate: GateLogic;
  tools: ToolLayer;
  timeZone(): string;
  /** fail_streak + 1 (the runner's stuck rules); true when the loop must end. */
  countFailure(job: JobRow): Promise<boolean>;
  /** T8 fills it (08-2 §9.6); until then the second look passes. */
  secondLook?(a: OpenApproval, job: JobRow): Promise<{ pass: boolean }>;
}

const APP_NAME = (app: PermissionApp): string =>
  ({
    gmail: t('cards.approval.app.gmail'),
    calendar: t('cards.approval.app.calendar'),
    contacts: t('cards.approval.app.contacts'),
    whatsapp: t('cards.approval.app.whatsapp'),
    browser: t('cards.approval.app.browser'),
    outlook: t('cards.approval.app.outlook'),
  })[app];

/** The verb word the offer names (08-0 §B.2 verbs; 08-4 §28.1 item 6: buy and pay are one do-verb). */
const VERB_OF: Partial<Record<ActionClass, string>> = {
  send: 'send',
  book: 'book',
  buy: 'buy',
  pay: 'pay',
  post: 'post',
  delete: 'delete',
  share_personal: 'share',
  switch: 'switch',
};

export class RunnerGate {
  private s = new Map<string, GateState>();

  constructor(private d: RunnerGateDeps) {}

  private st(jobId: string): GateState {
    let x = this.s.get(jobId);
    if (!x) {
      x = {
        appAnswers: new Map(),
        helperApps: undefined,
        evidenceRetry: false,
        recovery: null,
        recoveryLoaded: false,
        approved: [],
        open: null,
        toRun: null,
        openLoaded: false,
        supersedes: null,
      };
      this.s.set(jobId, x);
    }
    return x;
  }

  /** The job ended: its gate state goes (RAM only). */
  forget(jobId: string): void {
    this.s.delete(jobId);
  }

  async gateJob(job: JobRow): Promise<GateJob> {
    const x = this.st(job.id);
    if (job.ownerId && x.helperApps === undefined) {
      const h = await this.d.core.query<{ allowedApps?: Record<string, boolean> }>('helpers.byId', job.ownerId);
      x.helperApps = h?.allowedApps ?? null;
    }
    return {
      id: job.id,
      intent: job.intent,
      doVerbs: job.doVerbs,
      ownerId: job.ownerId,
      appAnswers: x.appAnswers,
      ...(x.helperApps ? { helperApps: x.helperApps } : {}),
    };
  }

  // ---- part 8 (08-4 §24.22) ----

  /** "Approved so far", the RECOVERY list (once) and the APPROVAL_EVIDENCE retry line (once). */
  blockParts(jobId: string): { approved: string[]; recovery: string[] | null; retry: string | null } {
    const x = this.st(jobId);
    const out = { approved: x.approved, recovery: x.recovery, retry: x.evidenceRetry ? EVIDENCE_RETRY_LINE : null };
    x.recovery = null;
    x.evidenceRetry = false;
    return out;
  }

  // ---- before each step turn ----

  /**
   * §5.9 step 5: on the first turn after a resume, this job's calls left `unknown` are listed and held (not repeated until a
   * read ran). Then an approval the user approved runs (§28.1 item 8). False when the loop must end.
   */
  async beforeTurn(job: JobRow, signal: AbortSignal): Promise<boolean> {
    const x = this.st(job.id);
    if (!x.recoveryLoaded) {
      x.recoveryLoaded = true;
      const unknown =
        (await this.d.core.query<{ tool: string; args: unknown; idemKey: string | null; outcome: string | null }[]>(
          'toolCallsUnknown',
          job.id,
        )) ?? [];
      if (unknown.length) {
        this.d.tools.holdUnknown(
          job.id,
          unknown.map((u) => u.idemKey).filter((k): k is string => !!k),
        );
        x.recovery = unknown.map((u) => `- ${u.tool} ${summary(u.args)}`);
      }
    }
    await this.loadOpen(job);
    const run = x.toRun;
    if (!run) return true;
    x.toRun = null;
    return this.runApproved(job, run, signal);
  }

  // ---- tool calls the gate did not run ----

  /** r.gate set: the REFUSE line (step skipped), HAND_BACK, or a Choice. True when the loop goes on. */
  async onToolGate(job: JobRow, r: ExecResult): Promise<boolean> {
    const g = r.gate!;
    const core = this.d.core;
    if (g.kind === 'ASK_CHOICE') {
      const payload =
        g.purpose === 'app_use'
          ? {
              purpose: 'app_use',
              question: t('cards.choice.question.app_use', { app: APP_NAME(g.app) }),
              options: [
                { id: 'o1', label: t('cards.choice.option.yes') },
                { id: 'o2', label: t('cards.choice.option.not_this_time') },
              ],
              app: g.app,
            }
          : this.offerPayload(g.cls);
      await core.needsYou(job, {
        type: 'choice',
        state: 'asking',
        payload: { aiReversible: false, reversible: false, livePrices: false, ...payload },
      });
      return false;
    }
    if (g.kind === 'HAND_BACK') {
      // v1 post: x.draft + x.openCompose are M8's connector; the AI sees the refusal and goes on.
      core.d.log('gate.hand_back', 'post', { jobId: job.id });
      return true;
    }
    const row = g.error === 'HELPER_NOT_ALLOWED' ? null : g.app ? `use ${APP_NAME(g.app)}` : (g.row ?? null);
    if (row !== null) await this.refuseLine(job, row);
    else core.d.log('gate.refused', 'HELPER_NOT_ALLOWED', { jobId: job.id });
    return true;
  }

  private offerPayload(cls: ActionClass) {
    const verb = VERB_OF[cls] ?? cls;
    return {
      purpose: 'job',
      question: t('cards.choice.question.offer_action', { action: verb === 'book' || verb === 'buy' ? `${verb} one` : verb }),
      options: [
        { id: 'o1', label: t('cards.choice.option.yes_do', { verb }) },
        { id: 'o2', label: t('cards.choice.option.not_now') },
      ],
      offer: { verb: verb === 'buy' ? 'buy' : verb },
    };
  }

  /** 08-0 §G.3 REFUSE: the line in the chat; the running step → skipped, the next one runs. */
  private async refuseLine(job: JobRow, row: string): Promise<void> {
    const core = this.d.core;
    const steps = await core.steps(job.id);
    const cur = steps.find((s) => s.state === 'running');
    const next = cur ? steps.find((s) => s.idx > cur.idx && s.state === 'pending') : undefined;
    const now = core.d.clock.now();
    await core.tx([
      core.textOp(job, t('thread.permission.never', { row })),
      ...(cur ? [{ op: 'update', table: 'steps', id: cur.id, set: { state: 'skipped', finished_at: now } } as DbOp] : []),
      ...(next ? [{ op: 'update', table: 'steps', id: next.id, set: { state: 'running', started_at: now } } as DbOp] : []),
      ...(next ? [{ op: 'update', table: 'jobs', id: job.id, set: { current_step_idx: next.idx } } as DbOp] : []),
      ...(await core.editChecklistOps(job)),
    ]);
    await core.writeMirrors(job.id);
  }

  /** A Choice the gate asked was answered (app_use: this job's answer; offer: a Yes adds the verb to do_verbs). */
  async onChoiceAnswered(job: JobRow, card: CardRow, choice: string | undefined): Promise<void> {
    const p = card.payload as { purpose?: string; app?: PermissionApp; offer?: { verb: string } };
    if (p.purpose === 'app_use' && p.app) this.st(job.id).appAnswers.set(p.app, choice === 'o1');
    if (p.offer && choice === 'o1' && !job.doVerbs.includes(p.offer.verb))
      await this.d.core.tx([{ op: 'update', table: 'jobs', id: job.id, set: { do_verbs: [...job.doVerbs, p.offer.verb], intent: 'do' } }]);
  }

  // ---- request_approval (08-4 §28.1) ----

  async requestApproval(job: JobRow, decision: Extract<StepDecision, { kind: 'request_approval' }>, asked: string): Promise<boolean> {
    const core = this.d.core;
    const x = this.st(job.id);
    const calls =
      (await core.query<{ id: string; tool: string; result: unknown; outcome: string | null }[]>('toolCallsForJob', job.id)) ?? [];
    const ok = calls.filter((c) => c.outcome === 'ok');
    const snap: ApprovalSnapshot = {
      results: new Map(ok.map((c) => [c.id, JSON.stringify(c.result ?? null)])),
      doVerbs: job.doVerbs,
      timeZone: this.d.timeZone(),
      userWords: [asked],
      untrustedResults: ok.filter((c) => untrustedSource(c.tool)).map((c) => JSON.stringify(c.result ?? null)),
    };
    const v = verifyRequestApproval(decision.draft, snap);
    if (!v.ok && v.reason === 'APPROVAL_EVIDENCE') {
      core.d.log('gate.approval_evidence', v.why, { jobId: job.id });
      x.evidenceRetry = true;
      return !(await this.countFailure(job));
    }
    if (!v.ok && v.injected.length) {
      // 08-2 §9.4.3: a recipient or URL to act on came only from untrusted content: no card, the injection line.
      core.d.log('gate.injection_blocked', 'untrusted', { jobId: job.id });
      await core.tx([core.textOp(job, t('thread.injection.blocked'))]);
      // A repeated injected ask ends through the stuck rules instead of looping (§24.5 fail_streak).
      return !(await this.countFailure(job));
    }
    if (!v.ok) {
      // The verb was never asked: the gate's read-only branch (Art. 3).
      await core.needsYou(job, {
        type: 'choice',
        state: 'asking',
        payload: { aiReversible: false, reversible: false, livePrices: false, ...this.offerPayload(classOfVerb(v.verb)) },
      });
      return false;
    }
    const cls = classOfVerb(v.draft.verb);
    const decided = this.d.gate.decide(await this.gateJob(job), { tool: 'browser.submit', cls, fields: v.draft.fields });
    if (decided.kind === 'REFUSE' || decided.kind === 'HAND_BACK' || decided.kind === 'ASK_CHOICE')
      return this.onToolGate(job, {
        toolCallId: '',
        tool: 'browser.submit',
        outcome: 'error',
        result: null,
        changed: false,
        gate: decided,
      });
    if (decided.kind !== 'CARD') {
      core.d.log('gate.unexpected', decided.kind, { jobId: job.id });
      return !(await this.countFailure(job));
    }
    const text = approvalText(v.draft.fields, { timeZone: this.d.timeZone(), now: core.d.clock.now() });
    const made = await core.d.link.request<{ approvalId: string; cardId: string; nonce: string }>('approval.open', {
      jobId: job.id,
      draft: v.draft,
      title: text.title,
      impact: text.impact,
      ...(decision.submitRef ? { submitRef: decision.submitRef } : {}),
      ...(x.supersedes ? { supersedes: x.supersedes } : {}),
    });
    if (made.ok) x.supersedes = null;
    if (!made.ok) {
      // buy / pay are the Payment card (M10); anything else main refused.
      core.d.log('gate.approval_open_failed', made.error.kind, { jobId: job.id });
      return !(await this.countFailure(job));
    }
    x.open = { ...made.value, draft: v.draft, submitRef: decision.submitRef ?? null, untrusted: v.untrusted };
    await this.waitOn(job, made.value.cardId);
    return false;
  }

  private countFailure(job: JobRow): Promise<boolean> {
    return this.d.countFailure(job);
  }

  /** WORKING → NEEDS_YOU on a card main created (the approval's); the running step waits on the user. */
  private async waitOn(job: JobRow, cardId: string): Promise<void> {
    const core = this.d.core;
    const steps = await core.steps(job.id);
    const cur = steps.find((s) => s.state === 'running');
    await core.tx([
      { op: 'transition', table: 'jobs', id: job.id, from: ['working'], to: 'needs_you', set: { needs_you_card_id: cardId } },
      ...(cur ? [{ op: 'update', table: 'steps', id: cur.id, set: { state: 'waiting_user' } } as DbOp] : []),
      ...core.badgeOps(job, 'needs_you'),
      ...(await core.editChecklistOps(job)),
    ]);
    await core.writeMirrors(job.id);
  }

  // ---- after the card ----

  /** The user tapped Approve (main moved PENDING → APPROVED): the next loop turn runs it first. */
  async onApproved(job: JobRow, cardId: string): Promise<void> {
    const x = this.st(job.id);
    if (x.open?.cardId === cardId) {
      x.toRun = x.open;
      x.open = null;
      return;
    }
    // Nothing in RAM (the engine restarted while the card waited): read it back; it is APPROVED by now.
    x.openLoaded = false;
    await this.loadOpen(job);
  }

  /**
   * The approval the job waits on, read back once from main's DB: PENDING → `open`, APPROVED (tapped, not yet run) →
   * `toRun`. RUNNING / CHECKING were handed to main's restart sweep (§5.9 step 2) and are never run again.
   */
  private async loadOpen(job: JobRow): Promise<void> {
    const x = this.st(job.id);
    if (x.openLoaded) return;
    x.openLoaded = true;
    if (x.open || x.toRun || !job.needsYouCardId) return;
    const rows = (await this.d.core.query<ApprovalRowLite[]>('approvalsOpenForJob', job.id)) ?? [];
    const a = rows.find((r) => r.cardId === job.needsYouCardId);
    if (a?.state === 'PENDING' || a?.state === 'HELD') x.open = fromRow(a);
    if (a?.state === 'APPROVED') x.toRun = fromRow(a);
  }

  /** 08-4 §28.1 item 8: second look → write-ahead RUNNING (acked in 2 s) → the tool once → COMPLETED / FAILED / CHECKING. */
  private async runApproved(job: JobRow, a: OpenApproval, signal: AbortSignal): Promise<boolean> {
    const core = this.d.core;
    // M5 T8 (X-125): second look → live terms → write-ahead.
    let look: SecondLookResult | undefined;
    if (this.d.secondLook) {
      if (!(await this.d.secondLook(a, job)).pass) return false;
    } else if (!a.confirmed) {
      const out = await runSecondLook({
        fields: a.draft.fields,
        userWords: await userWordsFor(core, job),
        timeZone: this.d.timeZone(),
        now: core.d.clock.now(),
        untrusted: a.untrusted,
        askAi: (p) => askSecondLook(core, job, p),
      });
      if (!out.pass) return this.hold(job, a, { secondLook: out.result, held: out.held });
      look = out.result;
    }
    const steps0 = await core.steps(job.id);
    const live = await readLiveTerms(
      core,
      this.d.tools,
      { id: job.id, stepId: steps0.find((s) => s.state === 'running')?.id ?? null, turnId: null, gate: await this.gateJob(job) },
      a.draft,
      signal,
    );
    if (live === 'unreadable') {
      core.d.log('gate.live_terms_unreadable', 'cannot_check', { jobId: job.id });
      return this.hold(job, a, { held: { reason: 'cannot_check', verbing: verbingOf(a.draft.verb) } });
    }
    if (live !== 'none') {
      const c = checkLiveTerms(a.draft.fields, live);
      if (!c.same) return this.supersedeTerms(job, a, live, c.changed[0]!);
    }
    let timer: ReturnType<typeof core.d.clock.setTimeout> | null = null;
    const moved = await Promise.race([
      this.transition(a.approvalId, 'RUNNING', { submittedAt: core.d.clock.now(), ...(look ? { secondLook: look } : {}) }),
      new Promise<false>((r) => (timer = core.d.clock.setTimeout(() => r(false), WRITE_AHEAD_MS))),
    ]);
    if (timer !== null) core.d.clock.clearTimeout(timer);
    if (!moved) {
      // No ack in 2 s: nothing is clicked (§29.1). main answers in order, so when HELD comes back the RUNNING request
      // has been handled too: HELD → the card waits on the user again (cannot_check); refused → the late ack moved the row
      // to RUNNING, and it goes on to FAILED (`submit_failed`, nothing was submitted) so it is never left RUNNING.
      core.d.log('gate.write_ahead_failed', 'APPROVAL_BAD_TRANSITION', { jobId: job.id });
      if (await this.transition(a.approvalId, 'HELD')) {
        await this.waitOn((await core.job(job.id)) ?? job, a.cardId);
        return false;
      }
      core.d.log('gate.write_ahead_late', 'APPROVAL_BAD_TRANSITION', { jobId: job.id });
      await this.transition(a.approvalId, 'FAILED');
      return true;
    }
    const tool = 'browser.submit';
    const steps = await core.steps(job.id);
    const r = await this.d.tools.executeApproved(
      { id: job.id, stepId: steps.find((s) => s.state === 'running')?.id ?? null, turnId: null },
      { tool, args: { ref: a.submitRef ?? '', approvalId: a.approvalId } },
      a.approvalId,
      signal,
    );
    const to = outcomeState(r);
    await this.transition(a.approvalId, to);
    if (to === 'COMPLETED') this.st(job.id).approved.push(approvedLine(a.draft, this.d.timeZone(), core.d.clock.now()));
    return true;
  }

  // ---- M5 T8 ----

  /** 08-2 §9.6: APPROVED → HELD with the card's copy; the job waits on the same card again. */
  private async hold(job: JobRow, a: OpenApproval, data: TransitionData): Promise<false> {
    const core = this.d.core;
    if (!(await this.transition(a.approvalId, 'HELD', data))) {
      core.d.log('gate.hold_failed', 'APPROVAL_BAD_TRANSITION', { jobId: job.id });
      return false;
    }
    this.st(job.id).open = a;
    await this.waitOn((await core.job(job.id)) ?? job, a.cardId);
    return false;
  }

  /** 08-2 §9.4.2: the live terms changed → SUPERSEDED (naming the term) and a new PENDING card with the live values. */
  private async supersedeTerms(
    job: JobRow,
    a: OpenApproval,
    live: Partial<ApprovalFields>,
    term: NonNullable<ApprovalPayload['superseded']>,
  ): Promise<false> {
    const core = this.d.core;
    if (!(await this.transition(a.approvalId, 'SUPERSEDED', { superseded: term }))) {
      core.d.log('gate.supersede_failed', 'APPROVAL_BAD_TRANSITION', { jobId: job.id });
      return false;
    }
    const draft: ApprovalDraft = { ...a.draft, fields: { ...a.draft.fields, ...live } };
    const text = approvalText(draft.fields, { timeZone: this.d.timeZone(), now: core.d.clock.now() });
    const made = await core.d.link.request<{ approvalId: string; cardId: string; nonce: string }>('approval.open', {
      jobId: job.id,
      draft,
      title: text.title,
      impact: text.impact,
      ...(a.submitRef ? { submitRef: a.submitRef } : {}),
      supersedes: a.approvalId,
    });
    if (!made.ok) {
      core.d.log('gate.approval_open_failed', made.error.kind, { jobId: job.id });
      await this.countFailure(job);
      return false;
    }
    this.st(job.id).open = { ...made.value, draft, submitRef: a.submitRef, untrusted: a.untrusted };
    await this.waitOn((await core.job(job.id)) ?? job, made.value.cardId);
    return false;
  }

  /**
   * A pick on a HELD card (main already moved it, SM-A4): the action's value → it runs on the next turn without asking
   * again; the user's own → DECLINED, and the job re-prepares with the value (the answer reaches the AI as a decision line).
   */
  async onHeldPick(job: JobRow, card: CardRow, pick: 'held_action' | 'held_own'): Promise<string | null> {
    const x = this.st(job.id);
    await this.loadOpen(job);
    const open = x.open?.cardId === card.id ? x.open : null;
    x.open = null;
    const held = (card.payload as unknown as ApprovalPayload).held;
    if (pick === 'held_action') {
      if (open) x.toRun = { ...open, confirmed: true };
      else {
        x.openLoaded = false;
        await this.loadOpen(job);
        const loaded: OpenApproval | null = x.toRun;
        if (loaded) x.toRun = { ...loaded, confirmed: true };
      }
      return null;
    }
    return held?.userSaid ?? null;
  }

  /** 08-4 §26.5 item 3: a steer superseded this job's approval; the next card the job makes names it. */
  onSteerSuperseded(jobId: string, approvalId: string): void {
    const x = this.st(jobId);
    if (x.open?.approvalId === approvalId) x.open = null;
    x.supersedes = approvalId;
  }

  private async transition(approvalId: string, to: ApprovalState, data?: TransitionData): Promise<boolean> {
    const r = await this.d.core.d.link.request('approval.transition', { approvalId, to, ...(data ? { data } : {}) });
    return r.ok;
  }

  /**
   * main's `approval.changed` (08-1 §2.4). EXPIRED on a payment or booking card → the job is cancelled (07-2 §4,
   * `approval_expired`, AT-111); other verbs keep the job NEEDS_YOU with [ Ask me again ] (08-2 §9.1).
   */
  async onApprovalChanged(approvalId: string, state: ApprovalState): Promise<string | null> {
    if (state !== 'EXPIRED' && state !== 'WITHDRAWN' && state !== 'DECLINED') return null;
    const core = this.d.core;
    const hit = [...this.s.entries()].find(([, x]) => x.open?.approvalId === approvalId);
    let jobId: string;
    let verb: string;
    let cardId: string;
    if (hit) {
      jobId = hit[0];
      ({ verb } = hit[1].open!.draft);
      cardId = hit[1].open!.cardId;
      hit[1].open = null;
    } else {
      // After an engine restart the runner holds nothing: main's row names the job (AT-111 still cancels).
      const row = await core.query<ApprovalRowLite | null>('approvals.byId', approvalId);
      if (!row) return null;
      ({ jobId, verb, cardId } = row);
    }
    if (state !== 'EXPIRED' || verb === 'delete') return null;
    const job = await core.job(jobId);
    if (!job || job.state !== 'needs_you' || job.needsYouCardId !== cardId) return null;
    const now = core.d.clock.now();
    const steps = await core.steps(job.id);
    const r = await core.tx([
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['needs_you'],
        to: 'cancelled',
        set: { needs_you_card_id: null, stop_reason: 'approval_expired', finished_at: now },
      },
      ...steps
        .filter((s) => s.state === 'waiting_user' || s.state === 'pending' || s.state === 'running')
        .map((s): DbOp => ({ op: 'update', table: 'steps', id: s.id, set: { state: 'skipped' } })),
      ...core.badgeOps(job, 'cancelled'),
      ...(await core.editChecklistOps(job, 'stopped')),
    ]);
    if (!r.ok) return null;
    await core.ended(job.id);
    await core.startNext();
    return job.id;
  }
}

/** §24.22 "Approved so far" line: `- {verb} · key: value` with F10 dates and ₹ money. */
function approvedLine(d: ApprovalDraft, timeZone: string, now: number): string {
  const f = d.fields;
  const parts: string[] = [];
  if (f.payee) parts.push(`payee: ${f.payee}`);
  if (f.siteDomain) parts.push(`site: ${f.siteDomain}`);
  if (f.item) parts.push(`item: ${f.item}`);
  if (f.partySize !== undefined) parts.push(`party: ${f.partySize}`);
  if (f.when) parts.push(`when: ${formatDate(f.when.start, 'full', { timeZone: f.when.tz || timeZone, now })}`);
  if (f.amountPaise !== undefined) parts.push(`amount: ${formatInr(f.amountPaise)}`);
  return `- ${d.verb} · ${parts.join(', ')}`;
}

/** `{args summary}` of the RECOVERY list: compact JSON, cut to 120 chars (args are stored redacted). */
function summary(args: unknown): string {
  const s = JSON.stringify(args ?? {});
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}
