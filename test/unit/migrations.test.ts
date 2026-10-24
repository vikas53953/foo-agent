// 08-1 §4.2 item 4: forward-only migration test. (a) every migration on an empty DB → integrity ok, no FK problems,
// and sqlite_master equals the §4.3 DDL of the vendored spec exactly, with 0002 (CR-0008 G-M4-03) widening only the two route
// CHECKs to the five Route values, 0003, 0004 and 0005 (CR-0057 user_key) applied to the reference as written. (b) re-opening applies nothing twice. (c) 0002 keeps the rows and foreign keys of a filled
// database.
import Database from 'better-sqlite3';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listMigrations, migrate, openDb } from '../../src/main/store/db';

const DIR = 'src/main/store/migrations';

function specDdl(): string {
  const md = readFileSync('spec/constitution/08-functions-and-engine-1.md', 'utf8');
  const from = md.indexOf('### 4.3 Tables');
  const start = md.indexOf('```sql', from) + '```sql'.length;
  return md.slice(start, md.indexOf('```', start));
}

const schema = (db: Database.Database) =>
  db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY type, name",
    )
    .all();

describe('migrations', () => {
  it('are numbered from 0001 with no gaps', () => expect(listMigrations(DIR)[0]).toEqual({ version: 1, file: '0001_init.sql' }));

  it('build exactly the spec schema, with only the route CHECKs widened by 0002, the 0003 suggestions column and the 0004 rich-replies changes', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    expect(migrate(db, DIR)).toEqual([1, 2, 3, 4, 5]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const ref = new Database(':memory:');
    ref.exec(specDdl());
    // 0003 (CR-0021 pick 10) adds one nullable column to messages; the reference gets the same ALTER.
    ref.exec(readFileSync(join(DIR, '0003_message_suggestions.sql'), 'utf8'));
    // 0004 (CR-0022, X-180) rebuilds cards with the 27 card types, adds messages.side and kept_items; the reference too.
    ref.exec(readFileSync(join(DIR, '0004_rich_replies.sql'), 'utf8'));
    // 0005 (CR-0057, X-214) rebuilds secrets_index with kind 'user_key'; the reference too.
    ref.exec(readFileSync(join(DIR, '0005_user_key.sql'), 'utf8'));
    type Obj = { type: string; name: string; tbl_name: string; sql: string | null };
    const mine = schema(db) as Obj[];
    const spec = schema(ref) as Obj[];
    const OLD = "CHECK (route IN ('api','browser','screen') OR route IS NULL)";
    const NEW = "CHECK (route IN ('api','browser','screen','email','handback') OR route IS NULL)";
    const widened = spec.map((o) =>
      o.type === 'table' && (o.name === 'jobs' || o.name === 'steps')
        ? { ...o, sql: o.sql!.replace(OLD, NEW).replace(`CREATE TABLE ${o.name} (`, `CREATE TABLE "${o.name}" (`) }
        : o,
    );
    expect(mine).toEqual(widened);
  });

  it('0005 keeps every vault index row and accepts a user_key (CR-0057)', () => {
    const db = new Database(':memory:');
    const four = mkdtempSync(join(tmpdir(), 'foo-mig-'));
    for (const f of ['0001_init.sql', '0002_routes.sql', '0003_message_suggestions.sql', '0004_rich_replies.sql'])
      copyFileSync(join(DIR, f), join(four, f));
    migrate(db, four);
    const row = (target: string, kind: string, name: string) =>
      db
        .prepare(
          "INSERT INTO secrets_index (target, kind, name, label, storage, created_at, updated_at) VALUES (?, ?, ?, 'L', 'credman', 1, 1)",
        )
        .run(target, kind, name);
    row('foo/ai_key/openai-key', 'ai_key', 'openai-key');
    expect(() => row('foo/user_key/github-key', 'user_key', 'github-key')).toThrow(/CHECK/);
    expect(migrate(db, DIR)).toEqual([5]);
    row('foo/user_key/github-key', 'user_key', 'github-key');
    expect(db.prepare('SELECT target, kind FROM secrets_index ORDER BY target').all()).toEqual([
      { target: 'foo/ai_key/openai-key', kind: 'ai_key' },
      { target: 'foo/user_key/github-key', kind: 'user_key' },
    ]);
    expect(() => row('foo/x/y', 'other', 'y')).toThrow(/CHECK/);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('0002 keeps every job, step and foreign key, and accepts the email and handback routes (G-M4-03)', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const one = mkdtempSync(join(tmpdir(), 'foo-mig-'));
    copyFileSync(join(DIR, '0001_init.sql'), join(one, '0001_init.sql'));
    migrate(db, one);
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', 1, 1)").run();
    db.prepare(
      "INSERT INTO jobs (id, chat_id, origin_chat_id, owner_kind, title, origin, intent, state, route, created_at) VALUES ('j_1', 'c_1', 'c_1', 'foo', 'T', 'user', 'read_only', 'working', 'api', 1)",
    ).run();
    db.prepare(
      "INSERT INTO steps (id, job_id, idx, phrase_key, state, route) VALUES ('s_1', 'j_1', 0, 'look_web', 'running', 'browser')",
    ).run();
    expect(() => db.prepare("UPDATE steps SET route = 'email' WHERE id = 's_1'").run()).toThrow(/CHECK/);
    expect(migrate(db, DIR)).toEqual([2, 3, 4, 5]);
    expect(db.prepare('SELECT id, route FROM jobs').all()).toEqual([{ id: 'j_1', route: 'api' }]);
    db.prepare("UPDATE jobs SET route = 'handback' WHERE id = 'j_1'").run();
    db.prepare("UPDATE steps SET route = 'email' WHERE id = 's_1'").run();
    expect(() => db.prepare("UPDATE steps SET route = 'phone' WHERE id = 's_1'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("DELETE FROM jobs WHERE id = 'j_1'").run()).toThrow(/FOREIGN KEY/);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jobs' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .pluck()
        .all(),
    ).toEqual(['jobs_chat_state', 'jobs_state']);
  });

  it('are applied once (forward-only, idempotent re-open)', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'foo-db-')), 'data', 'foo.db');
    openDb(file, DIR).close();
    const db = openDb(file, DIR);
    expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toEqual([1, 2, 3, 4, 5]);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
  });
});
