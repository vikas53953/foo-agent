// Spec: 08-1 §4.1.1 (damaged database, DB-12: an open failure, a corruption error while migrating or a `quick_check` other
// than `ok` → close, rename foo.db (+ -wal / -shm) to `foo-damaged-{yyyy-mm-dd-HHmm}.db`, create a fresh db, rebuild from the
// mirrors in one transaction with foreign keys off for it only, placeholder tombstones for every chat / message / card id a
// rebuilt row references, `foreign_key_check` empty before commit; one `DB_REBUILT` error card in the new foo chat; an
// approval rebuilt as RUNNING with `submitted_at` → CHECKING; a failed rebuild keeps the damaged file), §4.1.2 (mirror
// shapes, `state.json` schemaVersion 1), 08-3 §21.2 `DB_REBUILT` (copy and its one button), AT-118a.
// Mirrors that exist by M4: `jobs\*\state.json` (jobs, steps, approvals, payments) and `activity.jsonl`. Helpers, routines and
// memory have no mirror writer yet (M6, M7, M13): their folders are read when they exist and skipped otherwise.
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { t } from '../../shared/copy/t';
import { newId } from '../../shared/ids';
import { applyDbOps } from '../engine-supervisor/engineHost';
import { openDb, type Db } from './db';
import { ensureFooChat } from './queries';

export interface RebuildOptions {
  /** `{DATA}`: holds `jobs\` and `activity.jsonl`. */
  dataDir: string;
  now: number;
  agentName: string;
  log?(evt: 'DB_REBUILT' | 'DB_REBUILD_FAILED', detail: string): void;
  migrationsDir?: string;
}

export interface OpenResult {
  db: Db;
  /** The renamed damaged file when the database was rebuilt. */
  damagedFile: string | null;
}

/** The errors that mean "this file is damaged" (anything else, e.g. a full disk, is not ours to rebuild from). */
/** 08-3 §19.1: a log line carries a code, never an error's message text (it can quote a path or a row). */
export function errCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,40}$/u.test(code) ? code : 'UNKNOWN';
}

export function isDamage(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const msg = e instanceof Error ? e.message : String(e);
  return code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB' || /quick_check failed|malformed|not a database/i.test(msg);
}

function stamp(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** §2.2 step 3: open, migrate and check; a damaged file is set aside and rebuilt from the mirrors (§4.1.1). */
export function openDbOrRebuild(file: string, o: RebuildOptions): OpenResult {
  try {
    return { db: openDb(file, o.migrationsDir), damagedFile: null };
  } catch (e) {
    if (!isDamage(e)) throw e;
    o.log?.('DB_REBUILT', errCode(e));
  }
  const damaged = join(dirname(file), `foo-damaged-${stamp(o.now)}.db`);
  renameSync(file, damaged);
  for (const ext of ['-wal', '-shm']) if (existsSync(file + ext)) renameSync(file + ext, damaged + ext);
  let db: Db | null = null;
  try {
    db = openDb(file, o.migrationsDir);
    rebuildFromMirrors(db, o);
    return { db, damagedFile: damaged };
  } catch (e) {
    // §4.1.1: if the rebuild itself fails the damaged file is never deleted; startup reports it.
    o.log?.('DB_REBUILD_FAILED', errCode(e));
    db?.close();
    throw e;
  }
}

const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** A camelCase mirror row → the table's columns (unknown keys and derived fields are dropped; objects stored as JSON). */
function insertMirrorRow(db: Db, table: string, row: Record<string, unknown>): boolean {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  const names: string[] = [];
  const values: unknown[] = [];
  for (const col of cols) {
    const v = row[snakeToCamel(col)] ?? row[col];
    if (v === undefined) continue;
    names.push(col);
    values.push(typeof v === 'boolean' ? (v ? 1 : 0) : v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  }
  try {
    db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...values);
    return true;
  } catch {
    // A mirror row the schema refuses (hand-edited or from a newer build) is left out; the rest still rebuilds.
    return false;
  }
}

function readJson(fileOrText: string, isText = false): unknown {
  try {
    return JSON.parse(isText ? fileOrText : readFileSync(fileOrText, 'utf8'));
  } catch {
    return null;
  }
}

interface StateJson {
  schemaVersion: 1;
  job: Record<string, unknown>;
  steps: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

function stateFiles(dataDir: string): StateJson[] {
  const dir = join(dataDir, 'jobs');
  if (!existsSync(dir)) return [];
  const out: StateJson[] = [];
  for (const id of readdirSync(dir)) {
    const s = readJson(join(dir, id, 'state.json')) as Partial<StateJson> | null;
    if (s?.schemaVersion === 1 && s.job && typeof s.job.id === 'string')
      out.push({ schemaVersion: 1, job: s.job, steps: s.steps ?? [], approvals: s.approvals ?? [], payments: s.payments ?? [] });
  }
  return out;
}

/** Placeholder tombstones (§4.1.1 step 2) until `foreign_key_check` is empty; references to other tables are cleared. */
function healReferences(db: Db, now: number): void {
  for (let round = 0; round < 6; round++) {
    const bad = db.pragma('foreign_key_check') as { table: string; rowid: number; parent: string; fkid: number }[];
    if (!bad.length) return;
    for (const v of bad) {
      const fk = (db.prepare(`PRAGMA foreign_key_list(${v.table})`).all() as { id: number; from: string; to: string }[]).find(
        (f) => f.id === v.fkid,
      );
      if (!fk) continue;
      const row = db.prepare(`SELECT * FROM ${v.table} WHERE rowid = ?`).get(v.rowid) as Record<string, unknown> | undefined;
      const ref = row?.[fk.from];
      if (!row || typeof ref !== 'string') continue;
      const chatId = typeof row.chat_id === 'string' ? row.chat_id : null;
      if (v.parent === 'chats') {
        db.prepare(
          "INSERT OR IGNORE INTO chats (id, kind, title, last_activity_at, created_at, deleted_at) VALUES (?, 'foo', '', ?, ?, ?)",
        ).run(ref, now, now, now);
      } else if (v.parent === 'messages' && chatId) {
        tombstoneMessage(db, ref, chatId, null, now);
      } else if (v.parent === 'cards' && chatId) {
        const messageId = newId('m', now);
        db.prepare(
          "INSERT OR IGNORE INTO cards (id, chat_id, message_id, type, state, payload, nonce, created_at, updated_at, deleted_at) VALUES (?, ?, ?, 'error', 'dismissed', '{}', ?, ?, ?, ?)",
        ).run(ref, chatId, messageId, newId('k', now), now, now, now);
        tombstoneMessage(db, messageId, chatId, ref, now);
      } else {
        db.prepare(`UPDATE ${v.table} SET ${fk.from} = NULL WHERE rowid = ?`).run(v.rowid);
      }
    }
  }
  if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('foreign_key_check failed after rebuild');
}

function tombstoneMessage(db: Db, id: string, chatId: string, cardId: string | null, now: number): void {
  const seq = (db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE chat_id = ?').pluck().get(chatId) as number) ?? 1;
  if (cardId)
    db.prepare(
      "INSERT OR IGNORE INTO messages (id, chat_id, seq, author_kind, kind, card_id, text, status, created_at, deleted_at) VALUES (?, ?, ?, 'system', 'card', ?, '', 'complete', ?, ?)",
    ).run(id, chatId, seq, cardId, now, now);
  else
    db.prepare(
      "INSERT OR IGNORE INTO messages (id, chat_id, seq, author_kind, kind, marker_kind, text, status, created_at, deleted_at) VALUES (?, ?, ?, 'system', 'marker', 'system_line', '', 'complete', ?, ?)",
    ).run(id, chatId, seq, now, now);
}

/** §4.1.1 steps 2–5 on a fresh, migrated database. */
export function rebuildFromMirrors(db: Db, o: RebuildOptions): void {
  const states = stateFiles(o.dataDir);
  const activity = join(o.dataDir, 'activity.jsonl');
  const lines = existsSync(activity)
    ? readFileSync(activity, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => readJson(l, true))
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : [];
  let skipped = 0;
  const put = (table: string, row: Record<string, unknown>) => {
    if (!insertMirrorRow(db, table, row)) skipped += 1;
  };
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const s of states) {
        put('jobs', s.job);
        for (const step of s.steps) put('steps', step);
        for (const a of s.approvals) put('approvals', a);
        for (const p of s.payments) put('payments', p);
      }
      for (const row of lines) put('activity', row);
      // Step 5: never re-submitted (Art. 7).
      db.prepare("UPDATE approvals SET state = 'CHECKING' WHERE state = 'RUNNING' AND submitted_at IS NOT NULL").run();
      healReferences(db, o.now);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  // Step 2: one new live foo chat; step 4: the DB_REBUILT card in it.
  const chatId = ensureFooChat(db, o.now, o.agentName, newId('c', o.now));
  const cardId = newId('k', o.now);
  const messageId = newId('m', o.now);
  const payload = {
    variant: 'error',
    kind: 'DB_REBUILT',
    whatHappened: t('errors.db_rebuilt.what_happened'),
    whatIsSafe: t('errors.db_rebuilt.what_is_safe'),
    button: { label: t('errors.db_rebuilt.button'), action: { kind: 'dismiss' } },
  };
  const r = applyDbOps(
    db,
    [
      {
        op: 'insert',
        table: 'messages',
        row: { id: messageId, chat_id: chatId, author_kind: 'foo', kind: 'card', card_id: cardId, status: 'complete', created_at: o.now },
      },
      {
        op: 'insert',
        table: 'cards',
        row: {
          id: cardId,
          chat_id: chatId,
          message_id: messageId,
          type: 'error',
          state: 'asking',
          payload,
          nonce: newId('k', o.now),
          created_at: o.now,
        },
      },
    ],
    { now: o.now },
  );
  if (!r.result.ok) throw new Error(`DB_REBUILT card: ${r.result.error.kind}`);
  o.log?.('DB_REBUILT', `${states.length} jobs, ${lines.length} activity rows, ${skipped} rows refused`);
}
