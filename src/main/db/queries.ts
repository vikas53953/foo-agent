// Spec: 08-1 §2.4.1 (NamedQuery: named, prepared, read-only; the names are exactly this file's exported keys; every query adds
// `deleted_at IS NULL` for chats and messages), 08-2 §7.2 part 7 (the conversation the chat lane sends: the last 20
// completed messages of the chat, `text_for_ai ?? text`), 04 §3.3 (messages waiting to send). M3 has the queries the chat
// lane uses; later milestones add their names here (a new name is a constitution change, 08-1 §2.4.1). M4 (CR-0008): the job
// runner's reads — jobs, steps, tool calls (08-2 §5.9 step 5), activity (stop report, 08-2 §5.7 step 4), open cards,
// approvals (stub until M5), the month's AI spend (08-2 §5.10), and the round-2 names 'jobs.liveForChat', 'cards.openForChat'.
// M6 (CR-0010): memory reads for the engine — facts with their hash (tombstones, dedupe), live tombstones, the retrieval
// sets of 08-4 §24.16 (parts 5/5b with the Art. 14 group exclusion; T4 owns those two bodies) and the week count (08-3 §12.7).
import type { Db } from '../store/db';
import type {
  ActivityRow,
  CardRow,
  CardType,
  JobRow,
  MemoryCategory,
  MemoryKind,
  MemoryOrigin,
  MemoryProvenance,
  MemoryScope,
  StepRow,
} from '../../shared/types';
import { cardRow, parseJson, stepRow, type DbRow } from './rows';
import { jobRows } from '../store/queries';

/** What every named query gets: the database and the injected clock's now (JobRow.slow is derived from it). */
export interface QueryCtx {
  db: Db;
  now: number;
}

/** memory_index camelCased, hash included (the engine needs it; MemoryFactView drops it). */
export interface EngineFact {
  id: string;
  file: string;
  lineNo: number;
  scope: MemoryScope;
  chatId: string | null;
  text: string;
  provenance: MemoryProvenance;
  origin: string;
  originKind: MemoryOrigin;
  reason: string | null;
  category: MemoryCategory | null;
  kind: MemoryKind;
  sensitive: boolean;
  private: boolean;
  learnedAt: number;
  lastUsedAt: number | null;
  useCount: number;
  hash: string;
}
export interface EngineTombstone {
  hash: string;
  originKind: MemoryOrigin;
  forgottenAt: number;
  expiresAt: number;
}

function engineFact(r: DbRow): EngineFact {
  return {
    id: String(r.id),
    file: String(r.file),
    lineNo: Number(r.line_no),
    scope: r.scope as MemoryScope,
    chatId: r.chat_id == null ? null : String(r.chat_id),
    text: String(r.text),
    provenance: r.provenance as MemoryProvenance,
    origin: String(r.origin),
    originKind: r.origin_kind as MemoryOrigin,
    reason: r.reason == null ? null : String(r.reason),
    category: (r.category as MemoryCategory | null) ?? null,
    kind: r.kind as MemoryKind,
    sensitive: Number(r.sensitive) === 1,
    private: Number(r.private) === 1,
    learnedAt: Number(r.learned_at),
    lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at),
    useCount: Number(r.use_count),
    hash: String(r.hash),
  };
}

/**
 * Art. 14 / 08-4 §24.16: in a group chat, no private fact, and no about-you or chat-scope fact unless it has a live
 * `memory_group_grants` row (askShare, 08-3 §12.5.1; chat-scope facts live in about-you.md, X-112, so the grant covers both).
 */
function groupExclusion(alias: string): string {
  return `AND ${alias}.private = 0 AND (
    (${alias}.file <> 'memory/about-you.md' AND ${alias}.scope <> 'chat')
    OR EXISTS (SELECT 1 FROM memory_group_grants g WHERE g.fact_id = ${alias}.id AND g.chat_id = ? AND g.until > ?))`;
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
  // ---- M6 memory (CR-0010) ----
  'memory.byId': ({ db }: QueryCtx, factId: unknown): EngineFact | null => {
    const r = db.prepare('SELECT * FROM memory_index WHERE id = ?').get(String(factId)) as DbRow | undefined;
    return r ? engineFact(r) : null;
  },
  'memory.byFile': ({ db }: QueryCtx, file: unknown): EngineFact[] =>
    (db.prepare('SELECT * FROM memory_index WHERE file = ? ORDER BY line_no').all(String(file)) as DbRow[]).map(engineFact),
  'memory.all': ({ db }: QueryCtx): EngineFact[] =>
    (db.prepare('SELECT * FROM memory_index ORDER BY file, line_no').all() as DbRow[]).map(engineFact),
  /** J17: a live tombstone for the same hash and origin kind blocks re-learning for 90 days. */
  memoryTombstoned: ({ db, now }: QueryCtx, hash: unknown, originKind: unknown): boolean =>
    !!db
      .prepare('SELECT 1 FROM memory_tombstones WHERE hash = ? AND origin_kind = ? AND expires_at > ?')
      .get(String(hash), String(originKind), now),
  'memory.tombstones': ({ db, now }: QueryCtx): EngineTombstone[] =>
    (db.prepare('SELECT * FROM memory_tombstones WHERE expires_at > ? ORDER BY forgotten_at').all(now) as DbRow[]).map((r) => ({
      hash: String(r.hash),
      originKind: r.origin_kind as MemoryOrigin,
      forgottenAt: Number(r.forgotten_at),
      expiresAt: Number(r.expires_at),
    })),
  /**
   * 08-4 §24.16 part 5 candidates for one chat: identity rows, global rows, this chat's chat-scope rows, this helper's notes;
   * order `use_count DESC, learned_at DESC`. retrieval.ts cuts at 4,000 chars (identity rows outside the budget).
   */
  memoryByScope: ({ db, now }: QueryCtx, chatId: unknown): EngineFact[] => {
    const chat = db.prepare('SELECT kind, helper_id FROM chats WHERE id = ?').get(String(chatId)) as DbRow | undefined;
    if (!chat) return [];
    const group = chat.kind === 'group';
    const helperFile = chat.helper_id ? `helpers/${String(chat.helper_id)}/notes.md` : '';
    const sql = `SELECT m.* FROM memory_index m
      WHERE (m.scope = 'global' OR (m.scope = 'chat' AND m.chat_id = ?) OR (m.scope = 'helper' AND m.file = ?))
      ${group ? groupExclusion('m') : ''}
      ORDER BY m.use_count DESC, m.learned_at DESC`;
    const args: unknown[] = [String(chatId), helperFile, ...(group ? [String(chatId), now] : [])];
    return (db.prepare(sql).all(...args) as DbRow[]).map(engineFact);
  },
  /**
   * 08-4 §24.16 part 5b: ≤ `limit` (max 8) FTS rows for a prepared MATCH string (retrieval.ts `ftsMatch`), not in
   * `excludeIds` (the facts already pinned), `bm25 ASC, use_count DESC, learned_at DESC`; the same scope and group rule.
   */
  memorySearch: ({ db, now }: QueryCtx, chatId: unknown, match: unknown, limit: unknown, excludeIds?: unknown): EngineFact[] => {
    const chat = db.prepare('SELECT kind, helper_id FROM chats WHERE id = ?').get(String(chatId)) as DbRow | undefined;
    if (!chat || typeof match !== 'string' || !match.trim()) return [];
    const group = chat.kind === 'group';
    const helperFile = chat.helper_id ? `helpers/${String(chat.helper_id)}/notes.md` : '';
    const sql = `SELECT m.* FROM memory_fts f JOIN memory_index m ON m.rowid = f.rowid
      WHERE memory_fts MATCH ?
        AND (m.scope = 'global' OR (m.scope = 'chat' AND m.chat_id = ?) OR (m.scope = 'helper' AND m.file = ?))
        ${group ? groupExclusion('m') : ''}
        AND m.id NOT IN (SELECT value FROM json_each(?))
      ORDER BY bm25(memory_fts) ASC, m.use_count DESC, m.learned_at DESC LIMIT ?`;
    const exclude = JSON.stringify(Array.isArray(excludeIds) ? excludeIds.map(String) : []);
    const args: unknown[] = [
      match,
      String(chatId),
      helperFile,
      ...(group ? [String(chatId), now] : []),
      exclude,
      Math.min(Number(limit) || 8, 8),
    ];
    return (db.prepare(sql).all(...args) as DbRow[]).map(engineFact);
  },
  /** 08-3 §12.7 step 5 / §14.2 `memory_week`: facts learned in the last 7 days. */
  'memory.weekCount': ({ db, now }: QueryCtx): number =>
    Number((db.prepare('SELECT COUNT(*) AS n FROM memory_index WHERE learned_at > ?').get(now - 7 * 86_400_000) as DbRow).n),
  /** 08-0 §G (B-3): the facts used in a chat since `sinceMs`, newest first (the "Used:" chip and review input). */
  memoryUsedInChat: ({ db }: QueryCtx, chatId: unknown, sinceMs: unknown): { factId: string; jobId: string | null; at: number }[] =>
    (
      db
        .prepare('SELECT fact_id, job_id, at FROM memory_uses WHERE chat_id = ? AND at >= ? ORDER BY at DESC')
        .all(String(chatId), Number(sinceMs) || 0) as DbRow[]
    ).map((r) => ({ factId: String(r.fact_id), jobId: r.job_id == null ? null : String(r.job_id), at: Number(r.at) })),
} as const;
