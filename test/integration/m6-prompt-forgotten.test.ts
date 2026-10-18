// M6 T4: AT-074 (prompt part). 10-acceptance-1 §B AT-074 (a forgotten fact is never used in a later reply), 08-4 §24.16
// (parts 5/5b read memory_index; a forgotten fact has no row), 08-3 §12.6 (forget deletes the line and its index row). The
// real Engine and main's EngineBridge over a temp SQLite db; the AI turns are the fake script (08-3 §22.3).
import { afterEach, describe, expect, it } from 'vitest';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;

describe('AT-074 · a forgotten fact never reaches a later prompt', () => {
  it('AT-074 · after forget, neither part 5 nor part 5b carries the fact', async () => {
    h = makeHarness({ script: [intake(reply('Her name is Simran.')), intake(reply('I do not know that.'))], settings: verified() });
    const x = h;
    const insert = x.db.prepare(
      `INSERT INTO memory_index (id, file, line_no, scope, text, provenance, origin, origin_kind, kind, learned_at, use_count, hash)
       VALUES (?, 'memory/about-you.md', ?, 'global', ?, 'said', 'manual', 'manual', 'fact', ?, ?, ?)`,
    );
    insert.run('f_wife', 1, 'Wife is Simran', x.clock.now(), 0, 'h_wife');
    // Enough busier facts that the wife fact is a turn fact (5b), not pinned, on the first ask.
    for (let i = 0; i < 30; i++) insert.run(`f_fill${i}`, i + 2, `Filler ${i} ${'y'.repeat(120)}`, x.clock.now(), 50, `h_fill${i}`);

    x.userSays("What's my wife's name?");
    await x.idle();
    const first = x.turnsJsonl().filter((t) => t.purpose === 'intake');
    expect(String(first[0]!.prompt)).toContain('[f_wife] Wife is Simran');

    // J17 forget: the line goes, and with it the index row (08-3 §12.6; the tombstone blocks re-learning).
    const now = x.clock.now();
    const r = applyDbOps(
      x.db,
      [
        { op: 'delete', table: 'memory_index', id: 'f_wife' },
        {
          op: 'insert',
          table: 'memory_tombstones',
          row: { hash: 'h_wife', origin_kind: 'manual', forgotten_at: now, expires_at: now + 90 * 86_400_000 },
        },
      ],
      { now },
    );
    expect(r.result.ok).toBe(true);

    x.userSays("What's my wife's name? Simran?");
    await x.idle();
    const second = x.turnsJsonl().filter((t) => t.purpose === 'intake')[1]!;
    expect(String(second.system)).not.toContain('f_wife');
    expect(String(second.prompt)).not.toContain('[f_wife]');
    expect(String(second.prompt)).not.toContain('Wife is Simran');
  });
});
