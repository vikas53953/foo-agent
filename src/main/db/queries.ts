// Spec: 08-1 §2.4.1 (NamedQuery: named, prepared, read-only; the names are exactly this file's exported keys; every query adds
// `deleted_at IS NULL` for chats and messages), 08-2 §7.2 part 7 (the conversation the chat lane sends: the last 20
// completed messages of the chat, `text_for_ai ?? text`), 04 §3.3 (messages waiting to send). M3 has the queries the chat
// lane uses; later milestones add their names here (a new name is a constitution change, 08-1 §2.4.1). M4 (CR-0008): the job
// runner's reads — jobs, steps, tool calls (08-2 §5.9 step 5), activity (stop report, 08-2 §5.7 step 4), open cards,
// approvals (stub until M5), the month's AI spend (08-2 §5.10), and the round-2 names 'jobs.liveForChat', 'cards.openForChat'.
import type { Db } from '../store/db';
import type { ActivityRow, CardRow, CardType, JobRow, StepRow } from '../../shared/types';
import { cardRow, parseJson, stepRow, type DbRow } from './rows';
import { fooChatId, jobRows } from '../store/queries';

/** What every named query gets: the database and the injected clock's now (JobRow.slow is derived from it). */
export interface QueryCtx {
  db: Db;
  now: number;
}

export interface EngineChat {
  id: string;
  kind: 'foo' | 'helper' | 'group' | 'wa_mirror';
  title: string;
  helperId: string | null;
  private: boolean;
}
export interface EngineMessage {
  id: string;
  chatId: string;
  seq: number;
  authorKind: 'user' | 'foo' | 'helper' | 'system';
  authorId: string | null;
  kind: 'text' | 'voice' | 'card' | 'marker';
  text: string;
  textForAi: string | null;
  status: 'queued' | 'sent' | 'streaming' | 'complete' | 'failed';
  badge: string | null;
  createdAt: number;
  transcript: string | null;
  attachments: number;
}
export interface EngineHelper {
  id: string;
  name: string;
  jobText: string;
  goodResult: string | null;
  paused: boolean;
}

function chat(r: DbRow): EngineChat {
  return {
    id: String(r.id),
    kind: r.kind as EngineChat['kind'],
    title: String(r.title),
    helperId: (r.helper_id as string | null) ?? null,
    private: r.private === 1,
  };
}
function message(r: DbRow): EngineMessage {
  const atts = r.attachments ? (JSON.parse(String(r.attachments)) as unknown[]) : [];
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    seq: Number(r.seq),
    authorKind: r.author_kind as EngineMessage['authorKind'],
    authorId: (r.author_id as string | null) ?? null,
    kind: r.kind as EngineMessage['kind'],
    text: String(r.text),
    textForAi: (r.text_for_ai as string | null) ?? null,
    status: r.status as EngineMessage['status'],
    badge: (r.badge as string | null) ?? null,
    createdAt: Number(r.created_at),
    transcript: (r.transcript as string | null) ?? null,
    attachments: atts.length,
  };
}

export interface EngineToolCall {
  id: string;
  jobId: string;
  stepId: string | null;
  turnId: string | null;
  tool: string;
  actionClass: string;
  sideEffect: boolean;
  idemKey: string | null;
  args: unknown;
  result: unknown;
  observationRef: string | null;
  gate: string;
  approvalId: string | null;
  outcome: 'ok' | 'error' | 'cancelled' | 'unknown' | null;
  errorKind: string | null;
  startedAt: number;
  finishedAt: number | null;
}
export interface EngineApproval {
  id: string;
  cardId: string;
  jobId: string;
  chatId: string;
  verb: string;
  state: string;
  expiresAt: number;
  submittedAt: number | null;
}

const LIVE_JOB_STATES = ['queued', 'working', 'needs_you', 'waiting'];
const OPEN_APPROVAL_STATES = ['PENDING', 'APPROVED', 'HELD', 'RUNNING', 'CHECKING'];

function toolCall(r: DbRow): EngineToolCall {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    stepId: (r.step_id as string | null) ?? null,
    turnId: (r.turn_id as string | null) ?? null,
    tool: String(r.tool),
    actionClass: String(r.action_class),
    sideEffect: Number(r.side_effect) === 1,
    idemKey: (r.idem_key as string | null) ?? null,
    args: parseJson<unknown>(r.args, {}),
    result: parseJson<unknown>(r.result, null),
    observationRef: (r.observation_ref as string | null) ?? null,
    gate: String(r.gate),
    approvalId: (r.approval_id as string | null) ?? null,
    outcome: (r.outcome as EngineToolCall['outcome']) ?? null,
    errorKind: (r.error_kind as string | null) ?? null,
    startedAt: Number(r.started_at),
    finishedAt: r.finished_at === null || r.finished_at === undefined ? null : Number(r.finished_at),
  };
}
function activity(r: DbRow): ActivityRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r.id),
    at: Number(r.at),
    kind: r.kind as ActivityRow['kind'],
    event: String(r.event),
    actor: String(r.actor),
    chatId: n(r.chat_id),
    chatTitle: n(r.chat_title),
    jobId: n(r.job_id),
    approvalId: n(r.approval_id),
    paymentId: n(r.payment_id),
    routineId: n(r.routine_id),
    summary: String(r.summary),
    toLabel: n(r.to_label),
    fromLabel: n(r.from_label),
    amountPaise: r.amount_paise === null || r.amount_paise === undefined ? null : Number(r.amount_paise),
    approvedHow: (r.approved_how as ActivityRow['approvedHow']) ?? null,
    ruleText: n(r.rule_text),
    proofKind: n(r.proof_kind),
    proofRef: n(r.proof_ref),
    outcome: r.outcome as ActivityRow['outcome'],
    fields: parseJson<Record<string, unknown> | null>(r.fields, null),
  };
}
const inList = (n: number) => Array.from({ length: n }, () => '?').join(', ');
function openCards(db: Db, chatId: unknown, type?: unknown): CardRow[] {
  const byType = type === undefined || type === null ? '' : ' AND type = ?';
  const args = byType ? [String(chatId), String(type as CardType)] : [String(chatId)];
  return (
    db
      .prepare(`SELECT * FROM cards WHERE chat_id = ? AND deleted_at IS NULL AND resolved_at IS NULL${byType} ORDER BY created_at`)
      .all(...args) as DbRow[]
  ).map(cardRow);
}

/** Every named query: `({ db, now }, ...args) => result`. */
export const NAMED_QUERIES = {
  chatOpen: ({ db }: QueryCtx, chatId: unknown): EngineChat | null => {
    const r = db.prepare('SELECT * FROM chats WHERE id = ? AND deleted_at IS NULL').get(String(chatId)) as DbRow | undefined;
    return r ? chat(r) : null;
  },
  /** The newest `limit` messages before `beforeSeq` (or the newest of all), oldest first. */
  messagesBefore: ({ db }: QueryCtx, chatId: unknown, beforeSeq: unknown, limit: unknown): EngineMessage[] => {
    const rows = db
      .prepare(`SELECT * FROM messages WHERE chat_id = ? AND deleted_at IS NULL AND seq < ? ORDER BY seq DESC LIMIT ?`)
      .all(
        String(chatId),
        beforeSeq === null || beforeSeq === undefined ? Number.MAX_SAFE_INTEGER : Number(beforeSeq),
        Number(limit ?? 20),
      ) as DbRow[];
    return rows.reverse().map(message);
  },
  messageById: ({ db }: QueryCtx, messageId: unknown): EngineMessage | null => {
    const r = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL').get(String(messageId)) as DbRow | undefined;
    return r ? message(r) : null;
  },
  /** 04 §3.3 Waiting to send: user messages saved while foo could not hand them on, oldest first. */
  messagesQueued: ({ db }: QueryCtx): EngineMessage[] =>
    (
      db
        .prepare(
          `SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id
            WHERE m.status = 'queued' AND m.author_kind = 'user' AND m.deleted_at IS NULL AND c.deleted_at IS NULL
            ORDER BY m.created_at, m.seq`,
        )
        .all() as DbRow[]
    ).map(message),
  'helpers.byId': ({ db }: QueryCtx, helperId: unknown): EngineHelper | null => {
    const r = db.prepare('SELECT * FROM helpers WHERE id = ? AND deleted_at IS NULL').get(String(helperId)) as DbRow | undefined;
    return r
      ? {
          id: String(r.id),
          name: String(r.name),
          jobText: String(r.job_text),
          goodResult: (r.good_result as string | null) ?? null,
          paused: r.paused === 1,
        }
      : null;
  },
  // ---- M4: the job runner ----
  jobById: ({ db, now }: QueryCtx, jobId: unknown): JobRow | null => jobRows(db, 'id = ?', [String(jobId)], now)[0] ?? null,
  /** Jobs in any of the states, oldest first (FIFO by created_at, 08-2 §5.4.1). */
  jobsByState: ({ db, now }: QueryCtx, states: unknown): JobRow[] => {
    const list = (Array.isArray(states) ? states : [states]).map(String);
    return list.length ? jobRows(db, `state IN (${inList(list.length)}) ORDER BY created_at, id`, list, now) : [];
  },
  stepsForJob: ({ db }: QueryCtx, jobId: unknown): StepRow[] =>
    (db.prepare('SELECT * FROM steps WHERE job_id = ? ORDER BY idx').all(String(jobId)) as DbRow[]).map(stepRow),
  toolCallsForJob: ({ db }: QueryCtx, jobId: unknown): EngineToolCall[] =>
    (db.prepare('SELECT * FROM tool_calls WHERE job_id = ? ORDER BY started_at, id').all(String(jobId)) as DbRow[]).map(toolCall),
  /** 08-2 §5.9 step 5: side-effect calls that started and never finished (outcome NULL) or were marked unknown. */
  toolCallsUnknown: ({ db }: QueryCtx, jobId?: unknown): EngineToolCall[] => {
    const byJob = jobId === undefined || jobId === null ? '' : ' AND job_id = ?';
    return (
      db
        .prepare(
          `SELECT * FROM tool_calls WHERE side_effect = 1 AND (outcome IS NULL OR outcome = 'unknown')${byJob} ORDER BY started_at, id`,
        )
        .all(...(byJob ? [String(jobId)] : [])) as DbRow[]
    ).map(toolCall);
  },
  /** 08-2 §5.7 step 4: the stop report is built only from these rows. */
  activityForJob: ({ db }: QueryCtx, jobId: unknown): ActivityRow[] =>
    (db.prepare('SELECT * FROM activity WHERE job_id = ? ORDER BY at, id').all(String(jobId)) as DbRow[]).map(activity),
  /** Cards of the chat not yet resolved (resolved_at NULL), oldest first. */
  cardsOpenForChat: ({ db }: QueryCtx, chatId: unknown): CardRow[] => openCards(db, chatId),
  cardById: ({ db }: QueryCtx, cardId: unknown): CardRow | null => {
    const r = db.prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(String(cardId)) as DbRow | undefined;
    return r ? cardRow(r) : null;
  },
  /** Approvals of the job that are not final (M5 writes them; M4 reads them for stop and recovery). */
  approvalsOpenForJob: ({ db }: QueryCtx, jobId: unknown): EngineApproval[] =>
    (
      db
        .prepare(`SELECT * FROM approvals WHERE job_id = ? AND state IN (${inList(OPEN_APPROVAL_STATES.length)}) ORDER BY created_at`)
        .all(String(jobId), ...OPEN_APPROVAL_STATES) as DbRow[]
    ).map((r) => ({
      id: String(r.id),
      cardId: String(r.card_id),
      jobId: String(r.job_id),
      chatId: String(r.chat_id),
      verb: String(r.verb),
      state: String(r.state),
      expiresAt: Number(r.expires_at),
      submittedAt: r.submitted_at === null || r.submitted_at === undefined ? null : Number(r.submitted_at),
    })),
  /** 08-2 §5.10: metered AI spend (billing 'key') between fromMs (inclusive) and toMs (exclusive); unknown-cost turns counted apart. */
  monthAiSpend: ({ db }: QueryCtx, fromMs: unknown, toMs: unknown): { paise: number; turns: number; unknownTurns: number } => {
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(cost_paise), 0) AS paise, COUNT(*) AS turns, SUM(CASE WHEN cost_paise IS NULL THEN 1 ELSE 0 END) AS unknown
           FROM ai_turns WHERE billing = 'key' AND started_at >= ? AND started_at < ?`,
      )
      .get(Number(fromMs), Number(toMs)) as DbRow;
    return { paise: Number(r.paise ?? 0), turns: Number(r.turns ?? 0), unknownTurns: Number(r.unknown ?? 0) };
  },
  /** X-124: the chat's jobs in queued, working, needs_you or waiting, oldest first. */
  'jobs.liveForChat': ({ db, now }: QueryCtx, chatId: unknown): JobRow[] =>
    jobRows(
      db,
      `chat_id = ? AND state IN (${inList(LIVE_JOB_STATES.length)}) ORDER BY created_at, id`,
      [String(chatId), ...LIVE_JOB_STATES],
      now,
    ),
  /** X-124: the chat's open cards of one type. */
  'cards.openForChat': ({ db }: QueryCtx, chatId: unknown, type: unknown): CardRow[] => openCards(db, chatId, type),
  /** foo's chat (kind 'foo', not private): where the safe-mode card goes (08-2 §5.9 step 1). */
  'chats.foo': ({ db }: QueryCtx): string | null => fooChatId(db),
} as const;
