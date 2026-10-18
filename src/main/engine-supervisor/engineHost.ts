// Spec: 08-1 §2.4.1 (db.tx = one SQLite transaction; any failing op rolls back all; reply `{ ids, revs }`; DB_* failure kinds;
// derived chat columns are written only by main inside the transaction of the triggering op, §4.6 rule 7, X-129; a DbOp
// naming one of them → DB_NOT_WRITABLE), §4.6 rule 2 (stored text goes through the Redactor), §2.4 (ui.patch is forwarded to
// the renderer as-is). Main is the single writer (08-1 §1.1).
import { fail, ok, type Result } from '../../shared/errors';
import { redactSecrets } from '../../shared/redactor';
import type { DbOp, DbTxReply } from '../../engine/protocol';
import type { Db } from '../store/db';
import { nextSeq } from '../store/composerQueries';
import { NAMED_QUERIES } from '../db/queries';

/** Columns the engine may set, per table (anything else → DB_NOT_WRITABLE). */
const INSERT_COLUMNS: Record<string, readonly string[]> = {
  messages: ['id', 'chat_id', 'author_kind', 'author_id', 'kind', 'text', 'text_for_ai', 'status', 'badge', 'provider_note', 'created_at', 'lang'],
  ai_turns: [
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
  ],
  reactions: ['message_id', 'by', 'emoji', 'created_at'],
};
const MESSAGE_UPDATE_COLUMNS = ['text', 'status', 'badge', 'provider_note'];

export interface TxEffects {
  messageIds: Set<string>;
  chatIds: Set<string>;
}

class DbOpError extends Error {
  constructor(readonly kind: 'DB_NOT_WRITABLE' | 'DB_STALE_REV' | 'DB_CONSTRAINT') {
    super(kind);
  }
}

function checkColumns(cols: string[], allowed: readonly string[]): void {
  for (const c of cols) if (!allowed.includes(c)) throw new DbOpError('DB_NOT_WRITABLE');
}

function insertRow(db: Db, op: Extract<DbOp, { op: 'insert' }>, fx: TxEffects): { id: string; rev: number } {
  const row = { ...op.row };
  checkColumns(Object.keys(row), INSERT_COLUMNS[op.table]!);
  for (const col of op.redact ?? []) if (typeof row[col] === 'string') row[col] = redactSecrets(row[col] as string).text;
  if (op.table === 'messages') {
    // Art. 8 / §4.6 rule 2: message text is always stored redacted.
    if (typeof row.text === 'string') row.text = redactSecrets(row.text).text;
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
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${op.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row));
  if (op.table === 'reactions') {
    const messageId = String(row.message_id);
    db.prepare('UPDATE messages SET rev = rev + 1 WHERE id = ?').run(messageId);
    fx.messageIds.add(messageId);
    return { id: messageId, rev: 1 };
  }
  return { id: String(row.id), rev: 1 };
}

function updateMessage(db: Db, op: Extract<DbOp, { op: 'update' }>, fx: TxEffects): { id: string; rev: number } {
  const set = { ...op.set };
  checkColumns(Object.keys(set), MESSAGE_UPDATE_COLUMNS);
  if (typeof set.text === 'string') set.text = redactSecrets(set.text).text;
  const cur = db.prepare('SELECT rev, chat_id FROM messages WHERE id = ?').get(op.id) as { rev: number; chat_id: string } | undefined;
  if (!cur) throw new DbOpError('DB_CONSTRAINT');
  if (op.expectRev !== undefined && cur.rev !== op.expectRev) throw new DbOpError('DB_STALE_REV');
  const cols = Object.keys(set);
  db.prepare(`UPDATE messages SET ${cols.map((c) => `${c} = ?`).join(', ')}, rev = rev + 1 WHERE id = ?`).run(...Object.values(set), op.id);
  fx.messageIds.add(op.id);
  fx.chatIds.add(cur.chat_id);
  return { id: op.id, rev: cur.rev + 1 };
}

/** One db.tx. */
export function applyDbOps(db: Db, ops: DbOp[]): { result: Result<DbTxReply>; effects: TxEffects } {
  const effects: TxEffects = { messageIds: new Set(), chatIds: new Set() };
  try {
    const reply = db.transaction(() => {
      const out: DbTxReply = { ids: [], revs: [] };
      for (const op of ops) {
        const r =
          op.op === 'insert'
            ? insertRow(db, op, effects)
            : op.op === 'update'
              ? updateMessage(db, op, effects)
              : (() => {
                  const [messageId, by] = op.id.split('|');
                  db.prepare('DELETE FROM reactions WHERE message_id = ? AND by = ?').run(messageId, by);
                  db.prepare('UPDATE messages SET rev = rev + 1 WHERE id = ?').run(messageId);
                  effects.messageIds.add(String(messageId));
                  return { id: String(messageId), rev: 0 };
                })();
        out.ids.push(r.id);
        out.revs.push(r.rev);
      }
      return out;
    })();
    return { result: ok(reply), effects };
  } catch (e) {
    const kind = e instanceof DbOpError ? e.kind : 'DB_CONSTRAINT';
    return { result: fail(kind, e instanceof Error ? e.message : undefined), effects: { messageIds: new Set(), chatIds: new Set() } };
  }
}

/** One db.query. */
export function runNamedQuery(db: Db, q: keyof typeof NAMED_QUERIES, args: unknown[]): Result<unknown> {
  const fn = NAMED_QUERIES[q] as (db: Db, ...a: unknown[]) => unknown;
  try {
    return ok(fn(db, ...args));
  } catch (e) {
    return fail('UNKNOWN', e instanceof Error ? e.message : undefined);
  }
}
