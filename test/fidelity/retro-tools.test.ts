// Builder tools from the P1 + R1 retro (docs/build-method.md): ticket merges, known-red CI verdicts, trace flips and
// per-ticket copy-pending lists. FID-18 (11-fidelity §11.5.3) keeps working on the files these tools write.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pendingKeys } from '../../scripts/check-copy';
import { classify, digest, parseFailures, readKnownRed } from '../../scripts/ci-verdict';
import { mergeLines, mergePending, mergeTrace } from '../../scripts/merge-rows';
import { resolverFor } from '../../scripts/merge-ticket';
import { HEADER } from '../../scripts/trace-check';
import { flipId } from '../../scripts/trace-flip';

// Synthetic sources are built so this file's own text holds no test title with an id.
const kw = 'test';
const src = (...titles: string[]) => titles.map((t) => `${kw}('${t}', () => {});`).join('\n');
const csv = (...rows: string[]) => [HEADER.join(','), ...rows].join('\n') + '\n';
const row = (id: string, file: string, status: string, m = 'M10') => `R6,J10,${id},,,05-cards-2 §5.6,${file},${m},${status}`;

describe('ticket merge: trace rows', () => {
  const base = csv(row('AT-101', 'test/e2e/a.spec.ts', 'pending'), row('AT-102', 'test/e2e/b.spec.ts', 'pending'));

  it('keeps both sides when each flipped a different row', () => {
    const ours = csv(row('AT-101', 'test/unit/a.test.ts', 'live'), row('AT-102', 'test/e2e/b.spec.ts', 'pending'));
    const theirs = csv(row('AT-101', 'test/e2e/a.spec.ts', 'pending'), row('AT-102', 'test/e2e/b.spec.ts', 'live'));
    const r = mergeTrace(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toBe(csv(row('AT-101', 'test/unit/a.test.ts', 'live'), row('AT-102', 'test/e2e/b.spec.ts', 'live')));
  });

  it('takes the live row when one side flipped it and the other edited the pending row', () => {
    const ours = csv(row('AT-101', 'test/e2e/a2.spec.ts', 'pending'), row('AT-102', 'test/e2e/b.spec.ts', 'pending'));
    const theirs = csv(row('AT-101', 'test/unit/a.test.ts', 'live'), row('AT-102', 'test/e2e/b.spec.ts', 'pending'));
    expect(mergeTrace(base, ours, theirs).text).toContain(row('AT-101', 'test/unit/a.test.ts', 'live'));
  });

  it('appends rows the ticket added, keeps rows we added, and drops rows the ticket deleted', () => {
    const ours = csv(
      row('AT-101', 'test/e2e/a.spec.ts', 'pending'),
      row('AT-102', 'test/e2e/b.spec.ts', 'pending'),
      row('AT-103', 'x', 'pending'),
    );
    const theirs = csv(row('AT-101', 'test/e2e/a.spec.ts', 'pending'), row('AT-104', 'y', 'pending'));
    const r = mergeTrace(base, ours, theirs);
    expect(r.text).toBe(csv(row('AT-101', 'test/e2e/a.spec.ts', 'pending'), row('AT-103', 'x', 'pending'), row('AT-104', 'y', 'pending')));
  });

  it('reports a row both sides changed to different live files', () => {
    const ours = csv(row('AT-101', 'test/unit/a.test.ts', 'live'), row('AT-102', 'test/e2e/b.spec.ts', 'pending'));
    const theirs = csv(row('AT-101', 'test/unit/z.test.ts', 'live'), row('AT-102', 'test/e2e/b.spec.ts', 'pending'));
    expect(mergeTrace(base, ours, theirs).conflicts).toHaveLength(1);
  });

  it('treats one id in two milestones as two rows', () => {
    const b = csv(row('ART-26a', 'test/e2e/m1.spec.ts', 'live', 'M1'));
    const t = csv(row('ART-26a', 'test/e2e/m1.spec.ts', 'live', 'M1'), row('ART-26a', 'test/e2e/m2.spec.ts', 'live', 'M2'));
    expect(mergeTrace(b, b, t).text).toBe(t);
  });
});

describe('ticket merge: decision logs and copy-pending', () => {
  it('decision logs keep our rows and append the ticket rows', () => {
    const base = 'ts\twhy\na\t1\n';
    expect(mergeLines(base, base + 'b\t2\n', base + 'c\t3\n').text).toBe('ts\twhy\na\t1\nb\t2\nc\t3\n');
  });

  it('copy-pending drops keys the ticket now renders and keeps keys it added', () => {
    const j = (keys: Record<string, string>) => JSON.stringify({ _why: 'x', keys });
    const base = j({ 'a.b.c': 'T2', 'a.b.d': 'T3' });
    const ours = j({ 'a.b.c': 'T2', 'a.b.d': 'T3', 'a.b.e': 'T4' });
    const theirs = j({ 'a.b.d': 'T3', 'a.b.f': 'T2' });
    expect(JSON.parse(mergePending(base, ours, theirs).text)).toEqual({ _why: 'x', keys: { 'a.b.d': 'T3', 'a.b.e': 'T4', 'a.b.f': 'T2' } });
  });

  it('only row files are resolved automatically', () => {
    expect(resolverFor('spec/trace.csv')).toBe(mergeTrace);
    expect(resolverFor('docs/decisions/P2.tsv')).toBe(mergeLines);
    expect(resolverFor('scripts/copy-pending/p2-t3.json')).toBe(mergePending);
    expect(resolverFor('src/renderer/kit/KitSurface.tsx')).toBeUndefined();
  });

  it('check-copy reads the shared list and per-ticket lists', () => {
    expect(pendingKeys().every(([file]) => file.startsWith('scripts/copy-pending'))).toBe(true);
  });
});

describe('CI verdict', () => {
  const log = [
    '2026-10-20T10:00:00.0000000Z  FAIL  test/unit/kit.test.ts > kit > renders the chart',
    '  ✘  12 test/e2e/m2-messages.spec.ts:121:1 › PERF-04 · fling scroll holds 60 fps (31.2s)',
    '  1) test/e2e/m1-shell.spec.ts:121:1 › PERF-03: chat switch paints (12.0s)',
    '  ✓  13 test/e2e/m1-shell.spec.ts:20:1 › passes (1.0s)',
  ].join('\n');
  const known = readKnownRed('match\twhere\tsymptom\tfirst_seen\towner\tfix\nPERF-04\tlinux-local\tsoftware renderer\tx\tnone\t\n');

  it('reads failing tests from vitest and Playwright logs', () => {
    expect(parseFailures(log)).toEqual([
      { file: 'test/unit/kit.test.ts', title: 'kit > renders the chart' },
      { file: 'test/e2e/m2-messages.spec.ts', title: 'PERF-04 · fling scroll holds 60 fps' },
      { file: 'test/e2e/m1-shell.spec.ts', title: 'PERF-03: chat switch paints' },
    ]);
  });

  it('sorts each failure into mine, known or new', () => {
    const [kit, fling, sw] = parseFailures(log) as [never, never, never];
    const changed = new Set(['test/unit/kit.test.ts']);
    expect(classify(kit, known, changed).verdict).toBe('mine');
    expect(classify(fling, known, changed, 'linux-local').verdict).toBe('known');
    expect(classify(fling, known, changed, 'windows-ci').verdict).toBe('new');
    expect(classify(sw, known, changed).verdict).toBe('new');
    expect(digest(parseFailures(log), known, changed, 'linux-local')).toMatch(/^CI verdict: 3 failing \(1 mine, 1 known, 1 new\)/);
  });

  it('every known-red row says where it fails and how to read it', () => {
    const rows = readKnownRed(readFileSync('docs/known-red.tsv', 'utf8'));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(['linux-local', 'windows-ci', 'any']).toContain(r.where);
      expect(r.match && r.symptom && r.owner).toBeTruthy();
    }
  });
});

describe('trace flip', () => {
  const t = csv(row('AT-201', 'test/e2e/a.spec.ts', 'pending'));

  it('points the row at the file whose test carries the id and marks it live', () => {
    const r = flipId(t, 'AT-201', { 'test/unit/a.test.ts': src('AT-201 · works'), 'test/e2e/a.spec.ts': src('other') });
    expect(r.problems).toEqual([]);
    expect(r.text).toBe(csv(row('AT-201', 'test/unit/a.test.ts', 'live')));
  });

  it('refuses when no file or several files carry the id', () => {
    expect(flipId(t, 'AT-201', {}).problems[0]).toMatch(/no test title/);
    const two = { 'test/unit/a.test.ts': src('AT-201 x'), 'test/unit/b.test.ts': src('AT-201 y') };
    expect(flipId(t, 'AT-201', two).problems[0]).toMatch(/pass --file/);
    expect(flipId(t, 'AT-201', two, 'test/unit/b.test.ts').text).toContain('test/unit/b.test.ts,M10,live');
  });

  it('quotes cells that hold commas', () => {
    const q = csv(`R6,J10,AT-202,,,"05-cards-2 §5.6, §5.7",test/x.test.ts,M10,pending`);
    expect(flipId(q, 'AT-202', { 'test/x.test.ts': src('AT-202 z') }).text).toContain('"05-cards-2 §5.6, §5.7",test/x.test.ts,M10,live');
  });
});
