// Spec: 11-fidelity §11.5.3 FID-18 (traceability matrix spec/trace.csv): every live row's ids appear in a test title in
// exactly the file the matrix names; no test title carries an AT/ART/PERF/UX/BP id the matrix does not know (no orphans);
// pending rows name their milestone. The per-R coverage rule (every R1–R31 has an AT and a UX step) waits until the matrix
// is complete (it grows per milestone).
// Usage: tsx scripts/trace-check.ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HEADER = ['R', 'J', 'AT / ART / PERF', 'UX step', 'BP ref', 'Spec §', 'Test file', 'Milestone', 'Status'];
export const ID = /\b(AT-\d{3}[a-z]?|ART-\d{2}[a-z]?|PERF-\d{2}|UX-\d{2}-\d{2}|BP-[A-Z]+(?:-[A-Z0-9]+)+)\b/g;

export interface TraceRow {
  line: number;
  cells: Record<string, string>;
  ids: string[];
}

/** RFC 4180-style: commas, double quotes, "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function readTrace(text: string): { header: string[]; rows: TraceRow[] } {
  const [header = [], ...body] = parseCsv(text);
  const rows = body.map((cells, i) => {
    const rec = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()]));
    const ids = ['AT / ART / PERF', 'UX step', 'BP ref'].flatMap((h) => (rec[h] ?? '').match(ID) ?? []);
    return { line: i + 2, cells: rec, ids };
  });
  return { header, rows };
}

/** Test titles per file: test(), it(), describe() and test.step() first arguments. */
export function titleIds(source: string): string[] {
  const out: string[] = [];
  const re = /\b(?:test|it|describe)(?:\.\w+)*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (const m of source.matchAll(re)) out.push(...(m[2]!.match(ID) ?? []));
  return [...new Set(out)];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(test|spec)\.ts$/.test(n) ? [p] : [];
  });
}

const norm = (p: string) => p.split('\\').join('/');

export function checkTrace(trace: string, tests: Record<string, string>): string[] {
  const problems: string[] = [];
  const { header, rows } = readTrace(trace);
  if (header.join(',') !== HEADER.join(',')) problems.push(`header must be: ${HEADER.join(',')}`);
  const titles = Object.fromEntries(Object.entries(tests).map(([f, src]) => [f, titleIds(src)]));
  const fileOf = new Map<string, string>();
  for (const r of rows) {
    const { cells } = r;
    const where = `trace.csv:${r.line}`;
    if (!r.ids.length) problems.push(`${where}: no AT/ART/PERF/UX/BP id`);
    if (!/^M\d+$/.test(cells.Milestone ?? '')) problems.push(`${where}: Milestone must be M{n}`);
    if (!/§|Art\./.test(cells['Spec §'] ?? '')) problems.push(`${where}: Spec § is empty`);
    if (cells.Status !== 'live' && cells.Status !== 'pending') problems.push(`${where}: Status must be live or pending`);
    const file = norm(cells['Test file'] ?? '');
    if (!file) problems.push(`${where}: no test file`);
    for (const id of r.ids) {
      const prev = fileOf.get(id);
      if (prev && prev !== file) problems.push(`${where}: ${id} is listed in ${prev} and ${file}`);
      fileOf.set(id, file);
      if (cells.Status !== 'live') continue;
      if (!(file in tests)) problems.push(`${where}: ${file} does not exist`);
      else if (!titles[file]!.includes(id)) problems.push(`${where}: ${file} has no test titled with ${id}`);
    }
  }
  for (const [file, ids] of Object.entries(titles))
    for (const id of ids) {
      const listed = fileOf.get(id);
      if (!listed) problems.push(`orphan: ${file} has a test titled ${id}, which trace.csv does not know`);
      else if (listed !== file) problems.push(`${id}: trace.csv names ${listed}, but the test is in ${file}`);
    }
  return problems;
}

export function checkRepo(): string[] {
  const tests = Object.fromEntries(walk('test').map((f) => [norm(f), readFileSync(f, 'utf8')]));
  return checkTrace(readFileSync(join('spec', 'trace.csv'), 'utf8'), tests);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(join('spec', 'trace.csv'))) throw new Error('spec/trace.csv is missing');
  const problems = checkRepo();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('FID-18: trace.csv consistent with the test titles');
}
