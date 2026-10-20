// Spec: 08-2 §8 (tool layer; the runner calls `execute`, the gate decides inside it, §9), §5.6 (progress = an ok result that
// changed the observation hash), 08-4 §26.9 item 6 (observation hash of a non-browser tool = sha256 of the redacted result
// JSON), §26.11 (`observe` keeps the pre-redaction text in RAM only, ≤ 16 KB per call, keyed by tool call id, cleared on a
// terminal state), §27.1 (part 3: one line per tool `- {tool}({args}): {description}{askNote}`), 08-1 §4.3.4 (tool_calls row:
// args and result redacted, result ≤ 16 KB; idem_key for side_effect=1, X-113; IDEMPOTENT_REPEAT unless a read ran in the
// job since), 11.4 (Redactor on everything stored). CR-0008 G-M4-05 (built in M4; M8 connectors and M9 browser plug in here).
// M5 T7: 08-2 §9.4 (`GateLogic.decide` runs for every tool call), pack M5 §7 risk 1 (the boundary: a side-effect tool runs
// only with an APPROVED approval id, through `executeApproved`; AI-called fill / submit / send and every acting class →
// USE_SUBMIT), §5.9 step 5 (a call left `unknown` by a crash is not repeated until a read has run), §11.4 R4 (`Redactor.scrub`:
// registry + patterns on every stored and observed result; CR-0008 (j) row 6; map review fix 11).
// M5 T8: §5.9.5 held `unknown` calls are matched by (tool, redacted args) for the whole job (T7 review hand-off).
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../shared/canon';
import type { Clock } from '../../shared/clock';
import { redactSecrets } from '../../shared/redactor';
import type { CardType, ErrorKind } from '../../shared/types';
import type { ToolCallAct } from '../../shared/schemas';
import type { DbOp, DbTxReply, MainLink } from '../protocol';
import type { Result } from '../../shared/errors';
import type { ActionClass, GateDecision, GateJob, GateLogic } from '../gate/GateLogic';
import { ACTING, ENGINE_ONLY, classOf } from '../gate/classes';

export const RAW_MAX_BYTES = 16 * 1024;

/** A card the step needs from the user (choice, approval, payment, sign-in, code): the runner opens it and goes NEEDS_YOU. */
export interface NeedsUserCard {
  type: CardType;
  state: string;
  payload: Record<string, unknown>;
}

export type ToolOutcome =
  | { kind: 'ok'; result: unknown }
  | { kind: 'error'; errorKind: ErrorKind; result?: unknown }
  | { kind: 'needs_user'; card: NeedsUserCard; result?: unknown };

export interface ToolContext {
  jobId: string;
  /** M6 T5: the step turn that made the call (`memory.propose`: one call per turn, 08-2 §8.2). */
  turnId?: string | null;
  signal: AbortSignal;
  now: number;
}

export interface ToolDef {
  name: string;
  actionClass: ActionClass;
  /** §27.1 `{args}` as printed for the AI. */
  args: string;
  /** §27.1 description, exact. */
  description: string;
  run(args: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}
export type ToolRegistry = Readonly<Record<string, ToolDef>>;

export interface ExecResult {
  toolCallId: string;
  tool: string;
  outcome: 'ok' | 'error' | 'cancelled';
  errorKind?: ErrorKind;
  /** The redacted result (what is stored and what the AI sees as the last observation). */
  result: unknown;
  /** The observation hash moved (08-2 §5.6 progress). */
  changed: boolean;
  needsUser?: NeedsUserCard;
  // M5
  /** T7: the gate did not run the call and the runner acts on it (REFUSE line, HAND_BACK, an app_use / offer_action Choice). */
  gate?: Exclude<GateDecision, { kind: 'EXECUTE' | 'CARD' | 'DRAFT_SEND' }>;
}

/** The job a call runs for (08-2 §9.4 reads intent, do_verbs, the owner and this job's app answers). */
export interface ToolJob {
  id: string;
  stepId: string | null;
  turnId: string | null;
  gate?: GateJob;
}

export interface ToolLayerDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'tc'): string;
  tools: ToolRegistry;
  gate: GateLogic;
  log(evt: string, kind?: string, ids?: { jobId?: string }): void;
  // M5
  /** T7: 08-2 §11.4 R4, the Redactor's registry + pattern scrub; the pattern scrub alone when absent (unit tests). */
  scrub?(text: string): { text: string };
  // M8
  /** T5 (08-4 §27.1 "connected apps"): false hides a tool from the catalogue; every tool is listed when absent. */
  listed?(tool: string): boolean;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function redactDeep(v: unknown, scrub: (t: string) => { text: string }): unknown {
  if (typeof v === 'string') return scrub(v).text;
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, scrub));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x, scrub)]));
  return v;
}

/** A job with no gate facts (unit tests of the M4 seams): a `do` job that may do nothing, owned by foo. */
const NO_GATE_JOB = (id: string): GateJob => ({ id, intent: 'do', doVerbs: [], ownerId: null, appAnswers: new Map() });

/** Cut a JSON text to ≤ 16 KB (UTF-8) by characters; stored and kept results never exceed it. */
function capText(text: string): string {
  if (Buffer.byteLength(text, 'utf8') <= RAW_MAX_BYTES) return text;
  let end = Math.min(text.length, RAW_MAX_BYTES);
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > RAW_MAX_BYTES) end -= 256;
  return text.slice(0, Math.max(0, end));
}

/** M5 T8: the key a held `unknown` call is matched by (tool and the args as stored, redacted). */
const heldKey = (tool: string, args: unknown): string => `${tool}|${canonicalJson(args ?? {})}`;

export class ToolLayer {
  /** jobId → toolCallId → pre-redaction result text (§26.11 item 1; RAM only). */
  private raw = new Map<string, Map<string, string>>();
  private lastHash = new Map<string, string>();
  /** jobId → idem keys of side-effect calls since the last read call (IDEMPOTENT_REPEAT). */
  private idem = new Map<string, Set<string>>();
  /** M5 T8: jobId → `tool|canonical redacted args` of calls a crash left `unknown`, held for the whole job until a read ran. */
  private held = new Map<string, Set<string>>();

  constructor(private d: ToolLayerDeps) {}

  private redact(v: unknown): unknown {
    return redactDeep(v, (t) => (this.d.scrub ? this.d.scrub(t) : redactSecrets(t)));
  }

  /**
   * 08-2 §5.9 step 5: this job's calls a crash left `unknown`. Each is refused (IDEMPOTENT_REPEAT) until a read tool has run
   * in the job. M5 T8 (T7 review): keyed by tool and the stored (redacted) args for the whole job, not by the step or
   * approval in the idem key, so the same call from a later step is held too.
   */
  holdUnknown(jobId: string, calls: readonly { tool: string; args: unknown }[]): void {
    const held = this.held.get(jobId) ?? new Set<string>();
    for (const c of calls) held.add(heldKey(c.tool, c.args));
    this.held.set(jobId, held);
  }

  /** System part 3 (§27.1): the tools a job may use, one line each. */
  catalogue(): string {
    return (
      Object.values(this.d.tools)
        // M9 T8 (08-4 §27.1): engine-only tools (`browser.submit`, `browser.fillCard`, the sends) are never listed.
        .filter((t) => !ENGINE_ONLY.has(t.name) && (this.d.listed?.(t.name) ?? true))
        .map(
          (t) =>
            `- ${t.name}(${t.args}): ${t.description}${t.actionClass === 'read' || t.actionClass === 'prepare' ? '' : ' (asks the user first)'}`,
        )
        .join('\n')
    );
  }

  rawResult(jobId: string, toolCallId: string): string | undefined {
    return this.raw.get(jobId)?.get(toolCallId);
  }
  /** The ids of this job's tool calls whose pre-redaction result is in RAM. */
  rawResults(jobId: string): ReadonlyMap<string, string> {
    return this.raw.get(jobId) ?? new Map();
  }
  /** §26.11: cleared when the job reaches a terminal state. */
  clearJob(jobId: string): void {
    this.raw.delete(jobId);
    this.lastHash.delete(jobId);
    this.idem.delete(jobId);
    this.held.delete(jobId);
  }

  private tx(ops: DbOp[]): Promise<Result<DbTxReply>> {
    return this.d.link.request<DbTxReply>('db.tx', { ops });
  }

  /** An AI tool call (08-2 §8): the gate decides; acting classes never run from here (pack §7 risk 1). */
  execute(job: ToolJob, call: ToolCallAct, signal: AbortSignal): Promise<ExecResult> {
    return this.run(job, call, signal, null);
  }

  /**
   * M5 T8 (review 7): the engine's fresh-terms re-read (08-2 §9.4.2) of a read the job already ran. It goes through the gate
   * like any call but leaves the IDEMPOTENT_REPEAT and held-`unknown` sets as they are: it is not the AI's read that §5.9
   * step 5 waits for.
   */
  reread(job: ToolJob, call: ToolCallAct, signal: AbortSignal): Promise<ExecResult> {
    return this.run(job, call, signal, null, true);
  }

  /**
   * The engine's one call of a side-effect tool after its approval went APPROVED → RUNNING (08-4 §28.1 item 8, §29.1): the
   * gate already decided (the card), so only the idem rule applies; the row carries `gate='approved'` and the approval id.
   */
  executeApproved(job: ToolJob, call: ToolCallAct, approvalId: string, signal: AbortSignal): Promise<ExecResult> {
    return this.run(job, call, signal, approvalId);
  }

  private async run(
    job: ToolJob,
    call: ToolCallAct,
    signal: AbortSignal,
    approvalId: string | null,
    keepSets = false,
  ): Promise<ExecResult> {
    const id = this.d.newId('tc');
    const startedAt = this.d.clock.now();
    const def = this.d.tools[call.tool];
    const args = call.args ?? {};
    const cls: ActionClass = def ? classOf(call.tool, def.actionClass, args) : 'read';
    const sideEffect = cls !== 'read';
    const idemKey = sideEffect ? sha256([job.id, job.stepId ?? '', call.tool, canonicalJson(args), approvalId ?? ''].join('|')) : null;
    const base = {
      id,
      job_id: job.id,
      step_id: job.stepId,
      turn_id: job.turnId,
      tool: call.tool,
      action_class: cls,
      side_effect: sideEffect ? 1 : 0,
      args: this.redact(args),
      started_at: startedAt,
      ...(approvalId ? { approval_id: approvalId } : {}),
    };
    const refused = async (
      gate: 'blocked' | 'handed_back',
      errorKind: ErrorKind | null,
      extra: Partial<ExecResult> = {},
    ): Promise<ExecResult> => {
      await this.tx([
        { op: 'insert', table: 'tool_calls', row: { ...base, gate, outcome: 'error', error_kind: errorKind, finished_at: startedAt } },
      ]);
      this.d.log('tool.refused', errorKind ?? gate, { jobId: job.id });
      return {
        toolCallId: id,
        tool: call.tool,
        outcome: 'error',
        ...(errorKind ? { errorKind } : {}),
        result: null,
        changed: false,
        ...extra,
      };
    };
    if (!def) return refused('blocked', 'VALIDATION');
    let gateCol: 'auto' | 'approved' | 'rule' = 'auto';
    if (approvalId) {
      if (!ACTING.has(cls) && !ENGINE_ONLY.has(call.tool)) return refused('blocked', 'VALIDATION');
      gateCol = 'approved';
    } else {
      // 08-2 §9.4: the permission row first, then the app, the read-only branch, the hard limit.
      const decision = this.d.gate.decide(job.gate ?? NO_GATE_JOB(job.id), { tool: call.tool, cls, args });
      if (decision.kind === 'REFUSE') return refused('blocked', decision.error ?? null, { gate: decision });
      if (decision.kind === 'HAND_BACK') return refused('handed_back', null, { gate: decision });
      if (decision.kind === 'ASK_CHOICE') {
        this.d.log('tool.asked', decision.purpose, { jobId: job.id });
        return { toolCallId: id, tool: call.tool, outcome: 'error', result: null, changed: false, gate: decision };
      }
      // The boundary (pack §7 risk 1): fill / submit / send and every acting class need an APPROVED approval id, which only
      // the engine's executeApproved carries. The AI asks with request_approval (or a Draft card) instead.
      if (ENGINE_ONLY.has(call.tool) || ACTING.has(cls) || decision.kind !== 'EXECUTE') return refused('blocked', 'USE_SUBMIT');
      if (decision.approvedVia === 'rule') gateCol = 'rule';
    }
    const seen = this.idem.get(job.id) ?? new Set<string>();
    if (idemKey && seen.has(idemKey)) return refused('blocked', 'IDEMPOTENT_REPEAT');
    if (sideEffect && this.held.get(job.id)?.has(heldKey(call.tool, base.args))) return refused('blocked', 'IDEMPOTENT_REPEAT');

    // The row exists before the call runs (outcome NULL), so a crash leaves it for 08-2 §5.9 step 5.
    await this.tx([{ op: 'insert', table: 'tool_calls', row: { ...base, idem_key: idemKey, gate: gateCol } }]);
    let out: ToolOutcome;
    try {
      out = await def.run(args, { jobId: job.id, turnId: job.turnId, signal, now: startedAt });
    } catch {
      out = { kind: 'error', errorKind: 'UNKNOWN' };
    }
    let rawText: string;
    let redacted: unknown;
    let fullText: string;
    try {
      rawText = capText(JSON.stringify(out.result ?? null));
      redacted = this.redact(out.result ?? null);
      fullText = JSON.stringify(redacted);
    } catch {
      // A result JSON cannot hold (BigInt, a cycle) is the tool's error, never a crash of the job's loop.
      out = { kind: 'error', errorKind: 'UNKNOWN' };
      rawText = 'null';
      redacted = null;
      fullText = 'null';
    }
    const cancelled = signal.aborted;
    const outcome = cancelled ? 'cancelled' : out.kind === 'error' ? 'error' : 'ok';
    const redactedText = capText(fullText);
    // A result over 16 KB is stored as its first part, marked cut (08-1 §4.3.4: result ≤ 16 KB).
    const stored: unknown = redactedText === fullText ? redacted : { cut: true, text: capText(fullText.slice(0, RAW_MAX_BYTES - 1024)) };
    let changed = false;
    if (outcome === 'ok') {
      const jobRaw = this.raw.get(job.id) ?? new Map<string, string>();
      jobRaw.set(id, rawText);
      this.raw.set(job.id, jobRaw);
      const h = sha256(redactedText);
      changed = this.lastHash.get(job.id) !== h;
      this.lastHash.set(job.id, h);
      if (!keepSets) {
        if (cls === 'read') {
          seen.clear();
          this.held.delete(job.id);
        }
        if (idemKey) seen.add(idemKey);
        this.idem.set(job.id, seen);
      }
    }
    await this.tx([
      {
        op: 'update',
        table: 'tool_calls',
        id,
        set: {
          result: stored,
          outcome,
          error_kind: out.kind === 'error' ? out.errorKind : null,
          finished_at: this.d.clock.now(),
        },
      },
    ]);
    const r: ExecResult = { toolCallId: id, tool: call.tool, outcome, result: redacted, changed };
    if (out.kind === 'error') r.errorKind = out.errorKind;
    if (out.kind === 'needs_user' && !cancelled) r.needsUser = out.card;
    return r;
  }
}
