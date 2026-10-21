// Spec: project testing rule §6 and Test-First Pipeline G4 (pass^3: the top real-AI journeys pass in every one of 3
// rounds, so a journey that passes only sometimes counts as failing). Reads the summary.json files of each round's
// parts (artifact folders named real-ai-<ai>-r<round>-s<part>) and prints a table; exit 1 when any journey missed a round.
// Runs under plain Node: node --experimental-strip-types scripts/real-ai-pass-k.ts <downloaded-artifacts-dir>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type Result = { ai: string; round: number; journey: string; passed: boolean };
export type Row = { ai: string; journey: string; passes: number; rounds: number };

/** A journey passed a round when its summary has no failed step; a journey absent from a round failed it. */
export function passK(results: Result[]): { rows: Row[]; ok: boolean } {
  const rounds = new Map<string, Set<number>>();
  for (const r of results) rounds.set(r.ai, (rounds.get(r.ai) ?? new Set()).add(r.round));
  const rows = new Map<string, Row>();
  for (const r of results) {
    const key = `${r.ai}\t${r.journey}`;
    const row = rows.get(key) ?? { ai: r.ai, journey: r.journey, passes: 0, rounds: rounds.get(r.ai)!.size };
    if (r.passed) row.passes++;
    rows.set(key, row);
  }
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
  const results = readResults(root);
  const { rows, ok } = passK(results);
  console.log(results.length ? table(rows) : 'No journey results were found.');
  process.exit(results.length && ok ? 0 : 1);
}
