// M6 T4: AT-074 (prompt part). 10-acceptance-1 §B AT-074 (a forgotten fact is never used in a later reply), 08-4 §24.16
// (parts 5/5b read memory_index; a forgotten fact has no row), 08-3 §12.6 (forget deletes the line and its index row). The
// real Engine and main's EngineBridge over a temp SQLite db; the AI turns are the fake script (08-3 §22.3).
import { afterEach, describe, expect, it } from 'vitest';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;

describe('AT-074 · a forgotten fact never reaches a later prompt', () => {
  it('AT-074 · after forget, neither part 5 nor part 5b carries the fact', async () => {
    h = makeHarness({
      script: [intake(reply('He lives in Pune.')), intake(reply('I do not know that.'))],
      settings: verified(),
      tools: {},
    });
    const x = h;
    await x.idle();
    const insert = x.db.prepare(
      `INSERT INTO memory_index (id, file, line_no, scope, text, provenance, origin, origin_kind, kind, learned_at, use_count, hash)
       VALUES (?, 'memory/about-you.md', ?, 'global', ?, 'said', 'manual', 'manual', 'fact', ?, ?, ?)`,
    );
    // The fact is added the way the Memory page adds one, so it has its file line (forget edits the file).
    const added = await x.engine.memory.cmd({ cmd: 'add', text: 'Brother Rohit lives in Pune' });
    if (!added.ok) throw new Error(added.error.kind);
    const bro = (added.value as { id: string }).id;
    // Enough busier facts that the brother fact is a turn fact (5b), not pinned, on the first ask.
    for (let i = 0; i < 30; i++) insert.run(`f_fill${i}`, i + 10, `Filler ${i} ${'y'.repeat(120)}`, x.clock.now(), 50, `h_fill${i}`);

    x.userSays('Where does my brother live?');
    await x.idle();
    const first = x.turnsJsonl().filter((t) => t.purpose === 'intake');
    expect(String(first[0]!.prompt)).toContain(`[${bro}] Brother Rohit lives in Pune`);

    // J17 forget through the memory store's own command (the Memory page's Forget): line, index row, tombstone (08-3 §12.6).
    const r = await x.engine.memory.cmd({ cmd: 'forget', factId: bro });
    expect(r.ok).toBe(true);
    expect(x.db.prepare('SELECT COUNT(*) AS n FROM memory_index WHERE id = ?').get(bro)).toEqual({ n: 0 });
    expect((x.db.prepare('SELECT COUNT(*) AS n FROM memory_tombstones').get() as { n: number }).n).toBe(1);

    x.userSays('Where does my brother Rohit live?');
    await x.idle();
    const second = x.turnsJsonl().filter((t) => t.purpose === 'intake')[1]!;
    expect(String(second.system)).not.toContain(bro);
    expect(String(second.prompt)).not.toContain(`[${bro}]`);
    expect(String(second.prompt)).not.toContain('Brother Rohit lives in Pune');
  });
});
