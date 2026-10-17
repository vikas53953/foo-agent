// Spec: 08-1 §2.2 step 3 (open + pragmas + quick_check), §4.2 (forward-only migrations, backups).
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Db = Database.Database;

export const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function listMigrations(dir = MIGRATIONS_DIR): { version: number; file: string }[] {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  return files.map((file, i) => {
    const version = Number(file.slice(0, 4));
    if (version !== i + 1) throw new Error(`Migration gap or duplicate at ${file}`);
    return { version, file };
  });
}

/** Applies every pending migration, each in one transaction. Returns the versions applied. */
export function migrate(db: Db, dir = MIGRATIONS_DIR): number[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all() as number[]);
  const applied: number[] = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.version)) continue;
    const sql = readFileSync(join(dir, m.file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now());
    })();
    applied.push(m.version);
  }
  return applied;
}

function pendingCount(db: Db, dir: string): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const max = (db.prepare('SELECT COALESCE(MAX(version), 0) FROM schema_migrations').pluck().get() as number) ?? 0;
  return listMigrations(dir).filter((m) => m.version > max).length;
}

/** §4.2 item 1: checkpoint and copy foo.db before migrating an existing database; keep the last 3 backups. */
function backup(db: Db, file: string): void {
  const from = (db.prepare('SELECT COALESCE(MAX(version), 0) FROM schema_migrations').pluck().get() as number) ?? 0;
  if (from === 0) return;
  db.pragma('wal_checkpoint(TRUNCATE)');
  const dir = join(dirname(file), 'backup');
  mkdirSync(dir, { recursive: true });
  copyFileSync(file, join(dir, `foo-${from}-${new Date().toISOString().slice(0, 10)}.db`));
  const old = readdirSync(dir)
    .filter((f) => f.startsWith('foo-'))
    .sort()
    .slice(0, -3);
  for (const f of old) rmSync(join(dir, f));
}

export function openDb(file: string, dir = MIGRATIONS_DIR): Db {
  mkdirSync(dirname(file), { recursive: true });
  const existed = existsSync(file);
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 2000');
  if (existed && pendingCount(db, dir) > 0) backup(db, file);
  migrate(db, dir);
  const check = db.pragma('quick_check', { simple: true });
  if (check !== 'ok') throw new Error(`DB quick_check failed: ${String(check)}`);
  return db;
}
