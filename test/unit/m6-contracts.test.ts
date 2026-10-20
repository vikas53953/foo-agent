// M6 T1 contracts (CR-0010): 08-1 §2.4 `memory.cmd` (G-M6-01) and `file.write` (memory files and helper notes only),
// §2.4.1 / §2.5 (writable memory tables; memory_fts follows memory_index in the same tx), the memory NamedQuery names with
// the Art. 14 group exclusion (08-4 §24.16), 08-0 §A.1 privacy defaults, and the M6 invoke / event channels.
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { mainToEngineSchema, engineToMainSchema, type DbOp } from '../../src/engine/protocol';
import { applyDbOps, isWritableDataFile, writeDataFile } from '../../src/main/engine-supervisor/engineHost';
import { NAMED_QUERIES } from '../../src/main/db/queries';
import { migrate, type Db } from '../../src/main/store/db';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../src/shared/ipc';

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;

let db: Db;
let dataDir: string;
const tx = (ops: DbOp[], now = NOW) => applyDbOps(db, ops, { now, dataDir });
const fact = (id: string, text: string, extra: Record<string, unknown> = {}): DbOp => ({
  op: 'insert',
  table: 'memory_index',
  row: {
    id,
    file: 'memory/about-you.md',
    line_no: 1,
    scope: 'global',
    text,
    provenance: 'said',
    origin: 'manual',
    origin_kind: 'manual',
    kind: 'fact',
    learned_at: NOW,
    hash: `h_${id}`,
    ...extra,
  },
});
const ftsHits = (q: string) =>
  (
    db.prepare('SELECT m.id FROM memory_fts f JOIN memory_index m ON m.rowid = f.rowid WHERE memory_fts MATCH ?').all(q) as { id: string }[]
  ).map((r) => r.id);

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', ?, ?)").run(NOW, NOW);
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_g', 'group', 'Family', ?, ?)").run(NOW, NOW);
  dataDir = mkdtempSync(join(tmpdir(), 'foo-m6-'));
});

describe('memory.cmd (CR-0010 G-M6-01)', () => {
  it('accepts every memory:* request shape and refuses a wrong confirm word', () => {
    const ok = [
      { cmd: 'add', text: 'Allergic to peanuts' },
      { cmd: 'edit', factId: 'f_1', text: 'Allergic to cashews' },
      { cmd: 'setPrivate', factId: 'f_1', private: true },
      { cmd: 'setKind', factId: 'f_1', kind: 'person' },
      { cmd: 'forget', factId: 'f_1' },
      { cmd: 'undo', undoToken: 'undo_1' },
      { cmd: 'forgetBySource', source: 'gmail', confirm: true },
      { cmd: 'forgetAll', typed: 'FORGET' },
    ];
    for (const payload of ok) expect(mainToEngineSchema.safeParse({ id: 'x', kind: 'memory.cmd', payload }).success).toBe(true);
    expect(mainToEngineSchema.safeParse({ id: 'x', kind: 'memory.cmd', payload: { cmd: 'forgetAll', typed: 'forget' } }).success).toBe(
      false,
    );
    expect(mainToEngineSchema.safeParse({ id: 'x', kind: 'memory.cmd', payload: { cmd: 'add', text: 'x'.repeat(121) } }).success).toBe(
      false,
    );
  });
});

describe('file.write (08-1 §2.4, 08-3 §12.2)', () => {
  it('is an engine request with atomic: true', () => {
    const msg = { id: 'e1', kind: 'file.write', payload: { relPath: 'memory/about-you.md', text: '- x\n', atomic: true } };
    expect(engineToMainSchema.safeParse(msg).success).toBe(true);
  });
  it('allows only memory files and helper notes', () => {
    for (const p of [
      'memory/about-you.md',
      'memory/identity.md',
      'memory/people/माँ.md',
      'memory/preferences/travel.md',
      'memory/.tombstones',
      'memory/.tidy-log.md',
      'helpers/h_01/notes.md',
    ])
      expect(isWritableDataFile(p), p).toBe(true);
    for (const p of [
      'settings.json',
      'memory/../settings.json',
      'memory/people/../../x.md',
      'helpers/h_01/other.md',
      'memory/a/b/c.md',
      'memory\\about-you.md',
      'jobs/j_1/state.json',
    ])
      expect(isWritableDataFile(p), p).toBe(false);
  });
  it('writes the text under {DATA} and leaves no temp file', () => {
    expect(writeDataFile(dataDir, 'memory/people/rohit.md', '- Lives in Pune\n')).toEqual({ ok: true, value: {} });
    expect(readFileSync(join(dataDir, 'memory', 'people', 'rohit.md'), 'utf8')).toBe('- Lives in Pune\n');
    expect(writeDataFile(dataDir, 'settings.json', '{}')).toMatchObject({ ok: false, error: { kind: 'PATH_NOT_ALLOWED' } });
    expect(existsSync(join(dataDir, 'settings.json'))).toBe(false);
  });
});

describe('db.tx on the memory tables (08-1 §2.4.1, §2.5)', () => {
  it('inserts, updates and deletes facts; memory_fts follows in the same tx', () => {
    expect(tx([fact('f_1', 'Allergic to peanuts')]).result.ok).toBe(true);
    expect(ftsHits('peanuts')).toEqual(['f_1']);
    expect(tx([{ op: 'update', table: 'memory_index', id: 'f_1', set: { text: 'Allergic to cashews', hash: 'h2' } }]).result.ok).toBe(true);
    expect(ftsHits('peanuts')).toEqual([]);
    expect(ftsHits('cashews')).toEqual(['f_1']);
    const r = tx([{ op: 'delete', table: 'memory_index', id: 'f_1' }]);
    expect(r.result.ok).toBe(true);
    expect(r.effects.factIds).toEqual(new Set(['f_1']));
    expect(ftsHits('cashews')).toEqual([]);
  });
  it('rolls the fact back when a later op in the tx fails', () => {
    const r = tx([fact('f_1', 'Allergic to peanuts'), { op: 'update', table: 'memory_index', id: 'f_1', set: { nope: 1 } }]);
    expect(r.result).toMatchObject({ ok: false, error: { kind: 'DB_NOT_WRITABLE' } });
    expect(NAMED_QUERIES['memory.byId']({ db, now: NOW }, 'f_1')).toBeNull();
  });
  it('keeps one tombstone per hash and origin kind; live for 90 days (J17)', () => {
    const stone = (forgotten: number): DbOp => ({
      op: 'insert',
      table: 'memory_tombstones',
      row: { hash: 'h1', origin_kind: 'gmail', forgotten_at: forgotten, expires_at: forgotten + 90 * DAY },
    });
    expect(tx([stone(NOW), stone(NOW + 1)]).result.ok).toBe(true);
    expect(NAMED_QUERIES['memory.tombstones']({ db, now: NOW + 2 })).toHaveLength(1);
    expect(NAMED_QUERIES['memoryTombstoned']({ db, now: NOW + 89 * DAY }, 'h1', 'gmail')).toBe(true);
    expect(NAMED_QUERIES['memoryTombstoned']({ db, now: NOW + 91 * DAY }, 'h1', 'gmail')).toBe(false);
    expect(NAMED_QUERIES['memoryTombstoned']({ db, now: NOW }, 'h1', 'chat')).toBe(false);
    expect(tx([{ op: 'delete', table: 'memory_tombstones', id: 'h1|gmail' }]).result.ok).toBe(true);
    expect(NAMED_QUERIES['memoryTombstoned']({ db, now: NOW }, 'h1', 'gmail')).toBe(false);
  });
  it('records uses and refuses columns outside the table', () => {
    tx([fact('f_1', 'Prefers window seats')]);
    expect(tx([{ op: 'insert', table: 'memory_uses', row: { fact_id: 'f_1', chat_id: 'c_1', at: NOW } }]).result.ok).toBe(true);
    expect(tx([{ op: 'insert', table: 'memory_uses', row: { fact_id: 'f_1', chat_id: 'c_1', at: NOW, text: 'x' } }]).result).toMatchObject({
      ok: false,
      error: { kind: 'DB_NOT_WRITABLE' },
    });
  });
});

describe('memory named queries: Art. 14 group exclusion (08-4 §24.16)', () => {
  beforeEach(() => {
    tx([
      fact('f_about', 'Lives in Pune'),
      fact('f_pref', 'Prefers window seats', { file: 'memory/preferences/travel.md', kind: 'preference', category: 'travel' }),
      fact('f_priv', 'Vegetarian on Tuesdays', { file: 'memory/preferences/food.md', private: 1 }),
      fact('f_chat', 'Planning a surprise party', { scope: 'chat', chat_id: 'c_g' }),
    ]);
  });
  it('a 1:1 chat gets every global fact', () => {
    const ids = NAMED_QUERIES['memoryByScope']({ db, now: NOW }, 'c_1').map((f) => f.id);
    expect(ids.sort()).toEqual(['f_about', 'f_pref', 'f_priv']);
  });
  it('a group gets no private, no about-you and no ungranted chat-scope fact', () => {
    expect(NAMED_QUERIES['memoryByScope']({ db, now: NOW }, 'c_g').map((f) => f.id)).toEqual(['f_pref']);
    expect(NAMED_QUERIES['memorySearch']({ db, now: NOW }, 'c_g', '"Pune" OR "seats"', 8).map((f) => f.id)).toEqual(['f_pref']);
    tx([{ op: 'insert', table: 'memory_group_grants', row: { fact_id: 'f_chat', chat_id: 'c_g', until: NOW + DAY } }]);
    expect(
      NAMED_QUERIES['memoryByScope']({ db, now: NOW }, 'c_g')
        .map((f) => f.id)
        .sort(),
    ).toEqual(['f_chat', 'f_pref']);
    expect(NAMED_QUERIES['memoryByScope']({ db, now: NOW + 2 * DAY }, 'c_g').map((f) => f.id)).toEqual(['f_pref']);
  });
  it('counts the facts learned in the last 7 days', () => {
    expect(NAMED_QUERIES['memory.weekCount']({ db, now: NOW + DAY })).toBe(4);
    expect(NAMED_QUERIES['memory.weekCount']({ db, now: NOW + 8 * DAY })).toBe(0);
  });
});

describe('M6 settings and channels', () => {
  it('privacy defaults are true / true / false and the unprompted budget is 3 (08-0 §A.1)', () => {
    expect(settingsDefaults.privacy).toMatchObject({ rememberOn: true, learnFromChats: true, askBeforeRemembering: false });
    expect(settingsDefaults.notifications.unpromptedPerDay).toBe(3);
  });
  it('registers the memory invokes and events', () => {
    for (const c of [
      'memory:add',
      'memory:edit',
      'memory:setPrivate',
      'memory:setKind',
      'memory:forget',
      'memory:undo',
      'memory:forgetBySource',
      'memory:forgetAll',
      'memory:openFolder',
      'data:export',
      'files:pickFolder',
    ])
      expect(INVOKE_CHANNELS).toContain(c);
    expect(EVENT_CHANNELS).toContain('memory:changed');
    expect(EVENT_CHANNELS).toContain('data:exportProgress');
  });
});
