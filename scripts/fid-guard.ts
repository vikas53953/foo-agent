// Spec: 11-fidelity §11.1.3 FID-02 (spec/** and golden/** change only with a CR), §11.2.7 FID-06 (no snapshot update,
// skip, only, mask or threshold change without a CR), §11.7.1 FID-19 (every changed path has an owner in OWNERS.yml);
// foo-plan §1 rule 8. Runs on pull_request events (GITHUB_EVENT_PATH); a CR is cited as CR-nnnn in a commit message of the
// PR or in the PR body, and must exist as docs/cr/CR-nnnn*.md. golden/app/** baselines may instead cite
// "Fidelity-Report: <id>" (written by golden-bless).
// Usage: tsx scripts/fid-guard.ts            (in CI, pull_request events)
//        tsx scripts/fid-guard.ts --base <ref> [--head <ref>] [--body <text>]   (locally)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  /** Commit messages of the PR plus its body. */
  text: string;
  owners: string[];
  crExists: (id: string) => boolean;
}

/** FID-06 patterns over added lines. */
export const RISKY: { name: string; re: RegExp }[] = [
  { name: 'skip/only/fixme', re: /\b(?:test|it|describe)(?:\.\w+)*\.(?:skip|only|fixme|todo)\s*\(|\bxit\s*\(|\bfdescribe\s*\(/ },
  { name: 'snapshot update', re: /--update-snapshots|updateSnapshots|FOO_GOLDEN_BLESS\s*=\s*['"]?1/ },
  { name: 'mask', re: /\bmasks?\s*[:=]|"masks?"\s*:/ },
  { name: 'threshold', re: /\b(?:threshold|maxDiffPixelRatio|maxDiffPixels|PIXEL_THRESHOLD|maxChangedShare|R[2-4]_LIMITS)\b/ },
];

/** Files allowed to spell the patterns (the guard and its tests). */
const SELF = new Set(['scripts/fid-guard.ts', 'test/fidelity/fid-guard.test.ts']);

export const PROTECTED = /^(spec|golden)\//;
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
    .flatMap((a) => RISKY.filter((r) => r.re.test(a.line)).map((r) => `${a.file}: ${r.name}: ${a.line.trim()}`));
  if (risky.length && !crs.length) problems.push(`FID-06: added without a CR:\n  ${risky.join('\n  ')}`);

  for (const f of input.files) if (!input.owners.some((p) => ownedBy(f, p))) problems.push(`FID-19: ${f} has no owner in OWNERS.yml`);
  return problems;
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Added lines per file from a zero-context diff. */
export function addedLines(patch: string): Added[] {
  const out: Added[] = [];
  let file = '';
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('+') && !line.startsWith('+++')) out.push({ file, line: line.slice(1) });
  }
  return out;
}

function main() {
  const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' }, body: { type: 'string' } } });
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
  const added = addedLines(git('diff', '-U0', '--no-renames', '--no-color', range));
  const messages = git('log', '--format=%B', `${base}..${head}`);
  const problems = guard({
    files,
    added,
    text: `${messages}\n${body}`,
    owners: parseOwners(readFileSync('OWNERS.yml', 'utf8')),
    crExists: (id) => crFile(id) !== null,
  });
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`fid-guard: ${files.length} changed files checked (FID-02, FID-06, FID-19)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
