// Spec: docs/build-method.md (the lead merges each reviewed ticket PR into the milestone branch with a merge commit),
// 11-fidelity §11.1.2 FID-01 (SPEC-MANIFEST.json is generated, never hand-merged), §11.5.3 FID-18. Merges a ticket into
// the current branch with --no-ff, resolves the row files every ticket touches (trace.csv, decision logs, copy-pending
// lists) and regenerates the spec manifest, then runs the trace and copy checks. It stops, with the merge left in
// progress, only on conflicts in other files. It never pushes.
// Usage: tsx scripts/merge-ticket.ts <ticket-sha> [--cr CR-nnnn] [--no-commit]
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCopy } from './check-copy';
import { mergeLines, mergePending, mergeTrace, type RowMerge } from './merge-rows';
import { writeManifest } from './spec-verify';
import { checkRepo } from './trace-check';

const MANIFEST = 'spec/SPEC-MANIFEST.json';

/** Which three-way row merge resolves a conflicted path; undefined means a person resolves it. */
export function resolverFor(path: string): ((b: string, o: string, t: string) => RowMerge) | undefined {
  if (path === 'spec/trace.csv') return mergeTrace;
  if (/^docs\/decisions\/[^/]+\.tsv$/.test(path)) return mergeLines;
  if (path === 'scripts/copy-pending.json' || /^scripts\/copy-pending\/[^/]+\.json$/.test(path)) return mergePending;
  return undefined;
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });

const merging = () => existsSync(git('rev-parse', '--git-path', 'MERGE_HEAD').trim());

function stage(n: 1 | 2 | 3, path: string, empty: string): string {
  try {
    return git('show', `:${n}:${path}`);
  } catch {
    return empty; // added on both sides: no common base
  }
}

function main(argv: string[]): number {
  const ref = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--cr');
  const cr = argv.includes('--cr') ? argv[argv.indexOf('--cr') + 1] : 'none';
  if (!ref) {
    console.error('usage: tsx scripts/merge-ticket.ts <ticket-sha> [--cr CR-nnnn] [--no-commit]');
    return 2;
  }
  if (merging()) {
    console.error('A merge is already in progress. Finish it (git commit) or abort it (git merge --abort) first.');
    return 2;
  }
  if (git('status', '--porcelain', '--untracked-files=no').trim()) {
    console.error('The working tree has uncommitted changes. Commit them first (never git stash in a merge).');
    return 2;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  try {
    git('merge', '--no-ff', '--no-commit', ref);
  } catch {
    // conflicts are handled below
  }
  if (!merging()) {
    console.error(`Nothing to merge: ${ref} is already in ${branch}.`);
    return 0;
  }

  const conflicted = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
  const left: string[] = [];
  const notes: string[] = [];
  for (const path of conflicted) {
    if (path === MANIFEST) continue; // regenerated below
    const resolve = resolverFor(path);
    if (!resolve) {
      left.push(path);
      continue;
    }
    const empty = path.endsWith('.json') ? '{"keys":{}}' : '';
    const merged = resolve(stage(1, path, empty), stage(2, path, empty), stage(3, path, empty));
    writeFileSync(path, merged.text);
    git('add', path);
    notes.push(`resolved ${path}${merged.conflicts.length ? ` (check: ${merged.conflicts.join('; ')})` : ''}`);
    left.push(...merged.conflicts.map((c) => `${path}: ${c}`));
  }
  const specChanged = git('diff', '--cached', '--name-only', 'HEAD', '--', 'spec/')
    .split('\n')
    .filter((p) => p && p !== MANIFEST);
  if (conflicted.includes(MANIFEST) || specChanged.length) {
    writeManifest();
    git('add', MANIFEST);
    notes.push(`regenerated ${MANIFEST} (spec files changed by the ticket: ${specChanged.join(', ') || 'none'})`);
  }
  for (const n of notes) console.log(n);
  if (left.length) {
    console.error(`\nResolve these by hand, git add them, then git commit --no-edit (or git merge --abort):\n${left.join('\n')}`);
    return 1;
  }
  const problems = [...checkRepo(), ...checkCopy()];
  if (problems.length) {
    console.error(`\nThe merge is staged but the trace or copy check fails; fix, git add, then commit:\n${problems.join('\n')}`);
    return 1;
  }
  if (argv.includes('--no-commit')) {
    console.log('\nMerge staged, checks pass; commit when ready.');
    return 0;
  }
  const sha = git('rev-parse', '--short', ref).trim();
  git('commit', '-m', `Merge ticket ${sha} into ${branch}\n\nFidelity-CR: ${cr}`);
  console.log(`\nMerged ${sha} into ${branch} with a merge commit. Push it, then update the ticket's Status.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
