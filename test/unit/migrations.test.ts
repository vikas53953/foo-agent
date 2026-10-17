// 08-1 §4.2 item 4: forward-only migration test. (a) every migration on an empty DB → integrity ok, no FK problems,
// and sqlite_master equals the §4.3 DDL of the vendored spec exactly. (b) re-opening applies nothing twice.
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
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

  it('build exactly the spec schema', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    expect(migrate(db, DIR)).toEqual([1]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const ref = new Database(':memory:');
    ref.exec(specDdl());
    expect(schema(db)).toEqual(schema(ref));
  });

  it('are applied once (forward-only, idempotent re-open)', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'foo-db-')), 'data', 'foo.db');
    openDb(file, DIR).close();
    const db = openDb(file, DIR);
    expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toEqual([1]);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
  });
});
