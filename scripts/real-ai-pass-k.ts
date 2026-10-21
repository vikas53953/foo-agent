// Spec: project testing rule §6 and Test-First Pipeline G4 (pass^3: the top real-AI journeys pass in every one of 3
// rounds, so a journey that passes only sometimes counts as failing). Reads the summary.json files of each round's
// parts (artifact folders named real-ai-<ai>-r<round>-s<part>) and prints a table; exit 1 when any journey missed a round.
// k and the journey list come from the caller, so a round that never reported, or a journey that never wrote a
// summary, counts as failed rather than shrinking the bar.
// Runs under plain Node: node --experimental-strip-types scripts/real-ai-pass-k.ts <artifacts-dir> --rounds 3 [--expect top10.txt]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type Result = { ai: string; round: number; journey: string; passed: boolean };
export type Row = { ai: string; journey: string; passes: number; rounds: number };

/** A journey passed a round when its summary has no failed step; a journey absent from a round failed it. */
export function passK(results: Result[], k: number, expected: string[] = []): { rows: Row[]; ok: boolean } {
  const rows = new Map<string, Row>();
  const row = (ai: string, journey: string) => {
    const key = `${ai}\t${journey}`;
    const r = rows.get(key) ?? { ai, journey, passes: 0, rounds: k };
    rows.set(key, r);
    return r;
  };
  for (const r of results) if (r.passed && r.round <= k) row(r.ai, r.journey).passes++;
  for (const r of results) row(r.ai, r.journey);
  for (const ai of new Set(results.map((r) => r.ai))) for (const j of expected) row(ai, j);
  const list = [...rows.values()].sort((a, b) => a.ai.localeCompare(b.ai) || a.passes - b.passes || a.journey.localeCompare(b.journey));
  return { rows: list, ok: list.every((r) => r.passes === r.rounds) };
}

export function table(rows: Row[]): string {
  const out = ['| AI | Journey | Passed | pass^k |', '|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.ai} | ${r.journey} | ${r.passes}/${r.rounds} | ${r.passes === r.rounds ? 'yes' : '**no**'} |`);
  return out.join('\n');
}

function summaries(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? summaries(p) : n === 'summary.json' ? [p] : [];
  });
}

export function readResults(root: string): Result[] {
  const out: Result[] = [];
  for (const part of existsSync(root) ? readdirSync(root) : []) {
    const m = /^real-ai-(\w+)-r(\d+)-s\d+$/.exec(part);
    if (!m) continue;
    for (const f of summaries(join(root, part))) {
      const s = JSON.parse(readFileSync(f, 'utf8')) as { journey: string; failed: number };
      out.push({ ai: m[1]!, round: Number(m[2]), journey: s.journey, passed: s.failed === 0 });
    }
  }
  // One journey can run in two parts of a round (the first run runs in every part): it passed only if every copy did.
  const merged = new Map<string, Result>();
  for (const r of out) {
    const key = `${r.ai}\t${r.round}\t${r.journey}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, passed: prev.passed && r.passed } : r);
  }
  return [...merged.values()];
}

if (process.argv[1]?.endsWith('real-ai-pass-k.ts')) {
  const root = process.argv[2];
  if (!root) {
    console.error('usage: real-ai-pass-k.ts <artifacts-dir>');
    process.exit(2);
  }
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const k = Number(arg('--rounds'));
  if (!(k >= 1)) {
    console.error('usage: real-ai-pass-k.ts <artifacts-dir> --rounds <k> [--expect <journey list file>]');
    process.exit(2);
  }
  const listFile = arg('--expect');
  const expected = listFile ? readFileSync(listFile, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const results = readResults(root);
  const { rows, ok } = passK(results, k, expected);
  console.log(results.length ? table(rows) : 'No journey results were found.');
  process.exit(results.length && ok ? 0 : 1);
}
