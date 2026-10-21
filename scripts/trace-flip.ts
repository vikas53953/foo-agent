// Spec: 11-fidelity §11.5.3 FID-18 (a live trace row names the file whose test title carries the id). Points an id's
// trace row at the test file that really carries it and marks the row live, so nobody hand-edits the matrix (P1 + R1
// retro: rows named the e2e file when the test was a unit test, five times). Prints what it changed; never commits.
// Usage: tsx scripts/trace-flip.ts <id>... [--file test/path.test.ts]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADER, parseCsv, readTrace, titleIds, walk } from './trace-check';

const FILE = HEADER.indexOf('Test file');
const STATUS = HEADER.indexOf('Status');

function cell(v: string): string {
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface Flip {
  text: string;
  changes: string[];
  problems: string[];
}

/** Sets the Test file and Status of `id`'s row from the test titles. With several rows, the row already naming the file
 *  is flipped; with several carrying files, `file` picks one. */
export function flipId(trace: string, id: string, tests: Record<string, string>, file?: string): Flip {
  const carriers = Object.entries(tests)
    .filter(([, src]) => titleIds(src).includes(id))
    .map(([f]) => f);
  const target = file ?? (carriers.length === 1 ? carriers[0] : undefined);
  if (!carriers.length) return { text: trace, changes: [], problems: [`${id}: no test title carries it yet`] };
  if (!target) return { text: trace, changes: [], problems: [`${id}: titled in ${carriers.join(', ')}; pass --file`] };
  if (!carriers.includes(target)) return { text: trace, changes: [], problems: [`${id}: ${target} has no test titled with it`] };
  const rows = readTrace(trace).rows.filter((r) => r.ids.includes(id));
  const row = rows.find((r) => r.cells['Test file'] === target) ?? (rows.length === 1 ? rows[0] : undefined);
  if (!row) return { text: trace, changes: [], problems: [`${id}: ${rows.length} rows and none names ${target}`] };
  const lines = trace.split('\n');
  const cells = parseCsv(lines[row.line - 1]! + '\n')[0]!;
  const before = `${cells[FILE]},${cells[STATUS]}`;
  cells[FILE] = target;
  cells[STATUS] = 'live';
  if (`${cells[FILE]},${cells[STATUS]}` === before) return { text: trace, changes: [], problems: [] };
  lines[row.line - 1] = cells.map(cell).join(',');
  return { text: lines.join('\n'), changes: [`trace.csv:${row.line} ${id}: ${before} → ${target},live`], problems: [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : undefined;
  const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--file');
  const path = join('spec', 'trace.csv');
  const tests = Object.fromEntries(walk('test').map((f) => [f.split('\\').join('/'), readFileSync(f, 'utf8')]));
  let text = readFileSync(path, 'utf8');
  let failed = false;
  for (const id of ids) {
    const r = flipId(text, id, tests, file);
    text = r.text;
    for (const c of r.changes) console.log(c);
    for (const p of r.problems) console.error(p);
    failed ||= r.problems.length > 0;
  }
  writeFileSync(path, text);
  if (!ids.length) console.error('usage: tsx scripts/trace-flip.ts <id>... [--file test/path.test.ts]');
  process.exit(failed || !ids.length ? 1 : 0);
}
