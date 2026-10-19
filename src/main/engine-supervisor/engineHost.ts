// Spec: 08-1 §2.4.1 (db.tx = one SQLite transaction; any failing op rolls back all; reply `{ ids, revs }`; DB_* failure kinds;
// `transition` → DB_BAD_TRANSITION when the current state is not in `from`; `update` with a stale `expectRev` → DB_STALE_REV;
// derived chat columns are written only by main inside the transaction of the triggering op, §4.6 rule 7, X-129; a DbOp
// naming one of them → DB_NOT_WRITABLE), §4.5.1 (card states validated on every write → VALIDATION), §4.1.2 (mirrors written
// temp + replace by main), §4.6 rule 2 (stored text goes through the Redactor), §2.4 (ui.patch is forwarded to the renderer
// as-is), 07-2 §4 (job machine, src/shared/jobMachine.ts). Main is the single writer (08-1 §1.1). CR-0008.
import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from '../../shared/errors';
import { isCardState } from '../../shared/cards';
import { canTransition } from '../../shared/jobMachine';
import type { ActivityOpRow, DbOp, DbTxReply } from '../../engine/protocol';
import type { Db } from '../store/db';
import { nextSeq } from '../store/composerQueries';
import { redactRow, writeRedacted, writeRedactedJson } from '../store/writeRedacted';
import { recomputePill } from '../store/queries';
import { NAMED_QUERIES, type QueryCtx } from '../db/queries';
import { newId } from '../../shared/ids';

const JOB_COLUMNS = [
  'id',
  'chat_id',
  'origin_chat_id',
  'owner_kind',
  'owner_id',
  'title',
  'origin',
  'origin_ref',
  'user_message_id',
  'intent',
  'do_verbs',
  'state',
  'waiting_reason',
  'wake_at',
  'needs_you_card_id',
  'plan_version',
  'current_step_idx',
  'step_count',
  'route',
  'site_domain',
  'uses_browser',
  'est_minutes',
  'est_tokens',
  'est_cost_paise',
  'spent_tokens_in',
  'spent_tokens_out',
  'spent_cost_paise',
  'cost_unknown',
  'provider_id',
  'ai_session_id',
  'fail_streak',
  'stuck_count',
  'proof',
  'result_message_id',
  'stop_reason',
  'created_at',
  'started_at',
  'last_progress_at',
  'finished_at',
];
const STEP_COLUMNS = ['id', 'job_id', 'idx', 'phrase_key', 'slots', 'state', 'attempts', 'route', 'started_at', 'finished_at'];
const TOOL_CALL_COLUMNS = [
  'id',
  'job_id',
  'step_id',
  'turn_id',
  'tool',
  'action_class',
  'side_effect',
  'idem_key',
  'args',
  'result',
  'observation_ref',
  'gate',
  'approval_id',
  'outcome',
  'error_kind',
  'started_at',
  'finished_at',
];
const CARD_COLUMNS = [
  'id',
  'chat_id',
  'message_id',
  'job_id',
  'type',
  'state',
  'payload',
  'answer',
  'nonce',
  'expires_at',
  'resolved_by',
  'resolved_at',
  'supersedes_id',
  'created_at',
  'updated_at',
];
const AI_TURN_COLUMNS = [
  'id',
  'chat_id',
  'job_id',
  'routine_id',
  'purpose',
  'provider_id',
  'model_reported',
  'session_id',
  'tokens_in',
  'tokens_out',
  'tokens_cache_read',
  'tokens_cache_write',
  'cost_paise',
  'cost_source',
  'billing',
  'duration_ms',
  'outcome',
  'error_kind',
  'started_at',
];

/** Columns the engine may set on insert, per table (anything else → DB_NOT_WRITABLE). */
const INSERT_COLUMNS: Record<string, readonly string[]> = {
  messages: [
    'id',
    'chat_id',
    'author_kind',
    'author_id',
    'kind',
    'marker_kind',
    'text',
    'text_for_ai',
    'status',
    'badge',
    'reply_to_id',
    'job_id',
    'card_id',
    'prompted',
    'why',
    'provider_note',
    'created_at',
    'lang',
  ],
  ai_turns: AI_TURN_COLUMNS,
  reactions: ['message_id', 'by', 'emoji', 'created_at'],
  jobs: JOB_COLUMNS,
  steps: STEP_COLUMNS,
  tool_calls: TOOL_CALL_COLUMNS,
  cards: CARD_COLUMNS,
};
/** Columns the engine may change with `update` (ids, owners and creation times never move; `jobs.state` only by transition). */
const UPDATE_COLUMNS: Record<string, readonly string[]> = {
  messages: ['text', 'status', 'badge', 'provider_note', 'job_id'],
  ai_turns: AI_TURN_COLUMNS.filter((c) => c !== 'id'),
  jobs: JOB_COLUMNS.filter(
    (c) => !['id', 'chat_id', 'origin_chat_id', 'owner_kind', 'origin', 'origin_ref', 'created_at', 'state'].includes(c),
  ),
  steps: STEP_COLUMNS.filter((c) => !['id', 'job_id', 'idx'].includes(c)),
  tool_calls: TOOL_CALL_COLUMNS.filter((c) => !['id', 'job_id', 'started_at', 'idem_key'].includes(c)),
  cards: ['state', 'payload', 'answer', 'expires_at', 'resolved_by', 'resolved_at', 'supersedes_id', 'job_id'],
};
/** JSON columns: an object or array is stored as JSON text; `redactRow` then scrubs the §4.6 rule 2 ones leaf by leaf. */
const JSON_COLUMNS: Record<string, readonly string[]> = {
  jobs: ['do_verbs', 'proof'],
  steps: ['slots'],
  tool_calls: ['args', 'result'],
  cards: ['payload', 'answer'],
};
/** Tables whose rows carry `rev` (08-0 §B.1: every UPDATE bumps it). */
const HAS_REV = new Set(['messages', 'jobs', 'steps', 'cards']);

export interface TxEffects {
  messageIds: Set<string>;
  chatIds: Set<string>;
  jobIds: Set<string>;
  cardIds: Set<string>;
}
export interface TxOptions {
  /** Epoch ms for derived columns (`pill_until`), card `updated_at` and activity `at` (the injected clock). */
  now?: number;
  /** `{DATA}`: mirrors (`jobs\{id}\…`) and `activity.jsonl` are written under it. Without it a `mirror` op is DB_NOT_WRITABLE. */
  dataDir?: string;
}

type DbFailKind = 'DB_NOT_WRITABLE' | 'DB_STALE_REV' | 'DB_CONSTRAINT' | 'DB_BAD_TRANSITION' | 'VALIDATION';
class DbOpError extends Error {
  constructor(
    readonly kind: DbFailKind,
    detail?: string,
  ) {
    super(detail ?? kind);
  }
}

const emptyEffects = (): TxEffects => ({ messageIds: new Set(), chatIds: new Set(), jobIds: new Set(), cardIds: new Set() });

function checkColumns(cols: string[], allowed: readonly string[] | undefined): void {
  if (!allowed) throw new DbOpError('DB_NOT_WRITABLE');
  for (const c of cols) if (!allowed.includes(c)) throw new DbOpError('DB_NOT_WRITABLE', `${c} is not writable`);
}

/** JSON columns to text; booleans to 0/1. Redaction (§4.6 rule 2) is `redactRow`'s, after this. */
function normalise(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    let x = v;
    if (JSON_COLUMNS[table]?.includes(k) && x !== null && x !== undefined) {
      let parsed: unknown = x;
      if (typeof x === 'string') {
        try {
          parsed = JSON.parse(x);
        } catch {
          throw new DbOpError('VALIDATION', `${table}.${k} is not JSON`);
        }
      }
      x = JSON.stringify(parsed);
    }
    if (typeof x === 'boolean') x = x ? 1 : 0;
    out[k] = x;
  }
  return out;
}

function chatOfJob(db: Db, jobId: string): string | null {
  const r = db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(jobId) as { chat_id: string } | undefined;
  return r ? r.chat_id : null;
}

function noteJob(db: Db, jobId: string, fx: TxEffects): void {
  fx.jobIds.add(jobId);
  const chatId = chatOfJob(db, jobId);
  if (chatId) fx.chatIds.add(chatId);
}

function insertRow(db: Db, op: Extract<DbOp, { op: 'insert' }>, fx: TxEffects, now: number): { id: string; rev: number } {
  checkColumns(Object.keys(op.row), INSERT_COLUMNS[op.table]);
  // Art. 8 / §4.6 rule 2: every listed text column (and the op's `redact` list) is stored redacted (Store.writeRedacted).
  const row = redactRow(op.table, normalise(op.table, op.row), op.redact ?? []);
  if (op.table === 'messages') {
    const chatId = String(row.chat_id);
    const seq = nextSeq(db, chatId);
    const cols = [...Object.keys(row), 'seq'];
    db.prepare(`INSERT INTO messages (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row), seq);
    const unread = row.author_kind === 'user' ? 'unread_count' : 'unread_count + 1';
    db.prepare(
      `UPDATE chats SET next_seq = ?, last_message_id = ?, last_activity_at = ?, unread_count = ${unread}, rev = rev + 1 WHERE id = ?`,
    ).run(seq + 1, row.id, row.created_at, chatId);
    fx.messageIds.add(String(row.id));
    fx.chatIds.add(chatId);
    return { id: String(row.id), rev: 1 };
  }
  if (op.table === 'cards') {
    if (!isCardState(String(row.type), String(row.state))) throw new DbOpError('VALIDATION', `card state ${String(row.state)}`);
    if (row.updated_at === undefined) row.updated_at = row.created_at ?? now;
  }
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${op.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row));
  if (op.table === 'reactions') {
    const messageId = String(row.message_id);
    db.prepare('UPDATE messages SET rev = rev + 1 WHERE id = ?').run(messageId);
    fx.messageIds.add(messageId);
    return { id: messageId, rev: 1 };
  }
  const id = String(row.id);
  if (op.table === 'jobs') noteJob(db, id, fx);
  if (op.table === 'steps' || op.table === 'tool_calls') noteJob(db, String(row.job_id), fx);
  if (op.table === 'cards') {
    fx.cardIds.add(id);
    fx.chatIds.add(String(row.chat_id));
  }
  return { id, rev: HAS_REV.has(op.table) ? 1 : 0 };
}

function currentRow(db: Db, table: string, id: string): Record<string, unknown> {
  const cur = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!cur) throw new DbOpError('DB_CONSTRAINT', `${table} ${id} not found`);
  return cur;
}

/** UPDATE … SET …, rev = rev + 1 (and cards.updated_at); notes the effects. */
function writeSet(
  db: Db,
  table: string,
  id: string,
  cur: Record<string, unknown>,
  set: Record<string, unknown>,
  fx: TxEffects,
  now: number,
) {
  const s = { ...set };
  if (table === 'cards') {
    if ('state' in s && !isCardState(String(cur.type), String(s.state))) throw new DbOpError('VALIDATION', `card state ${String(s.state)}`);
    s.updated_at = now;
  }
  const cols = Object.keys(s);
  const bump = HAS_REV.has(table) ? ', rev = rev + 1' : '';
  if (cols.length || bump)
    db.prepare(`UPDATE ${table} SET ${[...cols.map((c) => `${c} = ?`), bump.slice(2)].filter(Boolean).join(', ')} WHERE id = ?`).run(
      ...Object.values(s),
      id,
    );
  if (table === 'messages') {
    fx.messageIds.add(id);
    fx.chatIds.add(String(cur.chat_id));
  }
  if (table === 'jobs') noteJob(db, id, fx);
  if (table === 'steps' || table === 'tool_calls') noteJob(db, String(cur.job_id), fx);
  if (table === 'cards') {
    fx.cardIds.add(id);
    fx.chatIds.add(String(cur.chat_id));
  }
  return { id, rev: HAS_REV.has(table) ? Number(cur.rev) + 1 : 0 };
}

function updateRow(db: Db, op: Extract<DbOp, { op: 'update' }>, fx: TxEffects, now: number): { id: string; rev: number } {
  if (op.table === 'reactions') throw new DbOpError('DB_NOT_WRITABLE');
  checkColumns(Object.keys(op.set), UPDATE_COLUMNS[op.table]);
  const set = redactRow(op.table, normalise(op.table, op.set));
  const cur = currentRow(db, op.table, op.id);
  // The engine moves a user message's status and badge only; its words are the user's (Art. 8, main is the writer).
  if (op.table === 'messages' && cur.author_kind === 'user' && ('text' in set || 'provider_note' in set))
    throw new DbOpError('DB_CONSTRAINT');
  if (op.expectRev !== undefined && HAS_REV.has(op.table) && Number(cur.rev) !== op.expectRev) throw new DbOpError('DB_STALE_REV');
  return writeSet(db, op.table, op.id, cur, set, fx, now);
}

function transitionRow(db: Db, op: Extract<DbOp, { op: 'transition' }>, fx: TxEffects, now: number): { id: string; rev: number } {
  const set = redactRow(op.table, normalise(op.table, op.set ?? {}));
  checkColumns(Object.keys(set), UPDATE_COLUMNS[op.table]);
  if ('state' in set) throw new DbOpError('DB_NOT_WRITABLE', 'state is the transition target');
  const cur = currentRow(db, op.table, op.id);
  const from = String(cur.state);
  if (!op.from.includes(from)) throw new DbOpError('DB_BAD_TRANSITION', `${op.table} ${op.id} is ${from}`);
  // 07-2 §4: only the machine's moves; nothing leaves done, done_unverified, failed or cancelled.
  if (op.table === 'jobs' && !canTransition(from, op.to)) throw new DbOpError('DB_BAD_TRANSITION', `${from} → ${op.to}`);
  return writeSet(db, op.table, op.id, cur, { ...set, state: op.to }, fx, now);
}

const ACTIVITY_COLUMNS: Record<keyof ActivityOpRow, string> = {
  kind: 'kind',
  event: 'event',
  actor: 'actor',
  chatId: 'chat_id',
  chatTitle: 'chat_title',
  jobId: 'job_id',
  approvalId: 'approval_id',
  paymentId: 'payment_id',
  routineId: 'routine_id',
  summary: 'summary',
  toLabel: 'to_label',
  fromLabel: 'from_label',
  amountPaise: 'amount_paise',
  approvedHow: 'approved_how',
  ruleText: 'rule_text',
  proofKind: 'proof_kind',
  proofRef: 'proof_ref',
  outcome: 'outcome',
  fields: 'fields',
};

function insertActivity(db: Db, row: ActivityOpRow, now: number, lines: string[]): { id: string; rev: number } {
  const id = newId('act', now);
  const clean: ActivityOpRow = {
    ...row,
    summary: writeRedacted(row.summary),
    fields: row.fields ? writeRedactedJson(row.fields) : null,
  };
  const cols = ['id', 'at', ...Object.keys(clean).map((k) => ACTIVITY_COLUMNS[k as keyof ActivityOpRow])];
  const vals = [id, now, ...Object.entries(clean).map(([k, v]) => (k === 'fields' && v ? JSON.stringify(v) : v))];
  db.prepare(`INSERT INTO activity (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
  lines.push(JSON.stringify({ id, at: now, ...clean }));
  return { id, rev: 0 };
}

const MIRROR_FILE = { job_state: 'state.json', plan_md: 'plan.md' } as const;
interface PendingMirror {
  tmp: string;
  dest: string;
}

/** §4.1.2: the text is written to a temp file inside the tx and renamed over the mirror only after the commit. */
function stageMirror(db: Db, op: Extract<DbOp, { op: 'mirror' }>, dataDir: string | undefined, out: PendingMirror[]) {
  if (!dataDir) throw new DbOpError('DB_NOT_WRITABLE', 'no data folder');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(op.id)) throw new DbOpError('VALIDATION', 'bad job id');
  if (!db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(op.id)) throw new DbOpError('DB_CONSTRAINT', `job ${op.id} not found`);
  if (op.kind === 'job_state') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(op.text);
    } catch {
      throw new DbOpError('VALIDATION', 'state.json is not JSON');
    }
    if (!parsed || typeof parsed !== 'object' || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1)
      throw new DbOpError('VALIDATION', 'state.json schemaVersion');
  }
  const dir = join(dataDir, 'jobs', op.id);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, MIRROR_FILE[op.kind]);
  const tmp = `${dest}.${process.pid}.${out.length}.tmp`;
  writeFileSync(tmp, op.text.endsWith('\n') ? op.text : `${op.text}\n`, 'utf8');
  out.push({ tmp, dest });
  return { id: op.id, rev: 0 };
}

/** One db.tx. */
export function applyDbOps(db: Db, ops: DbOp[], opts: TxOptions = {}): { result: Result<DbTxReply>; effects: TxEffects } {
  const now = opts.now ?? Date.now();
  const effects = emptyEffects();
  const mirrors: PendingMirror[] = [];
  const activityLines: string[] = [];
  try {
    const reply = db.transaction(() => {
      const out: DbTxReply = { ids: [], revs: [] };
      for (const op of ops) {
        const r = (() => {
          switch (op.op) {
            case 'insert':
              return insertRow(db, op, effects, now);
            case 'update':
              return updateRow(db, op, effects, now);
            case 'transition':
              return transitionRow(db, op, effects, now);
            case 'activity':
              return insertActivity(db, op.row, now, activityLines);
            case 'mirror':
              return stageMirror(db, op, opts.dataDir, mirrors);
            case 'delete': {
              const [messageId, by] = op.id.split('|');
              db.prepare('DELETE FROM reactions WHERE message_id = ? AND by = ?').run(messageId, by);
              db.prepare('UPDATE messages SET rev = rev + 1 WHERE id = ?').run(messageId);
              effects.messageIds.add(String(messageId));
              return { id: String(messageId), rev: 0 };
            }
          }
        })();
        out.ids.push(r.id);
        out.revs.push(r.rev);
      }
      // §4.6 rule 7: the pill of every chat whose jobs or cards moved, in this same transaction.
      if (effects.jobIds.size || effects.cardIds.size) for (const chatId of effects.chatIds) recomputePill(db, chatId, now);
      return out;
    })();
    for (const m of mirrors) renameSync(m.tmp, m.dest);
    if (activityLines.length && opts.dataDir) {
      mkdirSync(opts.dataDir, { recursive: true });
      appendFileSync(join(opts.dataDir, 'activity.jsonl'), activityLines.map((l) => `${l}\n`).join(''), 'utf8');
    }
    return { result: ok(reply), effects };
  } catch (e) {
    for (const m of mirrors) rmSync(m.tmp, { force: true });
    const kind = e instanceof DbOpError ? e.kind : 'DB_CONSTRAINT';
    return { result: fail(kind, e instanceof Error ? e.message : undefined), effects: emptyEffects() };
  }
}

/** One db.query. */
export function runNamedQuery(db: Db, q: keyof typeof NAMED_QUERIES, args: unknown[], now = Date.now()): Result<unknown> {
  const fn = NAMED_QUERIES[q] as (ctx: QueryCtx, ...a: unknown[]) => unknown;
  try {
    return ok(fn({ db, now }, ...args));
  } catch (e) {
    return fail('UNKNOWN', e instanceof Error ? e.message : undefined);
  }
}
