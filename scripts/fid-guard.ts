// Spec: 11-fidelity §11.1.3 FID-02 (spec/** and golden/** change only with a CR), §11.2.7 FID-06 (no snapshot update,
// skip, only, mask or threshold change without a CR), §11.7.1 FID-19 (every changed path has an owner in OWNERS.yml);
// FID-22 (X-189, CR-0031: the checks are locked: a PR that changes a check file, or removes more test cases than it adds,
// needs a CR, so a coding agent cannot quietly weaken what proves a feature works); foo-plan §1 rule 8. Runs on pull_request events (GITHUB_EVENT_PATH); a CR is cited as CR-nnnn in a commit message of the
// PR or in the PR body, and must exist as docs/cr/CR-nnnn*.md. golden/app/** baselines may instead cite
// "Fidelity-Report: <id>" (written by golden-bless). FID-02 also needs the CR file to say `Status: Approved by Vikas` with a
// DECISIONS row id that exists: a cited CR that does not is listed as PENDING (a warning; CRs wait for Vikas's morning
// review), and `--strict` (the merge gate) fails on it (M2 review D1).
// Usage: tsx scripts/fid-guard.ts [--strict]           (in CI, pull_request events)
//        tsx scripts/fid-guard.ts --base <ref> [--head <ref>] [--body <text>] [--strict]   (locally)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crFile } from './golden-bless';

export interface Added {
  file: string;
  line: string;
}

export interface GuardInput {
  files: string[];
  added: Added[];
  /** Removed lines (FID-22 counts test cases); empty when not given. */
  removed?: Added[];
  /** Commit messages of the PR plus its body. */
  text: string;
  owners: string[];
  crExists: (id: string) => boolean;
  /** The CR file's Status line (text after "Status:"), or null when it has none. */
  crStatus?: (id: string) => string | null;
  /** DECISIONS.md row ids (X-nn) that exist. */
  decisions?: ReadonlySet<string>;
  /** The merge gate: a cited CR that is not approved by Vikas fails instead of warning. */
  strict?: boolean;
}

/** A cited CR that FID-02 cannot count yet, and why. */
export interface PendingCr {
  id: string;
  status: string;
  reason: string;
}

/** The Status line of a CR file: `Status: …` or `- **Status:** …` (first line only). */
export function statusLine(md: string): string | null {
  const m = md.match(/^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Status:(?:\*\*)?[ \t]*(.+)$/im);
  return m ? m[1]!.trim() : null;
}

/** FID-02: `Approved by Vikas` with a DECISIONS row id (X-nn) that exists; anything else is pending, with the reason. */
export function crPending(id: string, status: string | null, decisions: ReadonlySet<string>): PendingCr | null {
  const s = status ?? '';
  if (!/^Approved by Vikas\b/i.test(s)) return { id, status: s || '(no Status line)', reason: 'not "Approved by Vikas"' };
  const rows = s.match(/\bX-\d+\b/g) ?? [];
  if (!rows.some((x) => decisions.has(x))) return { id, status: s, reason: 'no DECISIONS row id that exists' };
  return null;
}

/** Cited CRs (with a file) whose Status does not yet satisfy FID-02. */
export function pendingCrs(input: GuardInput): PendingCr[] {
  if (!input.crStatus) return [];
  return citedCrs(input.text)
    .filter((id) => input.crExists(id))
    .map((id) => crPending(id, input.crStatus!(id), input.decisions ?? new Set()))
    .filter((p): p is PendingCr => !!p);
}

export const pendingLine = (p: PendingCr) =>
  `${p.id}: ${p.reason} (Status: ${p.status.length > 120 ? `${p.status.slice(0, 117)}…` : p.status})`;

/** Where picture masks and thresholds live (§11.2.4–§11.2.5); app code and docs may say "threshold" for other things. */
const PICTURE_CODE = /^(?:test\/|golden\/|playwright\.config\.ts$|scripts\/(?:tier-r|golden[\w-]*)\.ts$|scripts\/golden\/)/;

/** FID-06 patterns over added lines. */
export const RISKY: { name: string; re: RegExp; only?: RegExp }[] = [
  { name: 'skip/only/fixme', re: /\b(?:test|it|describe)(?:\.\w+)*\.(?:skip|only|fixme|todo)\s*\(|\bxit\s*\(|\bfdescribe\s*\(/ },
  { name: 'snapshot update', re: /--update-snapshots|updateSnapshots|FOO_GOLDEN_BLESS\s*=\s*['"]?1/ },
  { name: 'mask', re: /\bmasks?\s*[:=]|"masks?"\s*:/, only: PICTURE_CODE },
  // FID-21 (CR-0031): docs/fidelity/coverage-gaps.json only shrinks; a new known gap needs a CR.
  { name: 'new coverage gap', re: /^\s*"(?:AT|ART|PERF|UX|BP)-[\w-]+"\s*:/, only: /^docs\/fidelity\/coverage-gaps\.json$/ },
  {
    name: 'threshold',
    re: /\b(?:threshold|maxDiffPixelRatio|maxDiffPixels|PIXEL_THRESHOLD|maxChangedShare|R[2-4]_LIMITS)\b/,
    only: PICTURE_CODE,
  },
];

/** Files allowed to spell the patterns (the guard and its tests). */
const SELF = new Set(['scripts/fid-guard.ts', 'test/fidelity/fid-guard.test.ts', 'test/fidelity/locked-checks.test.ts']);

export const PROTECTED = /^(spec|golden)\//;

/** FID-22 (CR-0031): the files that decide whether the checks run and what they accept. */
export const LOCKED = [
  'scripts/fid-guard.ts',
  'scripts/trace-check.ts',
  'scripts/coverage-check.ts',
  'scripts/spec-verify.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'OWNERS.yml',
  '.github/workflows/ci.yml',
  '.claude/settings.json',
  '.claude/hooks/locked-checks.mjs',
];
const TEST_FILE = /^test\/.*\.(?:test|spec)\.tsx?$/;
/** One test case: `it(`, `test(` and their `.each`/`.concurrent`… forms, not `describe` or `test.step`. */
const TEST_CASE = /(?:^|[^.\w])(?:it|test)(?:\.(?:each|concurrent|sequential|for|fails|only|skip|skipIf|runIf)\b(?:\([^)]*\))?)*\(\s*['"`]/;

/** FID-22: test cases removed minus added across the PR's test files (a moved test cancels out). */
export function testCasesLost(added: readonly Added[], removed: readonly Added[]): number {
  const count = (xs: readonly Added[]) => xs.filter((x) => TEST_FILE.test(x.file) && TEST_CASE.test(x.line)).length;
  return count(removed) - count(added);
}
const GOLDEN_APP = /^golden\/app\//;

export function citedCrs(text: string): string[] {
  return [...new Set(text.match(/\bCR-\d{4}\b/g) ?? [])].filter((id) => id !== 'CR-0000'); // CR-0000 is the template
}

export function citedReports(text: string): string[] {
  return [...text.matchAll(/^Fidelity-Report:\s*(\S+)/gm)].map((m) => m[1]!);
}

/** OWNERS.yml: one `pattern: owner` per line. Patterns ending in / own a folder, `*` matches within a path segment
 *  (`**` across segments), and a pattern without / matches the file name anywhere (gitignore style). */
export function parseOwners(yaml: string): string[] {
  return yaml
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((l) => l.match(/^(['"]?)(.+?)\1\s*:\s*\S+/)?.[2])
    .filter((p): p is string => !!p);
}

export function ownedBy(path: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return path.startsWith(pattern);
  const re = new RegExp(
    '^' +
      pattern
        .split('**')
        .map((part) => part.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '[^/]*'))
        .join('.*') +
      '$',
  );
  return pattern.includes('/') ? re.test(path) : re.test(path.split('/').pop()!) || re.test(path);
}

export function guard(input: GuardInput): string[] {
  const problems: string[] = [];
  const crs = citedCrs(input.text).filter((id) => input.crExists(id));
  const missing = citedCrs(input.text).filter((id) => !input.crExists(id));
  const reports = citedReports(input.text);
  for (const id of missing) problems.push(`cited ${id} has no file in docs/cr/`);

  const protectedFiles = input.files.filter((f) => PROTECTED.test(f));
  const needCr = protectedFiles.filter((f) => !(GOLDEN_APP.test(f) && reports.length));
  if (needCr.length && !crs.length)
    problems.push(`FID-02: ${needCr.join(', ')} changed without a CR (cite CR-nnnn in a commit or the PR body)`);

  const risky = input.added
    .filter((a) => !SELF.has(a.file))
    .flatMap((a) =>
      RISKY.filter((r) => (!r.only || r.only.test(a.file)) && r.re.test(a.line)).map((r) => `${a.file}: ${r.name}: ${a.line.trim()}`),
    );
  if (risky.length && !crs.length) problems.push(`FID-06: added without a CR:\n  ${risky.join('\n  ')}`);

  const locked = input.files.filter((f) => LOCKED.includes(f));
  if (locked.length && !crs.length) problems.push(`FID-22: locked check files changed without a CR: ${locked.join(', ')}`);
  const lost = testCasesLost(input.added, input.removed ?? []);
  if (lost > 0 && !crs.length) problems.push(`FID-22: ${lost} test case(s) removed without a CR (cite CR-nnnn saying why)`);

  for (const f of input.files) if (!input.owners.some((p) => ownedBy(f, p))) problems.push(`FID-19: ${f} has no owner in OWNERS.yml`);
  if (input.strict) for (const p of pendingCrs(input)) problems.push(`FID-02 (--strict): ${pendingLine(p)}`);
  return problems;
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Added lines per file from a zero-context diff. */
export function addedLines(patch: string): Added[] {
  return diffLines(patch, '+');
}

/** Removed lines per file (FID-22); a deleted file's lines are attributed to its old path. */
export function removedLines(patch: string): Added[] {
  return diffLines(patch, '-');
}

function diffLines(patch: string, sign: '+' | '-'): Added[] {
  const out: Added[] = [];
  let from = '';
  let file = '';
  let inHeader = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) inHeader = true;
    else if (inHeader && line.startsWith('--- ')) from = line.slice(4).replace(/^a\//, '');
    else if (inHeader && line.startsWith('+++ ')) {
      const to = line.slice(4).replace(/^b\//, '');
      file = sign === '-' || to === '/dev/null' ? from : to;
    } else if (line.startsWith('@@')) inHeader = false;
    // As before FID-22: a content line that starts with the sign three times is never counted.
    else if (!inHeader && line.startsWith(sign) && !line.startsWith(sign.repeat(3))) out.push({ file, line: line.slice(1) });
  }
  return out;
}

function main() {
  const { values } = parseArgs({
    options: { base: { type: 'string' }, head: { type: 'string' }, body: { type: 'string' }, strict: { type: 'boolean', default: false } },
  });
  let base = values.base;
  let head = values.head ?? 'HEAD';
  let body = values.body ?? '';
  if (!base) {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const event = eventPath ? (JSON.parse(readFileSync(eventPath, 'utf8')) as Record<string, unknown>) : null;
    const pr = event?.pull_request as { base: { sha: string }; head: { sha: string }; body: string | null } | undefined;
    if (!pr) {
      console.log('fid-guard: FID-02/06/19 run on pull_request events only; nothing to check');
      return;
    }
    base = pr.base.sha;
    head = pr.head.sha;
    body = pr.body ?? '';
  }
  const range = `${base}...${head}`;
  const files = git('diff', '--name-only', '--no-renames', range).split('\n').filter(Boolean);
  const patch = git('diff', '-U0', '--no-renames', '--no-color', range);
  const added = addedLines(patch);
  const removed = removedLines(patch);
  const messages = git('log', '--format=%B', `${base}..${head}`);
  const decisionsMd = join('spec', 'constitution', 'DECISIONS.md');
  const input: GuardInput = {
    files,
    added,
    removed,
    text: `${messages}\n${body}`,
    owners: parseOwners(readFileSync('OWNERS.yml', 'utf8')),
    crExists: (id) => crFile(id) !== null,
    crStatus: (id) => {
      const f = crFile(id);
      return f ? statusLine(readFileSync(f, 'utf8')) : null;
    },
    decisions: new Set(
      existsSync(decisionsMd) ? (readFileSync(decisionsMd, 'utf8').match(/^\| (X-\d+) \|/gm) ?? []).map((r) => r.slice(2, -2)) : [],
    ),
    strict: values.strict,
  };
  const pending = pendingCrs(input);
  if (pending.length && !values.strict)
    console.warn(
      `fid-guard: PENDING CRs (cited, not yet counted by FID-02; they await Vikas's review${values.strict ? '' : '; not failing without --strict'}):\n  ${pending.map(pendingLine).join('\n  ')}`,
    );
  const problems = guard(input);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `fid-guard: ${files.length} changed files checked (FID-02, FID-06, FID-19, FID-22)${pending.length ? `; ${pending.length} cited CR(s) PENDING` : ''}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
