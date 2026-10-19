// M6 T3 store (08-3 §12.2–§12.6, 08-1 §3.2 memory rows): add / edit / setPrivate / setKind / forget / undo through
// `memory.cmd`, the file line and the index row each writes, the watcher's reindex of a Notepad edit, and the worker parse.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createParseWorker } from '../../src/engine/memory/parseWorker';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import type { Db } from '../../src/main/store/db';
import { memoryFileOf, watchMemory, WATCH_DEBOUNCE_MS } from '../../src/engine/memory/watcher';
import { FakeClock } from '../../src/shared/clock';
import type { MemoryFactView } from '../../src/shared/types';
import { seedUxWorld } from '../../src/main/test/seed/uxWorld';
import { writeSeedMemory } from '../../src/main/test/seed/writer';
import { makeHarness } from '../unit/m3-engine-helpers';
import { DAY, fid, storeHarness } from './m6-store-harness';

const LINE = /^- (.+?) {2}\{(.+)\}$/;
const tokens = (line: string) => LINE.exec(line)![2]!.split(' · ');
const value = <T>(r: { ok: boolean; value?: unknown }) => {
  expect(r.ok).toBe(true);
  return r.value as T;
};

describe('M6 T3 memory:add (08-3 §12.4 manual add)', () => {
  it('writes the line with its brace to about-you.md and the index row: you said, origin manual, scope global', async () => {
    const h = storeHarness();
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'add', text: 'Vegetarian on Tuesdays' }));
    expect(h.read('memory/about-you.md')).toBe(`# About you\n- Vegetarian on Tuesdays  {you said · 2026-10-16 · you typed it · ${v.id}}\n`);
    expect(v).toMatchObject({
      file: 'memory/about-you.md',
      lineNo: 2,
      scope: 'global',
      provenance: 'said',
      origin: 'manual',
      originKind: 'manual',
      kind: 'fact',
      category: 'other',
      private: false,
      learnedAt: h.clock.now(),
    });
    expect(h.changed).toEqual([[v.id]]);
  });

  it('a sensitive fact is saved private under ## Private (§12.4.1: said + sensitive = private forced on)', async () => {
    const h = storeHarness();
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'add', text: 'I’m allergic to peanuts' }));
    const text = h.read('memory/about-you.md');
    expect(text).toBe(`# About you\n\n## Private\n- I’m allergic to peanuts  {you said · 2026-10-16 · you typed it · private · ${v.id}}\n`);
    expect(v).toMatchObject({ private: true, sensitive: true, lineNo: 4 });
  });

  it('places by the classify act: a person in people\\{slug}.md, a preference in preferences\\{topic}.md', async () => {
    const acts = [
      { category: 'people', kind: 'person', person: 'Meera' },
      { category: 'travel', kind: 'preference' },
    ];
    const h = storeHarness({ classify: () => Promise.resolve(acts.shift()) });
    const a = value<MemoryFactView>(await h.svc.cmd({ cmd: 'add', text: 'Meera likes jasmine tea' }));
    const b = value<MemoryFactView>(await h.svc.cmd({ cmd: 'add', text: 'Window seats on long flights' }));
    expect(a).toMatchObject({ file: 'memory/people/meera.md', kind: 'person', category: 'people', lineNo: 1 });
    expect(b).toMatchObject({ file: 'memory/preferences/travel.md', kind: 'preference', category: 'travel' });
    expect(h.read('memory/people/meera.md')).toBe(`- Meera likes jasmine tea  {you said · 2026-10-16 · you typed it · ${a.id}}\n`);
  });

  it('a failed or malformed classify turn falls back to kind fact, category other', async () => {
    const h = storeHarness({ classify: () => Promise.resolve({ category: 'people', kind: 'person' }) });
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'add', text: 'Likes filter coffee' }));
    expect(v).toMatchObject({ file: 'memory/about-you.md', kind: 'fact', category: 'other' });
    const h2 = storeHarness({ classify: () => Promise.reject(new Error('offline')) });
    expect(value<MemoryFactView>(await h2.svc.cmd({ cmd: 'add', text: 'Likes filter coffee' }))).toMatchObject({ kind: 'fact' });
  });

  it('answers VALIDATION for text over 120 characters', async () => {
    const h = storeHarness();
    const r = await h.svc.cmd({ cmd: 'add', text: 'x'.repeat(121) });
    expect(r).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    expect(h.writes).toEqual([]);
  });
});

describe('M6 T3 edit, private, kind (08-1 §3.2; 08-3 §12.3, X-06)', () => {
  const seeded = () => {
    const h = storeHarness();
    h.put(
      'memory/about-you.md',
      `# About you\n- Lives in Pune  {I guessed · 2026-10-01 · Gmail · from 3 emails · ${fid(1)}}\n- Likes beach stays  {you said · 2026-10-02 · chat · ${fid(2)}}\n`,
    );
    return h;
  };

  it('an edit turns the fact into you said · today, keeps its id, origin and line', async () => {
    const h = seeded();
    await h.svc.fileChanged('memory/about-you.md');
    h.clock.advance(3 * DAY);
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'edit', factId: fid(1), text: 'Lives in Mumbai' }));
    expect(h.read('memory/about-you.md').split('\n')[1]).toBe(`- Lives in Mumbai  {you said · 2026-10-19 · Gmail · ${fid(1)}}`);
    expect(v).toMatchObject({ id: fid(1), text: 'Lives in Mumbai', provenance: 'said', reason: null, originKind: 'gmail', lineNo: 2 });
  });

  it('setPrivate moves the line under ## Private and back', async () => {
    const h = seeded();
    await h.svc.fileChanged('memory/about-you.md');
    value(await h.svc.cmd({ cmd: 'setPrivate', factId: fid(1), private: true }));
    const lines = h.read('memory/about-you.md').split('\n');
    expect(lines.slice(2, 5)).toEqual([
      '',
      '## Private',
      `- Lives in Pune  {I guessed · 2026-10-01 · Gmail · from 3 emails · private · ${fid(1)}}`,
    ]);
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'setPrivate', factId: fid(1), private: false }));
    expect(v.private).toBe(false);
    expect(h.read('memory/about-you.md')).not.toContain('## Private');
  });

  it('setKind preference moves the line to preferences\\{topic}.md and keeps the index-only columns', async () => {
    const h = seeded();
    await h.svc.fileChanged('memory/about-you.md');
    h.db.prepare('UPDATE memory_index SET use_count = 4, category = ? WHERE id = ?').run('travel', fid(2));
    const before = h.rows().find((r) => r.id === fid(2))!;
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'setKind', factId: fid(2), kind: 'preference' }));
    expect(v).toMatchObject({ file: 'memory/preferences/travel.md', kind: 'preference', useCount: 4, learnedAt: before.learned_at });
    expect(h.read('memory/preferences/travel.md')).toBe(`- Likes beach stays  {you said · 2026-10-02 · chat · ${fid(2)}}\n`);
    expect(h.read('memory/about-you.md')).not.toContain(fid(2));
    expect(h.rows().filter((r) => r.id === fid(2))).toHaveLength(1);
  });

  it('answers NOT_FOUND for a fact id the index does not have', async () => {
    const h = storeHarness();
    expect(await h.svc.cmd({ cmd: 'edit', factId: fid(9), text: 'x' })).toEqual({ ok: false, error: { kind: 'NOT_FOUND' } });
  });
});

describe('M6 T3 forget and undo (08-3 §12.6)', () => {
  const three = () => {
    const h = storeHarness();
    h.put(
      'memory/about-you.md',
      [
        '# About you',
        `- Works from home on Fridays  {you said · 2026-10-02 · chat · ${fid(1)}}`,
        `- Lives in Pune  {I guessed · 2026-10-01 · Gmail · from 3 emails · ${fid(2)}}`,
        `- Orders groceries on Saturdays  {you said · 2026-10-03 · chat · ${fid(3)}}`,
        '',
      ].join('\n'),
    );
    return h;
  };

  it('forget deletes the line, writes the 90-day tombstone (DB and memory\\.tombstones), and writes no activity row', async () => {
    const h = three();
    await h.svc.fileChanged('memory/about-you.md');
    const { undoToken } = value<{ undoToken: string }>(await h.svc.cmd({ cmd: 'forget', factId: fid(2) }));
    expect(undoToken).toMatch(/^undo_[0-9a-f-]{36}$/);
    expect(h.read('memory/about-you.md')).not.toContain('Lives in Pune');
    expect(h.rows().map((r) => r.id)).toEqual([fid(1), fid(3)]);
    const [t] = h.tombstones();
    expect(t).toMatchObject({ origin_kind: 'gmail', forgotten_at: h.clock.now(), expires_at: h.clock.now() + 90 * DAY });
    expect(JSON.parse(h.read('memory/.tombstones'))).toEqual(t);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE event = 'forgot_facts'").get()).toEqual({ n: 0 });
  });

  it('undo within 5 s restores the exact line at its old place with its index columns, and lifts the tombstone', async () => {
    const h = three();
    await h.svc.fileChanged('memory/about-you.md');
    const before = h.read('memory/about-you.md');
    const row = h.rows().find((r) => r.id === fid(2))!;
    const { undoToken } = value<{ undoToken: string }>(await h.svc.cmd({ cmd: 'forget', factId: fid(2) }));
    h.clock.advance(4_900);
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'undo', undoToken }));
    expect(h.read('memory/about-you.md')).toBe(before);
    expect(v).toMatchObject({ id: fid(2), lineNo: 3, learnedAt: row.learned_at, origin: row.origin });
    expect(h.tombstones()).toEqual([]);
    expect(h.read('memory/.tombstones')).toBe('');
  });

  it('undo after 5 s, or a second time, answers TOO_LATE', async () => {
    const h = three();
    await h.svc.fileChanged('memory/about-you.md');
    const a = value<{ undoToken: string }>(await h.svc.cmd({ cmd: 'forget', factId: fid(1) }));
    h.clock.advance(5_001);
    expect(await h.svc.cmd({ cmd: 'undo', undoToken: a.undoToken })).toEqual({ ok: false, error: { kind: 'TOO_LATE' } });
    const b = value<{ undoToken: string }>(await h.svc.cmd({ cmd: 'forget', factId: fid(3) }));
    value(await h.svc.cmd({ cmd: 'undo', undoToken: b.undoToken }));
    expect(await h.svc.cmd({ cmd: 'undo', undoToken: b.undoToken })).toEqual({ ok: false, error: { kind: 'TOO_LATE' } });
  });

  it('a forget from the chip writes forgot_facts with count 1 (G-M6-10)', async () => {
    const h = three();
    await h.svc.fileChanged('memory/about-you.md');
    value(await h.svc.forgetFromChip(fid(2)));
    expect(h.db.prepare("SELECT kind, summary FROM activity WHERE event = 'forgot_facts'").all()).toEqual([
      { kind: 'changed', summary: 'Forgot 1 thing from Gmail' },
    ]);
  });
});

describe('M6 T3 reindex from disk (08-3 §12.2 watcher)', () => {
  it('a brace-less Notepad line becomes you said, today, manual: id and brace written once, then ignored as foo’s own write', async () => {
    const h = storeHarness();
    h.put('memory/about-you.md', '# About you\r\n- Takes the train to Pune\r\n');
    await h.svc.fileChanged('memory/about-you.md');
    const [row] = h.rows();
    expect(row).toMatchObject({ text: 'Takes the train to Pune', provenance: 'said', origin_kind: 'manual', line_no: 2 });
    expect(h.read('memory/about-you.md')).toBe(
      `# About you\n- Takes the train to Pune  {you said · 2026-10-16 · you typed it · ${String(row!.id)}}\n`,
    );
    const txs = h.txs.length;
    await h.svc.fileChanged('memory/about-you.md');
    expect(h.txs.length).toBe(txs);
    expect(h.changed).toEqual([[row!.id]]);
  });

  it('an edited line updates the row in place; a deleted line deletes it; a sensitive edit is made private', async () => {
    const h = storeHarness();
    h.put(
      'memory/about-you.md',
      `- Lives in Pune  {you said · 2026-10-01 · chat · ${fid(1)}}\n- Gym on Mondays  {you said · 2026-10-01 · chat · ${fid(2)}}\n`,
    );
    await h.svc.fileChanged('memory/about-you.md');
    h.put(
      'memory/about-you.md',
      `- Lives in Mumbai  {you said · 2026-10-01 · chat · ${fid(1)}}\n- Takes thyroid tablets  {you said · 2026-10-01 · chat · ${fid(3)}}\n`,
    );
    await h.svc.fileChanged('memory/about-you.md');
    expect(h.rows().map((r) => [r.id, r.text, r.private])).toEqual([
      [fid(1), 'Lives in Mumbai', 0],
      [fid(3), 'Takes thyroid tablets', 1],
    ]);
    expect(tokens(h.read('memory/about-you.md').split('\n')[3]!)).toContain('private');
  });

  it('a Notepad Ctrl+Z back to foo’s own text is reindexed (the own-write mark is spent by the first outside edit)', async () => {
    const h = storeHarness();
    const v = value<MemoryFactView>(await h.svc.cmd({ cmd: 'add', text: 'Likes filter coffee' }));
    const ours = h.read('memory/about-you.md');
    h.put('memory/about-you.md', ours.replace('Likes filter coffee', 'Likes cold coffee'));
    await h.svc.fileChanged('memory/about-you.md');
    expect(h.rows()[0]).toMatchObject({ id: v.id, text: 'Likes cold coffee' });
    h.put('memory/about-you.md', ours);
    await h.svc.fileChanged('memory/about-you.md');
    expect(h.rows()[0]).toMatchObject({ id: v.id, text: 'Likes filter coffee' });
  });

  it('commands sent together run one after another on the file (no lost line)', async () => {
    const h = storeHarness();
    const rs = await Promise.all(['Gym on Mondays', 'Reads at night', 'Wakes at 6'].map((text) => h.svc.cmd({ cmd: 'add', text })));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(
      h
        .read('memory/about-you.md')
        .split('\n')
        .filter((l) => l.startsWith('- ')),
    ).toHaveLength(3);
    expect(h.rows().map((r) => r.line_no)).toEqual([2, 3, 4]);
  });

  it('a parse that throws answers UNKNOWN instead of hanging the invoke', async () => {
    const h = storeHarness({
      parser: { parse: () => Promise.reject(new Error('memory parse worker exited')), close: () => Promise.resolve() },
    });
    expect(await h.svc.cmd({ cmd: 'add', text: 'Likes tea' })).toEqual({
      ok: false,
      error: { kind: 'UNKNOWN', message: 'memory parse worker exited' },
    });
    await h.svc.fileChanged('memory/about-you.md');
    expect(h.logs).toContain('memory.reindex_failed');
  });

  it('a file that cannot be read (not missing) keeps its rows and is not rewritten', async () => {
    const h = storeHarness();
    h.put('memory/about-you.md', `- Lives in Pune  {you said · 2026-10-01 · chat · ${fid(1)}}\n`);
    await h.svc.fileChanged('memory/about-you.md');
    const path = join(h.dataDir, 'memory', 'about-you.md');
    rmSync(path);
    mkdirSync(path); // EISDIR: a read error other than ENOENT
    const writes = h.writes.length;
    await h.svc.fileChanged('memory/about-you.md');
    expect(h.logs).toContain('memory.reindex_failed');
    expect(h.rows().map((r) => r.id)).toEqual([fid(1)]);
    expect(await h.svc.cmd({ cmd: 'add', text: 'Likes tea' })).toMatchObject({ ok: false, error: { kind: 'UNKNOWN' } });
    expect(h.writes.length).toBe(writes);
  });

  it('a line moved by hand to another file keeps its row (one row per id)', async () => {
    const h = storeHarness();
    h.put('memory/about-you.md', `- Likes beach stays  {you said · 2026-10-01 · chat · ${fid(1)}}\n`);
    await h.svc.fileChanged('memory/about-you.md');
    h.put('memory/preferences/travel.md', `- Likes beach stays  {you said · 2026-10-01 · chat · ${fid(1)}}\n`);
    await h.svc.fileChanged('memory/preferences/travel.md');
    expect(h.rows()).toMatchObject([{ id: fid(1), file: 'memory/preferences/travel.md', kind: 'preference' }]);
  });

  it('the watcher maps memory\\ paths and fires once per file 500 ms after the last change', async () => {
    expect(memoryFileOf('about-you.md')).toBe('memory/about-you.md');
    expect(memoryFileOf('people\\माँ.md')).toBe('memory/people/माँ.md');
    expect(memoryFileOf('.tombstones')).toBeNull();
    expect(memoryFileOf('.tidy-log.md')).toBeNull();
    expect(memoryFileOf('about-you.md.123.tmp')).toBeNull();
    const h = storeHarness();
    const clock = new FakeClock();
    const seen: string[] = [];
    const w = watchMemory({ dataDir: h.dataDir, clock, onChange: (f) => seen.push(f) });
    try {
      writeFileSync(join(h.dataDir, 'memory', 'about-you.md'), '- One\n');
      await expect.poll(() => clock.pendingTimers, { timeout: 5_000 }).toBeGreaterThan(0);
      clock.advance(WATCH_DEBOUNCE_MS - 1);
      expect(seen).toEqual([]);
      clock.advance(1);
      expect(seen).toEqual(['memory/about-you.md']);
    } finally {
      w.close();
    }
  });

  it('parses in the worker thread (08-1 §2.5)', async () => {
    const parser = createParseWorker({ execArgv: ['--require', 'tsx/cjs'] });
    try {
      const h = storeHarness({ parser });
      value(await h.svc.cmd({ cmd: 'add', text: 'Wakes up around 6:30 AM' }));
      expect(h.rows()).toHaveLength(1);
    } finally {
      await parser.close();
    }
  });
});

describe('M6 T3 the engine slot (CR-0010 G-M6-01, G-M6-06)', () => {
  it('memory.cmd reaches MemoryService; privacy.rememberOn=false does not block the page’s own add', async () => {
    const h = makeHarness({ script: [], tools: {}, settings: (s) => ({ ...s, privacy: { ...s.privacy, rememberOn: false } }) });
    const r = await h.bridge.request<MemoryFactView, 'memory.cmd'>('memory.cmd', { cmd: 'add', text: 'Prefers UPI over cards' });
    expect(r).toMatchObject({ ok: true });
    expect(h.db.prepare('SELECT text, origin_kind FROM memory_index').all()).toEqual([
      { text: 'Prefers UPI over cards', origin_kind: 'manual' },
    ]);
    expect(h.patches.filter((p) => p.event === 'memory:changed')).toHaveLength(1);
  });
});

describe('M6 T3 seed facts are files (pack Risk 1)', () => {
  it('the demo seed writes every fact as a line in its file, and reindexing those files changes no row', async () => {
    const h = storeHarness();
    seedUxWorld(h.db, h.clock.now());
    const before = h.rows();
    expect(before.length).toBeGreaterThan(20);
    expect(writeSeedMemory(h.db, h.dataDir, 'Asia/Kolkata')).toBeGreaterThan(1);
    const after = h.rows();
    const about = h.read('memory/about-you.md').split('\n');
    expect(about[0]).toBe('# About you');
    for (const r of after.filter((x) => x.file === 'memory/about-you.md'))
      expect(about[Number(r.line_no) - 1]).toContain(`${String(r.text)}  {`);
    await h.svc.reindexAll();
    expect(h.txs).toEqual([]);
    expect(h.rows()).toEqual(after);
    expect(after.map((r) => [r.id, r.text, r.provenance, r.learned_at])).toEqual(
      before.map((r) => [r.id, r.text, r.provenance, r.learned_at]),
    );
  });
});

describe('M6 T3 memory_fts rebuild (08-1 §2.5)', () => {
  it('rebuilds memory_fts only when a fact’s text is inserted, deleted or rewritten, never for a use count', async () => {
    const h = storeHarness();
    value(await h.svc.cmd({ cmd: 'add', text: 'Likes filter coffee' }));
    const [row] = h.rows();
    const id = String(row!.id);
    const rebuilds = (ops: Parameters<typeof applyDbOps>[1]) => {
      const seen: string[] = [];
      const spy = new Proxy(h.db, {
        get: (t, k) => (k === 'prepare' ? (sql: string) => (seen.push(sql), t.prepare(sql)) : Reflect.get(t, k)),
      }) as Db;
      expect(applyDbOps(spy, ops, { now: h.clock.now() }).result.ok).toBe(true);
      return seen.filter((q) => q.includes("VALUES ('rebuild')")).length;
    };
    expect(rebuilds([{ op: 'update', table: 'memory_index', id, set: { use_count: 3, last_used_at: h.clock.now() } }])).toBe(0);
    expect(rebuilds([{ op: 'update', table: 'memory_index', id, set: { text: 'Likes filter coffee, no sugar' } }])).toBe(1);
    expect(rebuilds([{ op: 'delete', table: 'memory_index', id }])).toBe(1);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM memory_fts WHERE memory_fts MATCH 'coffee'").get()).toEqual({ n: 0 });
  });
});
