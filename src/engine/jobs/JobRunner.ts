// Spec: 08-2 §5.1 (the runner alone creates jobs, moves job state, edits checklists, sets C1 badges and decides when the AI is
// called for a job; main writes the derived chat columns in the same transaction), §5.3.3 (createJob: queued row, steps from
// the plan with catalogue keys only, plan.md + state.json; title and estimates are the engine's; Plan card when est_minutes > 2
// or est_cost_paise > 500, else enqueue), §5.4.1–§5.4.2 (scheduling and the loop: badge 🛠, checklist after 1.5 s when
// step_count ≥ 2, keepAwake while WORKING; tool / step_done / replan / ask / request_approval / done / fail), §5.8 (finish),
// §5.10 item 1 (one ai_turns row per call, usage as reported), 08-4 §26.1–§26.3, §26.8, §26.9 item 5 (NEEDS_YOU step →
// waiting_user and back), §26.11, §26.12 (ids on a step turn), §24.22 (part 8), 07-2 §4 + SM-A1/A12 (machine; badges), 08-1
// §4.1.2 (mirrors), §4.5 (card payloads), CR-0008 G-M4-01 (retry = new linked job), G-M4-05, G-M4-06.
// Ticket T2 builds the core. Seams the next tickets fill (they replace the T2 defaults named in `RunnerHooks`):
// T3 stop / steer / watchdog / stuck / caps, T4 waiting / recovery / power events. T3's logic lives in stopFlow.ts,
// steer.ts, watchdog.ts and costMeter.ts; they reach the runner through `RunnerCore` (08-2 §5.2, §5.5–§5.7, §5.10).
// M5 T7: the gate's job side lives in engine/gate/runnerGate.ts (08-2 §9.4, 08-4 §28.1, §5.9 step 5, §24.22 part 8); the
// runner only calls it: before each step turn, on request_approval, on a tool the gate held, on a card answer, and the
// decline line of AT-110 (07-2 §4 "Okay, I won't. …"). Stored text goes through `Redactor.scrub` (08-2 §11.4, map fix 11).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { newNonce } from '../../shared/canon';
import { t } from '../../shared/copy/t';
import type { Clock, TimerId } from '../../shared/clock';
import type { Result } from '../../shared/errors';
import { formatInr } from '../../shared/format';
import { redactSecrets } from '../../shared/redactor';
import { BADGE_OF_STATE, JOB_STATES, TERMINAL } from '../../shared/jobMachine';
import { phraseText, resolvePhrase, type PhraseKey } from '../../shared/phrases';
import type { IntakeDecision, PlanStep, SecondLookAct, StepAct, StepDecision } from '../../shared/schemas';
import type { Settings } from '../../shared/settings';
import { buildMemoryParts, stepQueryText, type MemoryParts } from '../memory/retrieval';
import type {
  ApprovalState,
  CardRow,
  ErrorKind,
  FixAction,
  JobRow,
  JobState,
  ProviderId,
  StepRow,
  StopReason,
  StopReport,
} from '../../shared/types';
import type { LaneAi } from '../chat/ChatLane';
import type { AiErrorKind, TurnResult } from '../ai/types';
import type { DbOp, DbTxReply, MainLink } from '../protocol';
import type { ExecResult, NeedsUserCard, ToolLayer } from '../tools/ToolLayer';
import { estCostPaise, estMinutes, estTokens, isBigOne, needsPlanCard } from './estimates';
import { choiceFields } from '../cards/choiceFields';
import { CostMeter } from './costMeter';
import { RunnerTick } from './tick';
import { ChoiceTimeouts } from '../cards/choiceTimeouts';
import { checkProof } from './proof';
import { needsVerify, pickStartable, type QueueJob } from './queue';
import { buildTitle, insertShowBefore, retryTitle, PLAN_MAX } from './title';
import { extractDoVerbs } from './verbs';
import { Steer } from './steer';
import { StopFlow } from './stopFlow';
import { Watchdog, type StuckRule } from './watchdog';
import type { GateLogic } from '../gate/GateLogic';
import { RunnerGate } from '../gate/runnerGate';
// M5 T14
import { draftSecondLook, type DraftLookAnswer, type DraftLookReq } from '../gate/draftSecondLook';

export const CHECKLIST_AFTER_MS = 1_500;
const OBSERVATION_CAP = 4_000;

type JobDecision = Extract<IntakeDecision, { kind: 'job' }>;

export interface RunnerAi extends LaneAi {
  verify(providerId: ProviderId): Promise<{ ok: boolean; kind?: string }>;
}

export interface RunnerPrompts {
  /** `memory`: parts 5/5b for this step turn (08-4 §24.1 step row, §24.16; M6 T4). `steer` is part 10 (08-2 §7.2), present
   * only when steers are queued. */
  buildStep(jobBlock: string, tools: string, memory: MemoryParts, steer?: string | null): { system: string; prompt: string };
  buildRepair(issues: string): string;
  /** Parse a step reply: the validated StepAct, or the zod issues for the repair turn. */
  parseStep(text: string): { act: StepAct | null; issues: string | null; say?: string };
  /** 08-4 §24.13 / §24.21: the classify turn over the last tool results, and its StuckAct `whatsWrong` (null if invalid). */
  buildStuck(results: string): { system: string; prompt: string };
  parseStuck(text: string): string | null;
  /** 08-2 §7.6 output filters (result text, card text from the AI). */
  filter(text: string): string;
  isBanned(text: string): boolean;
  // M5
  /** T8: 08-4 §24.7 the second look's prompt, and its SecondLookAct (null if invalid). Absent → the look cannot check. */
  buildSecondLook?(userWords: readonly string[], actionJson: string): { system: string; prompt: string };
  parseSecondLook?(text: string): SecondLookAct | null;
}

/** What the next tickets plug in. The T2 defaults are the conservative stand-ins named on each line. */
export interface RunnerHooks {
  /** T4: an AI error moves the job to WAITING (08-2 §6.7). T2 default: FAILED with the UNKNOWN error card. */
  onAiError?(job: JobRow, kind: AiErrorKind): Promise<void>;
  /** T3: the watchdog's stuck rules (08-2 §5.6). T2 default: three failures in a row end the job FAILED. */
  onStuck?(job: JobRow, rule: 'fail_streak'): Promise<void>;
  /** T4: a queued job cannot start (no usable AI, or its verify failed) → WAITING. T2 default: it stays queued. */
  onCannotStart?(job: JobRow, kind?: string): Promise<void>;
  /** T4: runs before each schedule pass (waiting jobs whose condition cleared resume first); false holds every start. */
  beforeSchedule?(): Promise<boolean>;
  // M5
  /** T10: the cap was raised or the month turned (08-2 §5.10 item 4): the Engine drains messages that waited at the cap. */
  onCapLifted?(): void;
}

/** What T3's modules (stopFlow, steer, watchdog, costMeter) may use of the runner. */
export interface RunnerCore {
  d: JobRunnerDeps;
  cost: CostMeter;
  tx(ops: DbOp[]): Promise<Result<DbTxReply>>;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
  job(id: string): Promise<JobRow | null>;
  steps(jobId: string): Promise<StepRow[]>;
  badgeOps(job: JobRow, to: JobState): DbOp[];
  cardOps(
    chatId: string,
    type: string,
    state: string,
    payload: Record<string, unknown>,
    jobId: string | null,
    helperId: string | null,
  ): { cardId: string; messageId: string; ops: DbOp[] };
  editChecklistOps(job: JobRow, state?: string): Promise<DbOp[]>;
  /** A foo (or helper) text message in the chat, tied to the job when there is one. */
  textOp(job: Pick<JobRow, 'chatId' | 'ownerId'> & { id: string | null }, text: string): DbOp;
  /** WORKING → NEEDS_YOU with the card; the new card's id, or null when the move was refused. */
  needsYou(job: JobRow, card: NeedsUserCard): Promise<string | null>;
  /** Aborts the job's loop: no more AI turns or tool calls (08-2 §5.7 step 1). */
  halt(jobId: string): void;
  launch(jobId: string): void;
  startNext(): Promise<void>;
  // M5 T10: one scheduling pass on the same chain as startNext, after the beforeSchedule hold (null when held).
  schedule(pass: () => Promise<void>): Promise<void>;
  ended(jobId: string): Promise<void>;
  writeMirrors(jobId: string): Promise<void>;
  workingMs(jobId: string): number;
  recordTurn(
    job: JobRow,
    pick: { providerId: ProviderId; billing: 'plan' | 'key' | 'local' },
    turnId: string,
    purpose: 'step' | 'repair' | 'classify' | 'second_look',
    startedAt: number,
    r: TurnResult,
  ): Promise<void>;
  track<T>(p: Promise<T>): Promise<T>;
  /** 08-2 §5.5 `new_job`: the message goes to a normal intake turn. */
  intake(chatId: string, messageId: string): void;
}

export interface JobRunnerDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'j' | 's' | 'm' | 'k' | 't'): string;
  settings(): Settings;
  ai: RunnerAi;
  prompts: RunnerPrompts;
  tools: ToolLayer;
  /** `{DATA}`: job folders live under `{DATA}\jobs\{id}`. */
  dataDir: string;
  /** 08-4 §26.3 item 3: the provider's default-model rate, or null when unpriced. */
  rateOf(providerId: ProviderId): { inPerMTokUsd: number; outPerMTokUsd: number } | null;
  usdToInr: number;
  log(evt: string, kind?: string, ids?: { chatId?: string; jobId?: string }): void;
  hooks?: RunnerHooks;
  // M5
  /** T7: 08-2 §9.4 GateLogic (the same one the ToolLayer holds), for request_approval drafts. */
  gate: GateLogic;
  /** T7: 08-2 §11.4 `Redactor.scrub` (registry + patterns) for runner-written text; the pattern scrub alone when absent. */
  scrub?(text: string): { text: string; hits: number };
}

export interface CreateJobInput {
  chatId: string;
  userMessageId: string | null;
  decision: JobDecision;
  /** The user's words, for do-verbs (Art. 3) and plan.md "Asked:". */
  askedText: string;
  helperId?: string | null;
  origin?: JobRow['origin'];
  originRef?: string | null;
  // M5
  /** T10: the job may not start before this time (08-4 §26.8 item 6, `opens_at`); its first producer is a timed opening. */
  wakeAt?: number | null;
}

/** M5 T10: a changed Plan card's plan, attached to the chat's next intake turn (08-2 §5.3.3). */
export interface OldPlan {
  title: string;
  /** The steps as the card showed them (phrase next forms). */
  steps: string[];
}

export interface JobCtx {
  abort: AbortController;
  asked: string;
  workingSince: number | null;
  workingMs: number;
  lastObservation: { toolCallId: string; tool: string; text: string } | null;
  decisions: string[];
  aiEstimate: { minutes?: number; tokens?: number } | null;
  lastError: { kind: ErrorKind; site: string | null } | null;
  checklistTimer: TimerId | null;
}

const STEP_LABEL: Record<StepRow['state'], string> = {
  done: 'done',
  running: 'running',
  pending: 'next',
  waiting_user: 'waiting_user',
  skipped: 'skipped',
  failed: 'running',
};

/** M5 T8: the HELD strip's values, for the decision line the AI reads after the user picked their own. */
function heldVars(card: CardRow): { userSaid: string; actionHas: string } {
  const h = (card.payload as { held?: { userSaid?: string; actionHas?: string } }).held;
  return { userSaid: h?.userSaid ?? '', actionHas: h?.actionHas ?? '' };
}

/** The resolved state of a NEEDS_YOU card once the user answers it (08-0 §G.2). */
const ANSWERED_STATE: Partial<Record<string, string>> = {
  choice: 'answered',
  tiles: 'answered',
  signin: 'signed_in',
  secret: 'saved',
};
/** Approval / payment stubs until M5 / M10: only an explicit Approve resumes; Decline cancels (07-2 "declined → cancelled"). */
const APPROVAL_CARDS = new Set(['approval', 'payment']);

function domainOf(site: string | null): string | null {
  return site && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site) ? site.toLowerCase() : null;
}

/** 08-1 §4.5 error card words per kind, as literal t() calls so check:copy sees every key. */
function errorCopy(kind: 'SITE_BLOCKED' | 'UNKNOWN', site: string) {
  return kind === 'SITE_BLOCKED'
    ? {
        whatHappened: t('errors.site_blocked.what_happened', { site }),
        whatIsSafe: t('errors.site_blocked.what_is_safe'),
        label: t('errors.site_blocked.button'),
      }
    : { whatHappened: t('errors.unknown.what_happened'), whatIsSafe: t('errors.unknown.what_is_safe'), label: t('errors.unknown.button') };
}

export class JobRunner {
  private ctxs = new Map<string, JobCtx>();
  private loops = new Map<string, Promise<void>>();
  /** Jobs that became WORKING again while their old loop was still finishing; they relaunch when it ends. */
  private relaunch = new Set<string>();
  private busy = 0;
  private idleWaiters: (() => void)[] = [];
  private sched: Promise<void> = Promise.resolve();
  readonly cost: CostMeter;
  readonly stopper: StopFlow;
  readonly steering: Steer;
  readonly watchdog: Watchdog;
  private intakeHook: ((chatId: string, messageId: string) => void) | null = null;
  // M5
  /** T10: chat id → the plan the user asked to change; the chat's next intake turn carries it (08-2 §5.3.3). */
  private planChanges = new Map<string, OldPlan>();
  private ticker: RunnerTick;
  /** T7: the gate's job side (08-2 §9.4). */
  readonly gating: RunnerGate;

  constructor(private d: JobRunnerDeps) {
    const core: RunnerCore = {
      d,
      get cost() {
        return cost;
      },
      tx: (ops) => this.tx(ops),
      query: (q, ...args) => this.query(q, ...args),
      job: (id) => this.job(id),
      steps: (id) => this.steps(id),
      badgeOps: (job, to) => this.badgeOp(job, to),
      cardOps: (...a) => this.cardOps(...a),
      editChecklistOps: (job, state) => this.editChecklistOps(job, state),
      textOp: (job, text) => this.textOp(job, text),
      needsYou: (job, card) => this.needsYou(job, card),
      halt: (id) => this.ctxs.get(id)?.abort.abort(),
      launch: (id) => this.launch(id),
      startNext: () => this.startNext(),
      schedule: (pass) => this.schedule(pass),
      ended: (id) => this.ended(id, this.ctx(id)),
      writeMirrors: (id) => this.writeMirrors(id),
      workingMs: (id) => {
        const c = this.ctxs.get(id);
        return c ? c.workingMs + (c.workingSince !== null ? this.d.clock.now() - c.workingSince : 0) : 0;
      },
      recordTurn: (...a) => this.recordTurn(...a),
      track: (p) => this.track(p),
      intake: (chatId, messageId) => this.intakeHook?.(chatId, messageId),
    };
    const cost = new CostMeter(core);
    this.cost = cost;
    this.stopper = new StopFlow(core);
    // M5 T8: a steer supersedes the open approval through main's gate and the next card names it (08-4 §26.5).
    this.steering = new Steer(core, this.stopper, (jobId, approvalId) => this.gating.onSteerSuperseded(jobId, approvalId));
    this.watchdog = new Watchdog(core, this.stopper);
    // M5 T10: the 15 s tick (opens_at wake, 24 h Plan withdraw).
    // M5 T8: J8 choice timeouts (AT-033, AT-034) on the same tick.
    const timeouts = new ChoiceTimeouts({
      core,
      answered: async (job, card, optionId, label) => {
        this.ctx(job.id).decisions.push(this.scrub(`- Q: ${String(card.payload.question ?? '')} → A: ${label}`));
        await this.gating.onChoiceAnswered(job, card, optionId);
        await this.writeMirrors(job.id);
        await this.startNext();
      },
    });
    this.ticker = new RunnerTick(core, () => timeouts.run());
    this.ticker.start();
    // M5 T7
    this.gating = new RunnerGate({
      core,
      gate: d.gate,
      tools: d.tools,
      timeZone: () => d.settings().locale.timeZone,
      countFailure: (j) => this.countFailure(j),
    });
    // M5 T14
    this.draftLook = (req) => draftSecondLook(core, d.settings().locale.timeZone, req);
  }

  // M5 T14
  private readonly draftLook: (req: DraftLookReq) => Promise<DraftLookAnswer>;
  /** main's `draft.secondLook` (08-2 §9.6 on a Draft's Send, G-M5-39 (b)): the look's answer; main holds or sends. */
  draftSecondLook(req: DraftLookReq): Promise<DraftLookAnswer> {
    return this.track(this.draftLook(req));
  }

  /** M5 T7: 08-2 §11.4 for text the runner stores (decisions, plan.md "Asked:"). */
  private scrub(text: string): string {
    return (this.d.scrub ? this.d.scrub(text) : redactSecrets(text)).text;
  }
  /** M5 T7: main's `approval.changed` (an expired payment / booking card cancels its job, AT-111). */
  onApprovalChanged(p: { approvalId: string; state: ApprovalState }): Promise<void> {
    return this.track(this.gating.onApprovalChanged(p.approvalId, p.state).then(() => undefined));
  }

  // ---- T3 entry points (08-2 §5.2, §5.7, §5.10) ----

  /** The runner's branches of onUserMessage (stop, yes-text, steer, fold-which); false → the chat lane's intake turn. */
  onUserMessage(m: { chatId: string; messageId: string; text: string }): Promise<boolean> {
    return this.track(this.steering.onUserMessage(m));
  }
  /** job.stop (a Stop button: user_button; the stuck card: stuck_stop). */
  stopJob(jobId: string, reason: StopReason): Promise<StopReport | null> {
    return this.track(this.stopper.stopJob(jobId, reason));
  }
  stopAll(): Promise<StopReport[]> {
    return this.track(this.stopper.stopAll());
  }
  /** M5 T10: the plan the user asked to change in this chat, for its next intake turn; `take` clears it once that turn ran. */
  planChange(chatId: string, take = false): OldPlan | null {
    const p = this.planChanges.get(chatId) ?? null;
    if (take) this.planChanges.delete(chatId);
    return p;
  }
  /** M5 T10: the pre-call cap check of a chat-lane turn (intake, repair, rewrite); true when the call may go. */
  allowChatCall(promptChars: number, purpose: 'intake' | 'repair' | 'rewrite'): Promise<boolean> {
    const pick = this.d.ai.pick();
    if (!pick) return Promise.resolve(true);
    return this.cost.allowChatCall(promptChars, this.d.ai.turnParams(pick.providerId, purpose).maxOutputTokens);
  }
  /** settings.changed: a raised AI cap resumes waiting(spend_cap) jobs. */
  capChanged(): Promise<void> {
    return this.track(this.cost.resumeCapped());
  }
  /** Engine: where a steer judged `new_job` goes (the chat lane's intake, past the runner's branches). */
  setIntake(fn: (chatId: string, messageId: string) => void): void {
    this.intakeHook = fn;
  }

  // ---- bookkeeping ----

  track<T>(p: Promise<T>): Promise<T> {
    this.busy += 1;
    return p.finally(() => {
      this.busy -= 1;
      if (this.busy === 0 && this.loops.size === 0) for (const w of this.idleWaiters.splice(0)) w();
    });
  }
  /** Resolves when no job is computing (a job waiting on the user or on a slot does not count). Tests. */
  idle(): Promise<void> {
    if (this.busy === 0 && this.loops.size === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }
  /** Aborts every running loop and timer (test teardown, engine stop). */
  cancelAll(): void {
    this.watchdog.dispose();
    this.stopper.dispose();
    this.cost.dispose();
    this.ticker.dispose();
    for (const c of this.ctxs.values()) {
      c.abort.abort();
      if (c.checklistTimer !== null) this.d.clock.clearTimeout(c.checklistTimer);
    }
  }

  private ctx(jobId: string, asked = ''): JobCtx {
    let c = this.ctxs.get(jobId);
    if (!c) {
      c = {
        abort: new AbortController(),
        asked,
        workingSince: null,
        workingMs: 0,
        lastObservation: null,
        decisions: [],
        aiEstimate: null,
        lastError: null,
        checklistTimer: null,
      };
      this.ctxs.set(jobId, c);
    }
    return c;
  }

  private tx(ops: DbOp[]): Promise<Result<DbTxReply>> {
    return this.d.link.request<DbTxReply>('db.tx', { ops });
  }
  private async query<T>(q: string, ...args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }
  private job(id: string): Promise<JobRow | null> {
    return this.query<JobRow>('jobById', id);
  }
  private async steps(jobId: string): Promise<StepRow[]> {
    return (await this.query<StepRow[]>('stepsForJob', jobId)) ?? [];
  }
  private async checklistOf(job: JobRow): Promise<CardRow | null> {
    const open = (await this.query<CardRow[]>('cards.openForChat', job.chatId, 'checklist')) ?? [];
    return open.find((c) => c.payload.jobId === job.id) ?? null;
  }

  /** The C1 badge of the job's bubble follows the machine (FID-17 "badge = runner state", 08-0 §F). */
  private badgeOp(job: JobRow, to: JobState): DbOp[] {
    const own: DbOp[] = job.userMessageId
      ? [{ op: 'update', table: 'messages', id: job.userMessageId, set: { badge: BADGE_OF_STATE[to] } }]
      : [];
    return [...own, ...this.steering.badgeOps(job.id, BADGE_OF_STATE[to])];
  }

  textOp(job: Pick<JobRow, 'chatId' | 'ownerId'> & { id: string | null }, text: string): DbOp {
    return {
      op: 'insert',
      table: 'messages',
      row: {
        id: this.d.newId('m'),
        chat_id: job.chatId,
        author_kind: job.ownerId ? 'helper' : 'foo',
        author_id: job.ownerId,
        kind: 'text',
        text,
        status: 'complete',
        job_id: job.id,
        created_at: this.d.clock.now(),
      },
    };
  }

  /** A card message + its cards row (08-1 §4.3.3 insert order). */
  private cardOps(
    chatId: string,
    type: string,
    state: string,
    payload: Record<string, unknown>,
    jobId: string | null,
    helperId: string | null,
  ) {
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
          author_kind: helperId ? 'helper' : 'foo',
          author_id: helperId,
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
          type,
          state,
          payload,
          // M5 T7: 08-1 §3.2 card nonces are 32 hex (card:answer refuses any other, IPC_REJECTED).
          nonce: newNonce(),
          created_at: now,
        },
      },
    ];
    return { cardId, messageId, ops };
  }

  // ---- 08-2 §5.3.3 createJob ----

  async createJob(input: CreateJobInput): Promise<string | null> {
    return this.track(this.createJobInner(input));
  }

  private async createJobInner(input: CreateJobInput): Promise<string | null> {
    const s = this.d.settings();
    const pick = this.d.ai.pick();
    const billing = pick?.billing ?? 'plan';
    const doVerbs = extractDoVerbs(input.askedText);
    const intent = doVerbs.length ? 'do' : 'read_only';
    const isBanned = (x: string) => this.d.prompts.isBanned(x);
    const plan = insertShowBefore(
      input.decision.plan.map((p) => {
        const r = resolvePhrase(p.phraseKey, p.slots, { inPlan: true, isBanned });
        return { phraseKey: r.key, slots: r.slots, route: p.route };
      }),
    ).slice(0, PLAN_MAX);
    const title = buildTitle({ intent, plan, hint: input.decision.title, isBanned });
    const tokens = estTokens(input.decision.estimate?.tokens, plan.length);
    const minutes = estMinutes(input.decision.estimate?.minutes, plan.length);
    const cost = pick ? estCostPaise(tokens, billing, this.d.rateOf(pick.providerId), this.d.usdToInr) : null;
    const id = this.d.newId('j');
    const now = this.d.clock.now();
    const c = this.ctx(id, input.askedText);
    c.aiEstimate = input.decision.estimate ?? null;
    const ops: DbOp[] = [
      {
        op: 'insert',
        table: 'jobs',
        row: {
          id,
          chat_id: input.chatId,
          origin_chat_id: input.chatId,
          owner_kind: input.helperId ? 'helper' : 'foo',
          owner_id: input.helperId ?? null,
          title,
          origin: input.origin ?? 'user',
          origin_ref: input.originRef ?? input.userMessageId,
          user_message_id: input.userMessageId,
          intent,
          do_verbs: doVerbs,
          state: 'queued',
          plan_version: 1,
          step_count: plan.length,
          route: plan[0]?.route ?? null,
          uses_browser: plan.some((p) => p.route === 'browser'),
          est_minutes: minutes,
          est_tokens: tokens,
          est_cost_paise: cost,
          provider_id: pick?.providerId ?? null,
          wake_at: input.wakeAt ?? null,
          created_at: now,
        },
      },
      ...plan.map((p, idx): DbOp => ({
        op: 'insert',
        table: 'steps',
        row: { id: this.d.newId('s'), job_id: id, idx, phrase_key: p.phraseKey, slots: p.slots, state: 'pending', route: p.route },
      })),
    ];
    let planCard = false;
    if (needsPlanCard(minutes, cost) && (input.origin ?? 'user') === 'user') {
      planCard = true;
      const payload = {
        title,
        steps: plan.map((p) => phraseText(p.phraseKey as PhraseKey, 'next', p.slots) ?? ''),
        minutes,
        costLine: cost === null ? '' : formatInr(cost),
        big: isBigOne(billing, cost, s.money.aiCapPaise),
      };
      ops.push(...this.cardOps(input.chatId, 'plan', 'pending', payload, id, input.helperId ?? null).ops);
    }
    const r = await this.tx(ops);
    if (!r.ok) {
      this.d.log('job.create_failed', r.error.kind, { chatId: input.chatId });
      this.ctxs.delete(id);
      return null;
    }
    await this.writeMirrors(id);
    if (!planCard) await this.enqueue(id);
    return id;
  }

  /** 08-2 §5.4.1 enqueue: start now if a slot is free, else stay queued with the checklist showing the queued caption. */
  async enqueue(jobId: string): Promise<void> {
    await this.startNext();
    const job = await this.job(jobId);
    if (job?.state === 'queued' && job.stepCount >= 2 && !(await this.checklistOf(job))) await this.postChecklist(jobId);
  }

  /** When a slot frees, the oldest startable queued jobs start (FIFO), serialised so two callers never overfill the slots. */
  startNext(): Promise<void> {
    return this.schedule(async () => {
      const live = (await this.query<JobRow[]>('jobsByState', ['queued', 'working', 'needs_you'])) ?? [];
      const windows = live.filter((j) => j.state === 'working' && j.usesBrowser).length;
      const queue: QueueJob[] = [];
      for (const j of live) {
        const q: QueueJob = { id: j.id, state: j.state, createdAt: j.createdAt, usesBrowser: j.usesBrowser };
        if (j.state === 'needs_you') {
          // An answered card waits here until a slot frees (08-2 §5.4.1: NEEDS_YOU released its slot).
          const card = j.needsYouCardId ? await this.query<CardRow>('cardById', j.needsYouCardId) : null;
          if (card?.resolvedAt === null || !card) continue;
          q.answeredAt = card.resolvedAt;
        }
        // 08-2 §5.3.3: a job waiting on its Plan card stays queued until "Go" (found by T3: any free slot started it).
        if (j.state === 'queued') {
          const plans = (await this.query<CardRow[]>('cards.openForChat', j.chatId, 'plan')) ?? [];
          if (plans.some((p) => p.jobId === j.id && p.state === 'pending')) continue;
        }
        queue.push(q);
      }
      for (const id of pickStartable(queue, windows)) await this.start(id);
    });
  }

  /** One pass on the scheduling chain, so two callers never overfill the slots; skipped while beforeSchedule holds. */
  schedule(pass: () => Promise<void>): Promise<void> {
    const run = async () => {
      if (this.d.hooks?.beforeSchedule && !(await this.d.hooks.beforeSchedule())) return;
      await pass();
    };
    this.sched = this.sched.then(run, run).catch((e: unknown) => {
      this.d.log('job.schedule_failed', 'UNKNOWN', {});
      if (process.env.FOO_DEBUG) console.error(e);
    });
    return this.track(this.sched);
  }

  /** queued → working: a verify first when the AI was not verified in the last 10 min (AT-106). */
  private async start(jobId: string): Promise<void> {
    const job = await this.job(jobId);
    if (job?.state === 'needs_you') return this.resume(job);
    if (!job || job.state !== 'queued') return;
    const pick = this.d.ai.pick();
    if (!pick) return this.d.hooks?.onCannotStart?.(job);
    const lastVerifiedAt = this.d.settings().ai.providers[pick.providerId]?.lastVerifiedAt;
    if (needsVerify(lastVerifiedAt, this.d.clock.now())) {
      const v: { ok: boolean; kind?: string } = await this.d.ai.verify(pick.providerId).catch(() => ({ ok: false }));
      if (!v.ok) return this.d.hooks?.onCannotStart?.(job, v.kind);
    }
    const steps = await this.steps(jobId);
    const first = steps.find((s) => s.state === 'pending' || s.state === 'running');
    const now = this.d.clock.now();
    const r = await this.tx([
      {
        op: 'transition',
        table: 'jobs',
        id: jobId,
        from: ['queued'],
        to: 'working',
        set: { started_at: job.startedAt ?? now, last_progress_at: now, current_step_idx: first?.idx ?? null },
      },
      ...(first ? [{ op: 'update', table: 'steps', id: first.id, set: { state: 'running', started_at: now } } as DbOp] : []),
      ...this.badgeOp(job, 'working'),
    ]);
    if (!r.ok) return;
    this.launch(jobId);
  }

  /** Aborts a job's loop (T4: a job paused to WAITING drops the turn in flight). */
  halt(jobId: string): void {
    this.ctxs.get(jobId)?.abort.abort();
  }

  /** Starts the loop of a job now WORKING (fresh start, or answered after NEEDS_YOU). */
  launch(jobId: string): void {
    if (this.loops.has(jobId)) {
      // The old loop is still finishing its last turn (mirrors after NEEDS_YOU): start again once it ends.
      this.relaunch.add(jobId);
      return;
    }
    // A loop halted by a stuck card (or a steer) starts again with a fresh signal.
    const ctx = this.ctxs.get(jobId);
    if (ctx?.abort.signal.aborted) ctx.abort = new AbortController();
    const p = this.runJob(jobId)
      .catch(async (e: unknown) => {
        this.d.log('job.loop_crashed', 'UNKNOWN', { jobId });
        if (process.env.FOO_DEBUG) console.error(e);
        // A crashed loop must not leave a WORKING job holding a slot (T4 may take this over with recovery).
        const job = await this.job(jobId).catch(() => null);
        if (job?.state === 'working') await this.fail(job, 'UNKNOWN').catch(() => undefined);
      })
      .finally(() => {
        this.loops.delete(jobId);
        if (this.relaunch.delete(jobId)) this.launch(jobId);
        void this.startNext();
        this.keepAwake();
        if (this.busy === 0 && this.loops.size === 0) for (const w of this.idleWaiters.splice(0)) w();
      });
    this.loops.set(jobId, p);
    this.keepAwake();
  }

  /** 09 §9.22: main keeps the PC awake only while a job is WORKING. */
  private keepAwake(): void {
    this.d.link.send('power.keepAwake', { on: this.loops.size > 0, jobCount: this.loops.size });
  }

  // ---- checklist (05-1 §5.2; one message id for the life of the job, ART-17) ----

  private async postChecklist(jobId: string): Promise<void> {
    const job = await this.job(jobId);
    if (!job || TERMINAL.has(job.state) || job.stepCount < 2 || (await this.checklistOf(job))) return;
    const { ops } = this.cardOps(job.chatId, 'checklist', 'live', { jobId }, jobId, job.ownerId);
    await this.tx(ops);
  }

  private scheduleChecklist(job: JobRow, c: JobCtx): void {
    if (c.checklistTimer !== null || job.stepCount < 2) return;
    const due = Math.max(0, (job.startedAt ?? this.d.clock.now()) + CHECKLIST_AFTER_MS - this.d.clock.now());
    c.checklistTimer = this.d.clock.setTimeout(() => {
      c.checklistTimer = null;
      void this.track(this.postChecklist(job.id));
    }, due);
  }

  /** The checklist renders from the steps; an `update` with no columns bumps its rev so it re-renders in place. */
  private async editChecklistOps(job: JobRow, state?: string): Promise<DbOp[]> {
    const card = await this.checklistOf(job);
    return card ? [{ op: 'update', table: 'cards', id: card.id, set: state ? { state } : {} }] : [];
  }

  // ---- 08-2 §5.4.2 the loop ----

  private async runJob(jobId: string): Promise<void> {
    const c = this.ctx(jobId);
    let job = await this.job(jobId);
    if (!job || job.state !== 'working') return;
    // M5 T10 (08-4 §26.8 item 6): a job whose start is a future opening time sleeps until then, with no AI turn.
    if (job.wakeAt !== null && job.wakeAt > this.d.clock.now()) {
      await this.ticker.sleep(job);
      return;
    }
    c.workingSince = this.d.clock.now();
    this.scheduleChecklist(job, c);
    this.watchdog.watch(jobId);
    try {
      for (;;) {
        if (c.abort.signal.aborted) return;
        job = await this.job(jobId);
        if (!job || job.state !== 'working') return;
        // M5 T7: the RECOVERY list and an approved action run before the AI's next turn (08-4 §28.1 item 8).
        if (!(await this.gating.beforeTurn(job, c.abort.signal))) return;
        if (c.abort.signal.aborted) return;
        const turn = await this.stepTurn(job, c);
        if (turn.capped || c.abort.signal.aborted) return;
        if (turn.error) {
          await (this.d.hooks?.onAiError ?? ((j: JobRow) => this.fail(j, 'UNKNOWN')))(job, turn.error);
          return;
        }
        if (!turn.act) {
          if (await this.countFailure(job)) return;
          continue;
        }
        const goOn = await this.apply(job, c, turn.act.decision, turn.turnId);
        if (!goOn) return;
        if (await this.watchdog.check(jobId)) return;
      }
    } finally {
      this.watchdog.unwatch(jobId);
      if (c.workingSince !== null) c.workingMs += this.d.clock.now() - c.workingSince;
      c.workingSince = null;
    }
  }

  /** One decision; false when the loop ends (NEEDS_YOU or a final state). */
  private async apply(job: JobRow, c: JobCtx, decision: StepDecision, turnId: string): Promise<boolean> {
    switch (decision.kind) {
      case 'tool':
        return this.runTool(job, c, decision, turnId);
      case 'step_done':
        await this.stepDone(job, decision.idx);
        return true;
      case 'replan':
        await this.replan(job, decision.steps);
        return true;
      case 'ask': {
        // M5-T5: the engine fields of 08-4 §26.7 (ids, Best fit, livePrices, effective reversible).
        const card = decision.card;
        const payload = choiceFields({ ...card, question: this.d.prompts.filter(card.question) }, job);
        await this.needsYou(job, { type: 'choice', state: 'asking', payload: { ...payload } });
        return false;
      }
      case 'request_approval':
        // M5 T7: verified (08-4 §28.1), decided (08-2 §9.4), the card opened by main; the job waits on it.
        return this.gating.requestApproval(job, decision, c.asked);
      case 'done':
        return this.finish(job, c, decision);
      case 'fail':
        await this.fail(job, c.lastError?.kind === 'SITE_BLOCKED' ? 'SITE_BLOCKED' : 'UNKNOWN', decision.alternative);
        return false;
    }
  }

  /** fail_streak + 1; at 3 the stuck seam takes over (T3). Returns true when the loop must end. */
  async countFailure(job: JobRow): Promise<boolean> {
    const streak = job.failStreak + 1;
    await this.tx([{ op: 'update', table: 'jobs', id: job.id, set: { fail_streak: streak } }]);
    if (streak < 3) return false;
    const fresh = (await this.job(job.id)) ?? job;
    await (this.d.hooks?.onStuck ?? ((j: JobRow, rule: StuckRule) => this.watchdog.stuck(j, rule)))(fresh, 'fail_streak');
    return true;
  }

  private async runTool(job: JobRow, c: JobCtx, decision: Extract<StepDecision, { kind: 'tool' }>, turnId: string): Promise<boolean> {
    const steps = await this.steps(job.id);
    const current = steps.find((s) => s.state === 'running') ?? null;
    const gate = await this.gating.gateJob(job);
    const r: ExecResult = await this.d.tools.execute(
      { id: job.id, stepId: current?.id ?? null, turnId, gate },
      decision.call,
      c.abort.signal,
    );
    if (r.outcome === 'cancelled') return false;
    // M5 T7: a call the gate held (a refusal line, a hand-back, an app_use / offer Choice) is not a failed tool.
    if (r.gate) return this.gating.onToolGate(job, r);
    c.lastObservation = { toolCallId: r.toolCallId, tool: r.tool, text: JSON.stringify(r.result ?? null).slice(0, OBSERVATION_CAP) };
    if (r.needsUser) {
      await this.needsYou(job, r.needsUser);
      return false;
    }
    if (r.outcome === 'error') {
      const site = (r.result as { site?: unknown } | null)?.site;
      c.lastError = { kind: r.errorKind ?? 'UNKNOWN', site: typeof site === 'string' ? site : null };
      if (current) await this.tx([{ op: 'update', table: 'steps', id: current.id, set: { attempts: current.attempts + 1 } }]);
      return !(await this.countFailure(job));
    }
    c.lastError = null;
    const set: Record<string, unknown> = { fail_streak: 0 };
    if (r.changed) set.last_progress_at = this.d.clock.now();
    await this.tx([{ op: 'update', table: 'jobs', id: job.id, set }]);
    return true;
  }

  private async stepDone(job: JobRow, idx: number): Promise<void> {
    const steps = await this.steps(job.id);
    const done = steps.find((s) => s.idx === idx && (s.state === 'running' || s.state === 'pending'));
    if (!done) {
      this.d.log('job.step_done_unknown', 'VALIDATION', { jobId: job.id });
      return;
    }
    const now = this.d.clock.now();
    const next = steps.find((s) => s.idx > idx && s.state === 'pending');
    await this.tx([
      { op: 'update', table: 'steps', id: done.id, set: { state: 'done', finished_at: now, started_at: done.startedAt ?? now } },
      ...(next ? [{ op: 'update', table: 'steps', id: next.id, set: { state: 'running', started_at: now } } as DbOp] : []),
      { op: 'update', table: 'jobs', id: job.id, set: { current_step_idx: next?.idx ?? idx, last_progress_at: now, fail_streak: 0 } },
      ...(await this.editChecklistOps(job)),
    ]);
    await this.writeMirrors(job.id);
  }

  /** Done steps never change; the remaining ones are replaced (show-before inserted), plan_version + 1. */
  private async replan(job: JobRow, next: PlanStep[]): Promise<void> {
    const steps = await this.steps(job.id);
    const kept = steps.filter((s) => s.state === 'done');
    const isBanned = (x: string) => this.d.prompts.isBanned(x);
    const fresh = insertShowBefore(
      next.map((p) => {
        const r = resolvePhrase(p.phraseKey, p.slots, { inPlan: true, isBanned });
        return { phraseKey: r.key, slots: r.slots, route: p.route };
      }),
    ).slice(0, Math.max(1, PLAN_MAX - kept.length));
    const base = kept.length ? Math.max(...kept.map((s) => s.idx)) + 1 : 0;
    const now = this.d.clock.now();
    const ops: DbOp[] = [];
    fresh.forEach((p, i) => {
      const idx = base + i;
      const row = steps.find((s) => s.idx === idx);
      const set = {
        phrase_key: p.phraseKey,
        slots: p.slots,
        route: p.route,
        state: i === 0 ? 'running' : 'pending',
        started_at: i === 0 ? now : null,
        finished_at: null,
      };
      if (row) ops.push({ op: 'update', table: 'steps', id: row.id, set });
      else ops.push({ op: 'insert', table: 'steps', row: { id: this.d.newId('s'), job_id: job.id, idx, ...set } });
    });
    for (const s of steps)
      if (s.idx >= base + fresh.length && s.state !== 'done')
        ops.push({ op: 'update', table: 'steps', id: s.id, set: { state: 'skipped' } });
    ops.push({
      op: 'update',
      table: 'jobs',
      id: job.id,
      set: {
        plan_version: job.planVersion + 1,
        step_count: base + fresh.length,
        current_step_idx: base,
        uses_browser: fresh.some((p) => p.route === 'browser') || job.usesBrowser,
      },
    });
    ops.push(...(await this.editChecklistOps(job)));
    await this.tx(ops);
    await this.writeMirrors(job.id);
  }

  /** WORKING → NEEDS_YOU with its card (SM-A1 badge ⏳); the current step waits on the user; the slot is released. */
  private async needsYou(job: JobRow, card: NeedsUserCard): Promise<string | null> {
    const { cardId, ops } = this.cardOps(job.chatId, card.type, card.state, card.payload, job.id, job.ownerId);
    const steps = await this.steps(job.id);
    const current = steps.find((s) => s.state === 'running');
    const r = await this.tx([
      ...ops,
      { op: 'transition', table: 'jobs', id: job.id, from: ['working'], to: 'needs_you', set: { needs_you_card_id: cardId } },
      ...(current ? [{ op: 'update', table: 'steps', id: current.id, set: { state: 'waiting_user' } } as DbOp] : []),
      ...this.badgeOp(job, 'needs_you'),
      ...(await this.editChecklistOps(job)),
    ]);
    await this.writeMirrors(job.id);
    return r.ok ? cardId : null;
  }

  // ---- card answers (card.answered) ----

  async onCardAnswered(a: { cardId: string; choice?: string; text?: string; answer?: unknown; resolvedBy: string }): Promise<void> {
    return this.track(this.onCardAnsweredInner(a));
  }

  private async onCardAnsweredInner(a: { cardId: string; choice?: string; text?: string; answer?: unknown; resolvedBy: string }) {
    const card = await this.query<CardRow>('cardById', a.cardId);
    // T3 cards: stuck (stuck:choose), "Stop which one?" and "Fold this into which job?" (no job of their own).
    if (card?.type === 'stuck') return this.watchdog.answer(card, a.choice, a.resolvedBy);
    if (card?.type === 'choice' && card.payload.purpose === 'stop_which') return this.stopper.answerStopWhich(card, a.choice, a.resolvedBy);
    if (card?.type === 'choice' && card.payload.purpose === 'fold_which')
      return this.steering.answerFoldWhich(card, a.choice, a.resolvedBy);
    // M5 T7: main's ApprovalGate resolves an approval card itself before it tells the runner (08-2 §9.1).
    if (!card || (card.resolvedAt !== null && !APPROVAL_CARDS.has(card.type)) || !card.jobId) return;
    const job = await this.job(card.jobId);
    if (!job) return;
    const now = this.d.clock.now();
    const resolve = { resolved_by: a.resolvedBy, resolved_at: now };
    if (card.type === 'plan' && card.state === 'pending' && job.state === 'queued') {
      if (a.choice === 'go') {
        await this.tx([{ op: 'update', table: 'cards', id: card.id, set: { state: 'go', ...resolve } }]);
        await this.enqueue(job.id);
      } else if (a.choice === 'change') {
        // 08-2 §5.3.3 (M5 T10, CR-0008 (j) row 3): the user's next words go to an intake turn with the old plan attached, and
        // its Plan card shows below this one (05-3 §5.12.2: the composer reads "Tell me what to change").
        const steps = Array.isArray(card.payload.steps) ? card.payload.steps.map(String) : [];
        const r = await this.tx([
          {
            op: 'update',
            table: 'cards',
            id: card.id,
            set: { state: 'changed', ...resolve, ...(a.text ? { answer: { text: a.text } } : {}) },
          },
          {
            op: 'transition',
            table: 'jobs',
            id: job.id,
            from: ['queued'],
            to: 'cancelled',
            set: { stop_reason: 'system', finished_at: now },
          },
          ...this.badgeOp(job, 'cancelled'),
        ]);
        this.ctxs.delete(job.id);
        if (r.ok) this.planChanges.set(job.chatId, { title: job.title, steps });
      }
      return;
    }
    if (job.state !== 'needs_you' || job.needsYouCardId !== card.id) return;
    const answer = a.answer ?? (a.choice ? { optionId: a.choice } : a.text ? { text: a.text } : null);
    if (APPROVAL_CARDS.has(card.type)) {
      // M5 T8 (08-2 §9.6): a pick on a HELD card; main already moved the row and the card.
      if (a.choice === 'held_action' || a.choice === 'held_own') {
        const own = await this.gating.onHeldPick(job, card, a.choice);
        if (own !== null)
          this.ctx(job.id).decisions.push(this.scrub(`- Q: ${t('cards.approval.held.mismatch', heldVars(card))} → A: ${own}`));
        await this.writeMirrors(job.id);
        return this.startNext();
      }
      if (a.choice === 'decline') return this.declined(job, card, resolve);
      if (a.choice !== 'approve') return;
      await this.gating.onApproved(job, card.id);
    }
    // M5 (T5): a Skip is stored `skipped` so the card reads "Skipped. I'll go with {Best fit}." (05-1 §5.3.2).
    const answered = APPROVAL_CARDS.has(card.type)
      ? 'APPROVED'
      : (answer as { skip?: true } | null)?.skip
        ? 'skipped'
        : ANSWERED_STATE[card.type];
    // The answer is kept on the card; the job stays NEEDS_YOU until a slot is free (max 3 WORKING), then resumes.
    const r = await this.tx([
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { ...(answered ? { state: answered } : {}), ...resolve, ...(answer ? { answer } : {}) },
      },
    ]);
    if (!r.ok) return;
    if (card.type === 'choice') {
      const options = (card.payload.options as { id: string; label: string }[] | undefined) ?? [];
      const label = options.find((o) => o.id === a.choice)?.label ?? a.text ?? '';
      const q = String(card.payload.question ?? '');
      this.ctx(job.id).decisions.push(this.scrub(`- Q: ${q} → A: ${label}`));
      await this.gating.onChoiceAnswered(job, card, a.choice);
      await this.writeMirrors(job.id);
    }
    await this.startNext();
  }

  /** NEEDS_YOU → WORKING once its card is answered and a slot is free (08-4 §26.9 item 5). */
  private async resume(job: JobRow): Promise<void> {
    const now = this.d.clock.now();
    const steps = await this.steps(job.id);
    const waiting = steps.find((s) => s.state === 'waiting_user');
    const r = await this.tx([
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['needs_you'],
        to: 'working',
        set: { needs_you_card_id: null, last_progress_at: now },
      },
      ...(waiting ? [{ op: 'update', table: 'steps', id: waiting.id, set: { state: 'running' } } as DbOp] : []),
      ...this.badgeOp(job, 'working'),
      ...(await this.editChecklistOps(job)),
    ]);
    if (!r.ok) return;
    this.launch(job.id);
  }

  /** Decline on an approval / payment card: NEEDS_YOU → CANCELLED (07-2 §4 `declined`, stop_reason approval_declined). */
  private async declined(job: JobRow, card: CardRow, resolve: Record<string, unknown>): Promise<void> {
    const now = this.d.clock.now();
    const steps = await this.steps(job.id);
    const r = await this.tx([
      { op: 'update', table: 'cards', id: card.id, set: { state: 'DECLINED', ...resolve, answer: { optionId: 'decline' } } },
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['needs_you'],
        to: 'cancelled',
        set: { needs_you_card_id: null, stop_reason: 'approval_declined', finished_at: now },
      },
      ...steps
        .filter((s) => s.state === 'waiting_user' || s.state === 'pending' || s.state === 'running')
        .map((s): DbOp => ({ op: 'update', table: 'steps', id: s.id, set: { state: 'skipped' } })),
      ...this.badgeOp(job, 'cancelled'),
      ...(await this.editChecklistOps(job, 'stopped')),
      // M5 T7 (AT-110, 07-2 §4): no other route is known in M5, so the line closes with "Nothing else to do here."
      this.textOp(job, t('thread.approval.declined', { next: t('thread.approval.declined.nothing_else') })),
    ]);
    if (!r.ok) return;
    await this.ended(job.id, this.ctx(job.id));
    await this.startNext();
  }

  // ---- 08-2 §5.8 finish ----

  private async finish(job: JobRow, c: JobCtx, d: Extract<StepDecision, { kind: 'done' }>): Promise<boolean> {
    if (!d.proof && d.unverified !== true) {
      // AT-119: "All done!" without a proof object or the unverified flag is not an end; the runner's state stays.
      this.d.log('job.done_without_proof', 'PROOF_INVALID', { jobId: job.id });
      return !(await this.countFailure(job));
    }
    const stored = new Map<string, string>();
    for (const tc of (await this.query<{ id: string; result: unknown; outcome: string | null }[]>('toolCallsForJob', job.id)) ?? [])
      if (tc.outcome === 'ok') stored.set(tc.id, JSON.stringify(tc.result ?? null));
    const check = checkProof(d.proof, {
      raw: this.d.tools.rawResults(job.id),
      stored: (id) => stored.get(id) ?? null,
      jobDir: path.join(this.d.dataDir, 'jobs', job.id),
      exists: (f) => existsSync(f),
      ...(this.d.scrub ? { scrub: this.d.scrub } : {}),
    });
    if (d.proof && !check.ok) this.d.log('job.proof_unchecked', 'PROOF_INVALID', { jobId: job.id });
    const to: JobState = check.ok ? 'done' : 'done_unverified';
    const now = this.d.clock.now();
    const resultId = this.d.newId('m');
    const steps = await this.steps(job.id);
    const ops: DbOp[] = [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: resultId,
          chat_id: job.chatId,
          author_kind: job.ownerId ? 'helper' : 'foo',
          author_id: job.ownerId,
          kind: 'text',
          text: this.d.prompts.filter(d.result),
          status: 'complete',
          job_id: job.id,
          created_at: now,
        },
      },
      ...steps
        .filter((s) => s.state === 'running' || s.state === 'pending' || s.state === 'waiting_user')
        .map((s): DbOp => ({
          op: 'update',
          table: 'steps',
          id: s.id,
          set: s.state === 'pending' ? { state: 'skipped' } : { state: 'done', finished_at: now },
        })),
      {
        op: 'transition',
        table: 'jobs',
        id: job.id,
        from: ['working'],
        to,
        set: { proof: check.ok ? d.proof : null, finished_at: now, result_message_id: resultId, last_progress_at: now },
      },
      ...this.badgeOp(job, to),
      ...(await this.editChecklistOps(job, to)),
    ];
    // A refused move (the job left WORKING meanwhile, e.g. a stop) rolls the whole write back: nothing to end here.
    if ((await this.tx(ops)).ok) await this.ended(job.id, c);
    return false;
  }

  // ---- FAILED + error card with one alternative (AT-117) ----

  async fail(job: JobRow, kind: 'SITE_BLOCKED' | 'UNKNOWN', alternative?: { kind: string; [k: string]: unknown }): Promise<void> {
    const c = this.ctx(job.id);
    const site = c.lastError?.site ?? job.siteDomain ?? '';
    let action: FixAction;
    if (alternative?.kind === 'retry' || alternative?.kind === 'dismiss') action = { kind: alternative.kind };
    else if (alternative?.kind === 'open_url' && typeof alternative.url === 'string' && /^https:\/\//.test(alternative.url))
      action = { kind: 'open_url', url: alternative.url };
    else {
      // The AI may fill only retry, open_url or dismiss (M4 pack §4); otherwise the runner's own pick.
      if (alternative) this.d.log('job.fix_action_refused', 'PROTOCOL_FIX_ACTION', { jobId: job.id });
      const domain = domainOf(site);
      action =
        kind === 'SITE_BLOCKED' && domain
          ? { kind: 'open_url', url: `https://${domain}/` }
          : kind === 'UNKNOWN'
            ? { kind: 'retry' }
            : { kind: 'dismiss' };
    }
    const words = errorCopy(kind, site);
    const payload = {
      variant: 'error',
      kind,
      whatHappened: words.whatHappened,
      whatIsSafe: words.whatIsSafe,
      button: { label: words.label, action },
      jobId: job.id,
    };
    const now = this.d.clock.now();
    const steps = await this.steps(job.id);
    const current = steps.find((s) => s.state === 'running' || s.state === 'waiting_user');
    const r = await this.tx([
      ...this.cardOps(job.chatId, 'error', 'asking', payload, job.id, job.ownerId).ops,
      { op: 'transition', table: 'jobs', id: job.id, from: ['working'], to: 'failed', set: { finished_at: now } },
      ...(current ? [{ op: 'update', table: 'steps', id: current.id, set: { state: 'failed', finished_at: now } } as DbOp] : []),
      ...this.badgeOp(job, 'failed'),
      ...(await this.editChecklistOps(job, 'failed')),
    ]);
    if (r.ok) await this.ended(job.id, c);
  }

  private async ended(jobId: string, c: JobCtx): Promise<void> {
    if (c.checklistTimer !== null) this.d.clock.clearTimeout(c.checklistTimer);
    c.checklistTimer = null;
    if (c.workingSince !== null) c.workingMs += this.d.clock.now() - c.workingSince;
    c.workingSince = null;
    await this.writeMirrors(jobId);
    this.d.tools.clearJob(jobId);
    this.ctxs.delete(jobId);
    this.steering.forget(jobId);
    this.watchdog.forget(jobId);
    this.gating.forget(jobId);
    // A slot may have freed for a job paused at the AI cap.
    void this.cost.resumeCapped();
  }

  // ---- G-M4-01 retry: a new linked job; the old one never moves (AT-120) ----

  async retry(jobId: string, newJobId: string): Promise<Result<{ newJobId: string }>> {
    return this.track(this.retryInner(jobId, newJobId));
  }

  private async retryInner(jobId: string, newJobId: string): Promise<Result<{ newJobId: string }>> {
    const old = await this.job(jobId);
    if (!old) return { ok: false, error: { kind: 'JOB_GONE' } };
    if (old.state !== 'failed' && old.state !== 'cancelled') return { ok: false, error: { kind: 'VALIDATION' } };
    // One retry per job: a second "Try again" on the same old job is refused (the new job is the one to retry).
    const all = (await this.query<JobRow[]>('jobsByState', [...JOB_STATES])) ?? [];
    if (all.some((j) => j.origin === 'retry' && j.originRef === old.id)) return { ok: false, error: { kind: 'VALIDATION' } };
    const steps = (await this.steps(jobId)).filter((s) => s.state !== 'skipped');
    const now = this.d.clock.now();
    const ctx = this.ctx(newJobId);
    ctx.asked = old.title;
    const r = await this.tx([
      {
        op: 'insert',
        table: 'jobs',
        row: {
          id: newJobId,
          chat_id: old.chatId,
          origin_chat_id: old.originChatId,
          owner_kind: old.ownerKind,
          owner_id: old.ownerId,
          title: retryTitle(old.title),
          origin: 'retry',
          origin_ref: old.id,
          user_message_id: old.userMessageId,
          intent: old.intent,
          do_verbs: old.doVerbs,
          state: 'queued',
          plan_version: 1,
          step_count: steps.length,
          route: old.route,
          uses_browser: old.usesBrowser,
          est_minutes: old.estMinutes,
          est_tokens: old.estTokens,
          est_cost_paise: old.estCostPaise,
          provider_id: old.providerId,
          created_at: now,
        },
      },
      ...steps.map((s, idx): DbOp => ({
        op: 'insert',
        table: 'steps',
        row: { id: this.d.newId('s'), job_id: newJobId, idx, phrase_key: s.phraseKey, slots: s.slots, state: 'pending', route: s.route },
      })),
      ...(old.userMessageId
        ? [{ op: 'update', table: 'messages', id: old.userMessageId, set: { badge: BADGE_OF_STATE.queued } } as DbOp]
        : []),
    ]);
    if (!r.ok) {
      this.ctxs.delete(newJobId);
      return { ok: false, error: { kind: r.error.kind } };
    }
    await this.writeMirrors(newJobId);
    await this.enqueue(newJobId);
    return { ok: true, value: { newJobId } };
  }

  // ---- one step turn (08-2 §7; ai_turns row per call, 08-4 §26.12) ----

  private jobBlock(job: JobRow, steps: StepRow[], c: JobCtx): string {
    const lines = [
      'The job:',
      `Title: ${job.title}`,
      `You may: ${job.doVerbs.length ? job.doVerbs.join(', ') : 'only look (no booking, paying, sending or deleting)'}`,
      `Plan (version ${job.planVersion}):`,
      ...steps
        .filter((s) => s.state !== 'skipped')
        .map(
          (s, i) =>
            `${i + 1}. [${STEP_LABEL[s.state]}] ${phraseText(s.phraseKey as PhraseKey, 'next', s.slots as Record<string, string>) ?? s.phraseKey}`,
        ),
      'Approved so far:',
    ];
    // M5 T7 (08-4 §24.22): approved actions, the RECOVERY list once after a restart, the APPROVAL_EVIDENCE retry line.
    const g = this.gating.blockParts(job.id);
    lines.push(...(g.approved.length ? g.approved : ['- none yet']));
    if (c.decisions.length) lines.push('Decisions:', ...c.decisions);
    const avoid = this.watchdog.avoidList(job.id);
    if (avoid.length) lines.push(`Avoid: ${avoid.join(', ')}`);
    if (g.recovery) lines.push('Unfinished from before the restart (check before repeating any):', ...g.recovery);
    if (g.retry) lines.push(g.retry);
    if (c.lastObservation)
      lines.push(`Last observation (${c.lastObservation.toolCallId}, ${c.lastObservation.tool}):`, c.lastObservation.text);
    return lines.join('\n');
  }

  private async stepTurn(job: JobRow, c: JobCtx): Promise<{ act: StepAct | null; error?: AiErrorKind; turnId: string; capped?: boolean }> {
    const pick = this.d.ai.pick();
    const turnId = this.d.newId('t');
    if (!pick) return { act: null, error: 'AI_SERVICE_DOWN', turnId };
    // 08-2 §5.4.2: drainSteer, then capCheck, then the turn.
    const steer = await this.steering.drain(job);
    const steps = await this.steps(job.id);
    const memory = await buildMemoryParts((q, ...args) => this.query(q, ...args), {
      chatId: job.chatId,
      text: stepQueryText(c.asked, job.title, steps),
      timeZone: this.d.settings().locale.timeZone,
      now: this.d.clock.now(),
    });
    const built = this.d.prompts.buildStep(this.jobBlock(job, steps, c), this.d.tools.catalogue(), memory, steer);
    const maxOut = this.d.ai.turnParams(pick.providerId, 'step').maxOutputTokens;
    if (!(await this.cost.allowStep(job, built.system.length + built.prompt.length, maxOut))) {
      await this.steering.settle(job, null, '');
      return { act: null, turnId, capped: true };
    }
    const result = await this.stepTurnInner(job, c, pick, turnId, built);
    await this.steering.settle(job, result.act, result.say ?? '');
    return result;
  }

  private async stepTurnInner(
    job: JobRow,
    c: JobCtx,
    pick: { providerId: ProviderId; billing: 'plan' | 'key' | 'local' },
    turnId: string,
    built: { system: string; prompt: string },
  ): Promise<{ act: StepAct | null; error?: AiErrorKind; turnId: string; say?: string; capped?: boolean }> {
    const run = async (purpose: 'step' | 'repair', id: string, system: string, prompt: string) => {
      const startedAt = this.d.clock.now();
      const params = this.d.ai.turnParams(pick.providerId, purpose === 'repair' ? 'repair' : 'step');
      let r: TurnResult;
      try {
        r = await this.d.ai.runTurn(
          pick.providerId,
          { ...params, turnId: id, purpose, system, prompt, chatId: job.chatId },
          { onText: () => {}, onSession: () => {} },
          c.abort.signal,
        );
      } catch {
        this.d.log('job.ai_turn_threw', 'UNKNOWN', { jobId: job.id, chatId: job.chatId });
        r = {
          text: '',
          usage: { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null },
          stopReason: 'error',
          errorKind: 'UNKNOWN',
        };
      }
      await this.recordTurn(job, pick, id, purpose, startedAt, r, {
        tokensIn: Math.ceil((system.length + prompt.length) / 3.5),
        tokensOut: params.maxOutputTokens,
      });
      return r;
    };
    const r = await run('step', turnId, built.system, built.prompt);
    if (r.stopReason === 'cancelled' || c.abort.signal.aborted) return { act: null, turnId };
    if (r.stopReason !== 'end') {
      this.d.ai.reportError(pick.providerId, r.errorKind ?? 'UNKNOWN', r.resetAt);
      return { act: null, error: r.errorKind ?? 'UNKNOWN', turnId };
    }
    this.d.ai.reportOk(pick.providerId);
    const parsed = this.d.prompts.parseStep(r.text);
    if (parsed.act) return { act: parsed.act, turnId, say: parsed.say ?? '' };
    // 08-2 §7.5: one repair turn in the same session.
    const repairPrompt = this.d.prompts.buildRepair(parsed.issues ?? '');
    // M5 T10 (CR-0008 (j) row 5): the repair turn is a key call too, so it passes the cap check first.
    const repairOut = this.d.ai.turnParams(pick.providerId, 'repair').maxOutputTokens;
    if (!(await this.cost.allowStep(job, built.system.length + repairPrompt.length, repairOut))) return { act: null, turnId, capped: true };
    const repair = await run('repair', this.d.newId('t'), built.system, repairPrompt);
    const again = repair.stopReason === 'end' ? this.d.prompts.parseStep(repair.text) : null;
    if (!again?.act) this.d.log('job.protocol_invalid', 'PROTOCOL_INVALID', { jobId: job.id });
    return { act: again?.act ?? null, turnId, say: again?.say ?? '' };
  }

  private async recordTurn(
    job: JobRow,
    pick: { providerId: ProviderId; billing: 'plan' | 'key' | 'local' },
    turnId: string,
    purpose: 'step' | 'repair' | 'classify' | 'second_look',
    startedAt: number,
    r: TurnResult,
    /** 08-4 §26.3 item 5: unreported usage adds the estimate to spent_tokens_* (the stuck cost rule only). */
    estimate?: { tokensIn: number; tokensOut: number },
  ): Promise<void> {
    const cost = this.d.ai.costPaise(pick.providerId, r.usage, r.modelReported);
    const outcome =
      r.stopReason === 'end' ? 'ok' : r.stopReason === 'cancelled' ? 'cancelled' : r.errorKind === 'AI_TIMEOUT' ? 'timeout' : 'error';
    const fresh = (await this.job(job.id)) ?? job;
    await this.tx([
      {
        op: 'insert',
        table: 'ai_turns',
        row: {
          id: turnId,
          chat_id: job.chatId,
          job_id: job.id,
          purpose,
          provider_id: pick.providerId,
          model_reported: r.modelReported ?? null,
          session_id: r.sessionId ?? null,
          tokens_in: r.usage.tokensIn,
          tokens_out: r.usage.tokensOut,
          tokens_cache_read: r.usage.cacheRead,
          tokens_cache_write: r.usage.cacheWrite,
          cost_paise: cost.paise,
          cost_source: cost.source,
          billing: pick.billing,
          duration_ms: this.d.clock.now() - startedAt,
          outcome,
          error_kind: outcome === 'ok' ? null : (r.errorKind ?? 'UNKNOWN'),
          started_at: startedAt,
        },
      },
      {
        op: 'update',
        table: 'jobs',
        id: job.id,
        set: {
          spent_tokens_in: fresh.spentTokensIn + (r.usage.tokensIn ?? estimate?.tokensIn ?? 0),
          spent_tokens_out: fresh.spentTokensOut + (r.usage.tokensOut ?? estimate?.tokensOut ?? 0),
          spent_cost_paise: fresh.spentCostPaise + (cost.paise ?? 0),
          ...(cost.paise === null ? { cost_unknown: 1 } : {}),
        },
      },
    ]);
  }

  // ---- 08-1 §4.1.2 mirrors ----

  async writeMirrors(jobId: string): Promise<void> {
    const job = await this.job(jobId);
    if (!job) return;
    const steps = await this.steps(jobId);
    const c = this.ctxs.get(jobId);
    const now = this.d.clock.now();
    const workingMs = (c?.workingMs ?? 0) + (c?.workingSince !== null && c?.workingSince !== undefined ? now - c.workingSince : 0);
    const state = {
      schemaVersion: 1,
      job,
      steps,
      approvals: [],
      payments: [],
      steerQueue: this.steering.queue.pending(jobId),
      estimate: { minutes: job.estMinutes, tokens: job.estTokens, costPaise: job.estCostPaise },
      actual: { tokens: job.spentTokensIn + job.spentTokensOut, costPaise: job.spentCostPaise },
      workingMs,
      ...(c?.aiEstimate ? { aiEstimate: c.aiEstimate } : {}),
      writtenAt: now,
    };
    const planLines = steps
      .filter((s) => s.state !== 'skipped')
      .map((s, i) => {
        const form = s.state === 'done' ? 'done' : 'next';
        return `${i + 1}. [${s.state === 'done' ? 'x' : ' '}] ${phraseText(s.phraseKey as PhraseKey, form, s.slots as Record<string, string>) ?? s.phraseKey}`;
      });
    const plan = [
      `# ${job.title}`,
      `Asked: ${this.scrub(c?.asked ?? '')}`,
      ...planLines,
      'Decisions:',
      ...(c?.decisions ?? []),
      `Route: ${job.route ?? 'api'}`,
    ].join('\n');
    await this.tx([
      { op: 'mirror', kind: 'job_state', id: jobId, text: JSON.stringify(state) },
      { op: 'mirror', kind: 'plan_md', id: jobId, text: plan },
    ]);
  }
}
