// Spec: 08-1 §4.4.2 step 3 (settings:set change record: cap_changed, fields { path, old, new }, actor and approved_how 'user'),
// 06-3 §9.4 ("Changed your AI cap to ₹{1,500}"), 06-3 §14 C-21 (raising the AI cap adds one Activity row), 05-3 §5.21.
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { changeRecordRow } from '../../src/main/settings/changeRecord';
import { migrate } from '../../src/main/store/db';

describe('C-21 · raising the AI cap writes one cap_changed activity row', () => {
  it('a saved AI cap change is one changed/cap_changed row with the old and new cap and the 06-3 summary', () => {
    const db = new Database(':memory:');
    migrate(db);
    const dataDir = mkdtempSync(join(tmpdir(), 'foo-cap-'));
    const row = changeRecordRow('money.aiCapPaise', 100_000, 150_000);
    expect(row).not.toBeNull();
    const r = applyDbOps(db, [{ op: 'activity', row: row! }], { now: 1_000, dataDir });
    expect(r.result.ok).toBe(true);
    const rows = db.prepare('SELECT * FROM activity').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'changed', event: 'cap_changed', actor: 'user', approved_how: 'user', outcome: 'done' });
    expect(rows[0]!.summary).toBe('Changed your AI cap to ₹1,500');
    expect(JSON.parse(String(rows[0]!.fields))).toEqual({ path: 'money.aiCapPaise', old: 100_000, new: 150_000 });
    expect(readFileSync(join(dataDir, 'activity.jsonl'), 'utf8')).toContain('cap_changed');
  });

  it('an unchanged cap or another path writes no row in M4', () => {
    expect(changeRecordRow('money.aiCapPaise', 100_000, 100_000)).toBeNull();
    expect(changeRecordRow('chat.enterSends', true, false)).toBeNull();
  });
});
