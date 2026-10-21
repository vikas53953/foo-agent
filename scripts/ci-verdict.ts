// Spec: docs/build-method.md (tickets compare red CI against the milestone's known failures, P1 + R1 retro struggle 3);
// 11-fidelity §11.2.7 FID-06 (a red test is never skipped: it is mine, known with an owner, or new). Reads a saved CI or
// local test log, lists the failing tests and sorts each one: mine (its test file changed on this branch), known (a row of
// docs/known-red.tsv), or new. Prints a short Markdown digest to paste as one PR comment instead of raw logs.
// Usage: tsx scripts/ci-verdict.ts <log-file>... [--where linux-local|windows-ci] [--base origin/<branch>]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Failure {
  file: string;
  title: string;
}

export interface KnownRed {
  match: string;
  where: string;
  symptom: string;
  owner: string;
  fix: string;
}

export type Verdict = 'mine' | 'known' | 'new';

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'); // colour codes in raw job logs
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/;
const TEST_REF = /(test\/[\w./-]+\.(?:spec|test)\.ts)(?::\d+(?::\d+)?)?\s+(?:›|>)\s+(.+?)\s*(?:\(\d[\d.]*m?s\))?\s*$/;

/** Failing tests from vitest (`FAIL file > title`, `× ...`) and Playwright (`✘ ... file:line › title`, `1) file › title`). */
export function parseFailures(log: string): Failure[] {
  const out = new Map<string, Failure>();
  for (const raw of log.split('\n')) {
    const line = raw.replace(STAMP, '').replace(ANSI, '');
    if (!/(^|\s)(FAIL|✘|×)\s|^\s*\d+\)\s/.test(line)) continue;
    const m = TEST_REF.exec(line);
    if (!m) continue;
    const title = m[2]!.replace(/^\[\w+\]\s+›\s+/, '').trim();
    out.set(`${m[1]}|${title}`, { file: m[1]!, title });
  }
  return [...out.values()];
}

export function readKnownRed(tsv: string): KnownRed[] {
  const [header, ...rows] = tsv.split('\n').filter((l) => l.trim() !== '');
  const cols = (header ?? '').split('\t');
  return rows.map((r) => {
    const cells = r.split('\t');
    const get = (c: string) => (cells[cols.indexOf(c)] ?? '').trim();
    return { match: get('match'), where: get('where'), symptom: get('symptom'), owner: get('owner'), fix: get('fix') };
  });
}

export function classify(f: Failure, known: KnownRed[], changed: Set<string>, where?: string): { verdict: Verdict; row?: KnownRed } {
  if (changed.has(f.file)) return { verdict: 'mine' };
  const row = known.find(
    (k) => k.match && (f.title.includes(k.match) || f.file === k.match) && (!where || k.where === 'any' || k.where === where),
  );
  return row ? { verdict: 'known', row } : { verdict: 'new' };
}

export function digest(failures: Failure[], known: KnownRed[], changed: Set<string>, where?: string): string {
  if (!failures.length) return 'CI verdict: no failing tests found in the log.';
  const rows = failures.map((f) => ({ f, ...classify(f, known, changed, where) }));
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const lines = [
    `CI verdict: ${rows.length} failing (${count('mine')} mine, ${count('known')} known, ${count('new')} new)${where ? ` on ${where}` : ''}`,
    '',
    '| verdict | test | note |',
    '| --- | --- | --- |',
    ...rows
      .sort((a, b) => ['mine', 'new', 'known'].indexOf(a.verdict) - ['mine', 'new', 'known'].indexOf(b.verdict))
      .map(({ f, verdict, row }) => {
        const note =
          verdict === 'known'
            ? `${row!.symptom}; fix: ${row!.fix || 'none yet'}`
            : verdict === 'mine'
              ? 'test file changed on this branch: root-cause it here'
              : 'not on docs/known-red.tsv: root-cause it, or add a row with an owner';
        return `| ${verdict} | \`${f.file}\` › ${f.title.replace(/\|/g, '\\|')} | ${note} |`;
      }),
  ];
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const where = flag('--where');
  const base = flag('--base') ?? 'origin/main';
  const logs = args.filter((a, i) => !a.startsWith('--') && !['--where', '--base'].includes(args[i - 1] ?? ''));
  if (!logs.length) {
    console.error('usage: tsx scripts/ci-verdict.ts <log-file>... [--where linux-local|windows-ci] [--base origin/<branch>]');
    process.exit(2);
  }
  const changed = new Set(
    execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean),
  );
  const failures = parseFailures(logs.map((l) => readFileSync(l, 'utf8')).join('\n'));
  console.log(digest(failures, readKnownRed(readFileSync('docs/known-red.tsv', 'utf8')), changed, where));
}
