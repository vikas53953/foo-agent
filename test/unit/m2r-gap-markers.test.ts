// Spec: 11 §11.7.5 (one GAPS.md line per gap: date · what is missing · where you looked · what you did; the code is marked
// `// GAP: GAPS.md {date} "…"`; ART-30 fails on a `GAP:` marker without a matching GAPS line), §11.1.3 (builders never edit
// spec/: the M2 lines wait for the spec keeper in implementation-notes "GAPS lines for the spec keeper"). M2 review D5.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

const lineList = (text: string) => text.split('\n').filter((l) => /^- \d{4}-\d{2}-\d{2} · /.test(l));

/** The lines waiting for the spec keeper (implementation-notes, "GAPS lines for the spec keeper"). */
function pendingLines(): string[] {
  const notes = readFileSync(join(ROOT, 'implementation-notes.md'), 'utf8');
  const start = notes.indexOf('### GAPS lines for the spec keeper');
  return start < 0 ? [] : lineList(notes.slice(start).split(/\n#{2,3} (?!GAPS lines)/)[0]!);
}

/** Every GAPS line known: the frozen GAPS.md and the pending ones. */
const gapsLines = () => [...lineList(readFileSync(join(ROOT, 'spec/constitution/GAPS.md'), 'utf8')), ...pendingLines()];

const MARKER = /GAP: GAPS\.md (\d{4}-\d{2}-\d{2}) "([^"]+)"/g;

describe('GAP markers match GAPS lines (11 §11.7.5, review D5)', () => {
  const lines = gapsLines();
  const markers = ['src', 'test', 'scripts'].flatMap((d) =>
    files(join(ROOT, d)).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(MARKER)].map((m) => ({ file: f.slice(ROOT.length + 1), date: m[1]!, key: m[2]! })),
    ),
  );

  it('finds the M2 markers', () => {
    expect(markers.length).toBeGreaterThanOrEqual(25);
  });

  it('every marker names a GAPS line with its date and key', () => {
    const orphans = markers.filter((m) => !lines.some((l) => l.startsWith(`- ${m.date} · ${m.key}`)));
    expect(orphans).toEqual([]);
  });

  it('each pending line has the four parts (date · what · where · what was done)', () => {
    const pending = pendingLines();
    expect(pending.length).toBeGreaterThanOrEqual(30);
    const bad = pending.filter((l) => l.split(' · ').length < 4);
    expect(bad).toEqual([]);
  });
});
