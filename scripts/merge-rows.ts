// Spec: docs/build-method.md §3 (shared files have one owner at a time); retro lever 1 (/mnt/project-files/foo/retro/
// findings.md: shared and generated files conflicted on every merge and were hand-merged with ad-hoc scripts). A
// three-way merge for the row files and JSON maps that every ticket appends to. A row or key changed differently on
// both sides is a real clash: nothing is guessed, the file keeps git's markers and the caller stops.
// Usage (from scripts/merge-milestone.sh, during a conflicted merge): tsx scripts/merge-rows.ts <csv|tsv|json> <path>
// Exit 0 = merged and written, 3 = real clash (file untouched), 2 = usage error.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './trace-check';

export type Kind = 'csv' | 'tsv' | 'json';
export type Merged = { ok: true; text: string } | { ok: false; clashes: string[] };

/**
 * Rows of a header + rows file. Kept: every row both sides kept, and every row one side added. Dropped: a base row
 * either side removed or changed (a change is a removal plus an addition). Order: ours, then theirs' new rows.
 * `keyOf` names the row's identity; two different rows with one key that neither side had alone is a clash.
 */
export function mergeRows(base: string, ours: string, theirs: string, keyOf: (row: string) => string = (r) => r): Merged {
  const b = lines(base);
  const o = lines(ours);
  const t = lines(theirs);
  const [bh, oh, th] = [b[0], o[0], t[0]];
  if (oh !== th && !(oh === bh || th === bh)) return { ok: false, clashes: ['header changed on both sides'] };
  const header = oh === bh ? th : oh;
  const oRows = o.slice(1);
  const tRows = t.slice(1);
  const bSet = new Set(b.slice(1));
  const oSet = new Set(oRows);
  const tSet = new Set(tRows);
  const keep = (r: string, other: Set<string>) => !bSet.has(r) || other.has(r);
  const out = oRows.filter((r) => keep(r, tSet));
  const outSet = new Set(out);
  for (const r of tRows)
    if (!outSet.has(r) && keep(r, oSet)) {
      out.push(r);
      outSet.add(r);
    }

  const count = (rows: string[]) => rows.reduce((m, r) => m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + 1), new Map<string, number>());
  const oc = count(oRows);
  const tc = count(tRows);
  const rc = count(out);
  const clashes = [...rc].filter(([k, n]) => n > Math.max(oc.get(k) ?? 0, tc.get(k) ?? 0)).map(([k]) => `row ${k} changed on both sides`);
  if (clashes.length) return { ok: false, clashes };
  return { ok: true, text: [header ?? '', ...out].join('\n') + '\n' };
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Key-by-key three-way merge of JSON objects; arrays and scalars must agree or be changed on one side only. */
export function mergeJson(
  base: Json | undefined,
  ours: Json | undefined,
  theirs: Json | undefined,
  path = '$',
): { value: Json | undefined; clashes: string[] } {
  const same = (x: Json | undefined, y: Json | undefined) => JSON.stringify(x) === JSON.stringify(y);
  if (same(ours, theirs)) return { value: ours, clashes: [] };
  if (same(base, ours)) return { value: theirs, clashes: [] };
  if (same(base, theirs)) return { value: ours, clashes: [] };
  if (isObject(ours) && isObject(theirs)) {
    const b = isObject(base) ? base : {};
    const value: { [k: string]: Json } = {};
    const clashes: string[] = [];
    for (const k of [...new Set([...Object.keys(ours), ...Object.keys(theirs)])]) {
      const r = mergeJson(b[k], ours[k], theirs[k], `${path}.${k}`);
      clashes.push(...r.clashes);
      if (r.value !== undefined) value[k] = r.value;
    }
    return { value, clashes };
  }
  return { value: ours, clashes: [`${path} changed on both sides`] };
}

function isObject(x: Json | undefined): x is { [k: string]: Json } {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function lines(s: string): string[] {
  const l = s.replace(/\r/g, '').split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l;
}

/** spec/trace.csv: one row per link, so the row's identity is everything but its test file and status. */
export function traceKey(row: string): string {
  return JSON.stringify((parseCsv(row)[0] ?? []).slice(0, 6));
}

export function mergeText(kind: Kind, base: string, ours: string, theirs: string, file = ''): Merged {
  if (kind === 'json') {
    const parse = (s: string) => (s.trim() ? (JSON.parse(s) as Json) : undefined);
    const r = mergeJson(parse(base), parse(ours), parse(theirs));
    return r.clashes.length ? { ok: false, clashes: r.clashes } : { ok: true, text: JSON.stringify(r.value, null, 2) + '\n' };
  }
  return mergeRows(base, ours, theirs, kind === 'csv' && file.endsWith('trace.csv') ? traceKey : undefined);
}

/** A stage of the conflicted file: 1 base, 2 ours, 3 theirs. A missing stage (added on both sides) reads as empty. */
function stage(n: 1 | 2 | 3, file: string): string {
  try {
    return execFileSync('git', ['show', `:${n}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    if (n === 1) return '';
    throw new Error(`${file}: deleted on one side`);
  }
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const [kind, file] = process.argv.slice(2) as [Kind | undefined, string | undefined];
  if (!kind || !file || !['csv', 'tsv', 'json'].includes(kind)) {
    console.error('usage: tsx scripts/merge-rows.ts <csv|tsv|json> <path>');
    process.exit(2);
  }
  try {
    const r = mergeText(kind, stage(1, file), stage(2, file), stage(3, file), file);
    if (!r.ok) {
      for (const c of r.clashes) console.error(`${file}: ${c}`);
      process.exit(3);
    }
    writeFileSync(file, r.text);
    console.log(`${file}: rows merged`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(3);
  }
}
