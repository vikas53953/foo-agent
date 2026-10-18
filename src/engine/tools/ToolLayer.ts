// Spec: 08-2 §8 (tool layer; the runner calls `execute`, the gate decides inside it, §9), §5.6 (progress = an ok result that
// changed the observation hash), 08-4 §26.9 item 6 (observation hash of a non-browser tool = sha256 of the redacted result
// JSON), §26.11 (`observe` keeps the pre-redaction text in RAM only, ≤ 16 KB per call, keyed by tool call id, cleared on a
// terminal state), §27.1 (part 3: one line per tool `- {tool}({args}): {description}{askNote}`), 08-1 §4.3.4 (tool_calls row:
// args and result redacted, result ≤ 16 KB; idem_key for side_effect=1, X-113; IDEMPOTENT_REPEAT unless a read ran in the
// job since), 11.4 (Redactor on everything stored). CR-0008 G-M4-05 (built in M4; M8 connectors and M9 browser plug in here).
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../shared/canon';
import type { Clock } from '../../shared/clock';
import { redactSecrets } from '../../shared/redactor';
import type { CardType, ErrorKind } from '../../shared/types';
import type { ToolCallAct } from '../../shared/schemas';
import type { DbOp, DbTxReply, MainLink } from '../protocol';
import type { Result } from '../../shared/errors';
import type { ActionClass, GateLogic } from '../gate/GateLogic';

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
}

export interface ToolLayerDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'tc'): string;
  tools: ToolRegistry;
  gate: GateLogic;
  log(evt: string, kind?: string, ids?: { jobId?: string }): void;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function redactDeep(v: unknown): unknown {
  if (typeof v === 'string') return redactSecrets(v).text;
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)]));
  return v;
}

/** Cut a JSON text to ≤ 16 KB (UTF-8) by characters; stored and kept results never exceed it. */
function capText(text: string): string {
  if (Buffer.byteLength(text, 'utf8') <= RAW_MAX_BYTES) return text;
  let end = Math.min(text.length, RAW_MAX_BYTES);
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > RAW_MAX_BYTES) end -= 256;
  return text.slice(0, Math.max(0, end));
}

export class ToolLayer {
  /** jobId → toolCallId → pre-redaction result text (§26.11 item 1; RAM only). */
  private raw = new Map<string, Map<string, string>>();
  private lastHash = new Map<string, string>();
  /** jobId → idem keys of side-effect calls since the last read call (IDEMPOTENT_REPEAT). */
  private idem = new Map<string, Set<string>>();

  constructor(private d: ToolLayerDeps) {}

  /** System part 3 (§27.1): the tools a job may use, one line each. */
  catalogue(): string {
    return Object.values(this.d.tools)
      .map(
        (t) =>
          `- ${t.name}(${t.args}): ${t.description}${t.actionClass === 'read' || t.actionClass === 'prepare' ? '' : ' (asks the user first)'}`,
      )
      .join('\n');
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
  }

  private tx(ops: DbOp[]): Promise<Result<DbTxReply>> {
    return this.d.link.request<DbTxReply>('db.tx', { ops });
  }

  async execute(
    job: { id: string; stepId: string | null; turnId: string | null },
    call: ToolCallAct,
    signal: AbortSignal,
  ): Promise<ExecResult> {
    const id = this.d.newId('tc');
    const startedAt = this.d.clock.now();
    const def = this.d.tools[call.tool];
    const cls: ActionClass = def?.actionClass ?? 'read';
    const sideEffect = cls !== 'read';
    const args = call.args ?? {};
    const idemKey = sideEffect ? sha256([job.id, job.stepId ?? '', call.tool, canonicalJson(args), ''].join('|')) : null;
    const base = {
      id,
      job_id: job.id,
      step_id: job.stepId,
      turn_id: job.turnId,
      tool: call.tool,
      action_class: cls,
      side_effect: sideEffect ? 1 : 0,
      args: redactDeep(args),
      started_at: startedAt,
    };
    const refused = async (gate: 'blocked', errorKind: ErrorKind): Promise<ExecResult> => {
      await this.tx([
        { op: 'insert', table: 'tool_calls', row: { ...base, gate, outcome: 'error', error_kind: errorKind, finished_at: startedAt } },
      ]);
      this.d.log('tool.refused', errorKind, { jobId: job.id });
      return { toolCallId: id, tool: call.tool, outcome: 'error', errorKind, result: null, changed: false };
    };
    if (!def) return refused('blocked', 'VALIDATION');
    if (this.d.gate.decide(cls) === 'REFUSE') return refused('blocked', 'VALIDATION');
    const seen = this.idem.get(job.id) ?? new Set<string>();
    if (idemKey && seen.has(idemKey)) return refused('blocked', 'IDEMPOTENT_REPEAT');

    // The row exists before the call runs (outcome NULL), so a crash leaves it for 08-2 §5.9 step 5.
    await this.tx([{ op: 'insert', table: 'tool_calls', row: { ...base, idem_key: idemKey, gate: 'auto' } }]);
    let out: ToolOutcome;
    try {
      out = await def.run(args, { jobId: job.id, signal, now: startedAt });
    } catch {
      out = { kind: 'error', errorKind: 'UNKNOWN' };
    }
    const cancelled = signal.aborted;
    const outcome = cancelled ? 'cancelled' : out.kind === 'error' ? 'error' : 'ok';
    const rawText = capText(JSON.stringify(out.result ?? null));
    const redacted = redactDeep(out.result ?? null);
    const fullText = JSON.stringify(redacted);
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
      if (cls === 'read') seen.clear();
      if (idemKey) seen.add(idemKey);
      this.idem.set(job.id, seen);
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
