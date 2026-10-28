// Spec: project testing rule §4–10 (Vikas 2026-10-21); 11-fidelity §11.1.3 FID-02, §11.2.7 FID-06; release gate, Grok
// practice 3 (lock tests while fixing). Claude Code PreToolUse hook, two locks:
//  1. The check files below never change unless a CR on this branch (committed since origin/main, or not committed yet)
//     names the path. fid-guard in CI is the lock that counts; this stops the agent before it tries.
//  2. Fix mode: while .claude/fix.lock exists (a bug fix is under way; the file names the bug), no test, journey or golden
//     file may be edited, written, deleted or moved, and the lock file itself stays. Fix the app, not the test.
// Ported from PR #101 (CR-0031, never merged), cut down to the files main has.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const LOCKED = [
  'scripts/fid-guard.ts',
  'scripts/trace-check.ts',
  'scripts/spec-verify.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'OWNERS.yml',
  '.github/workflows/ci.yml',
  '.claude/settings.json',
  '.claude/hooks/locked-checks.mjs',
];
export const FIX_LOCK = '.claude/fix.lock';
/** What fix mode locks: every test, the real-PC journeys, the golden pictures, the mutation floor. */
const TEST_PATH = /^(?:test\/|golden\/|stryker\.config\.json$)/;
const TEST_FILE = /^test\/\S*\.(?:test|spec)\.tsx?$/;
/** What a delete or move may not touch without a CR: a test file, the golden pictures, or a folder that holds tests. */
const removesChecks = (p) =>
  TEST_FILE.test(p) || /^(?:test|golden)$/.test(p) || p.startsWith('golden/') || (p.startsWith('test/') && !/\.[^/]+$/.test(p));
const DELETE_VERBS = ['rm', 'unlink', 'mv'];
/** The files a shell command part writes in place: redirect targets, tee and truncate arguments, sed -i / perl -i files, cp's target. */
function shellWrites(part) {
  const out = [...part.matchAll(/>{1,2}\s*(\S+)/g)].map((m) => m[1]);
  const words = part.trim().split(/\s+/);
  const args = (from) => words.slice(from).filter((w) => !w.startsWith('-') && !w.startsWith('>'));
  if (words[0] === 'tee' || words[0] === 'truncate') out.push(...args(1));
  if ((words[0] === 'sed' || words[0] === 'perl') && words.some((w) => /^-\w*i/.test(w))) out.push(...args(1).slice(1));
  if (words[0] === 'cp' && args(1).length > 1) out.push(args(1).at(-1));
  if (words[0] === 'git' && (words[1] === 'checkout' || words[1] === 'restore')) out.push(...args(2));
  return out;
}

const norm = (root, w) => {
  const raw = w
    .replace(/^['"]|['"]$/g, '')
    .split('\\')
    .join('/');
  const rel = raw.startsWith('/') || /^[A-Za-z]:\//.test(raw) ? relative(root, raw).split('\\').join('/') : raw.replace(/^\.\//, '');
  return rel.replace(/\/+$/, '');
};

/**
 * The verdict for one tool call: null to allow, or why it is blocked. `crText` = the text of the branch's CRs;
 * `fixing` = the bug named in .claude/fix.lock, or null when no fix is under way.
 */
export function verdict(tool, input, root, crText, fixing = null) {
  const named = (p) => crText.includes(p);
  const fixLocked = (p) => fixing !== null && (TEST_PATH.test(p) || /^(?:test|golden)$/.test(p) || p === FIX_LOCK);
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const file = input.file_path ?? input.notebook_path;
    if (!file) return null;
    const rel = norm(root, file);
    if (LOCKED.includes(rel) && !named(rel)) return `${rel} is a locked check file.`;
    if (fixLocked(rel)) return `tests are locked while you fix ${fixing}; ${rel} stays as it is.`;
    return null;
  }
  if (tool === 'Bash') {
    // Only the arguments of a delete or move verb count: `rm -rf dist && vitest run test/a.test.ts` deletes no test.
    const hits = [];
    const fixHits = [];
    for (const part of String(input.command ?? '').split(/&&|\|\||[;|\n]/)) {
      const words = part.trim().split(/\s+/);
      const at = words[0] === 'git' && (words[1] === 'rm' || words[1] === 'mv') ? 2 : DELETE_VERBS.includes(words[0]) ? 1 : -1;
      if (at >= 0) {
        for (const w of words.slice(at)) {
          const rel = norm(root, w);
          if (LOCKED.includes(rel) || removesChecks(rel)) hits.push(rel);
          if (fixLocked(rel)) fixHits.push(rel);
        }
      } else if (fixing !== null) {
        for (const w of shellWrites(part)) {
          const rel = norm(root, w);
          if (fixLocked(rel)) fixHits.push(rel);
        }
      }
    }
    const blocked = hits.filter((p) => !named(p));
    if (blocked.length) return `deleting or moving ${blocked.join(', ')} removes a check.`;
    if (fixHits.length) return `tests are locked while you fix ${fixing}; ${[...new Set(fixHits)].join(', ')} stays as it is.`;
  }
  return null;
}

function branchCrText(root) {
  const git = (...a) => {
    try {
      return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return '';
    }
  };
  const files = new Set(
    [
      ...git('diff', '--name-only', 'origin/main...HEAD', '--', 'docs/cr').split('\n'),
      ...git('status', '--porcelain', '--', 'docs/cr')
        .split('\n')
        .map((l) => l.slice(3)),
    ]
      .map((f) => f.trim())
      .filter((f) => /^docs\/cr\/CR-\d{4}.*\.md$/.test(f)),
  );
  return [...files].map((f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '')).join('\n');
}

/** The bug named in .claude/fix.lock, or null. */
export function fixingBug(root) {
  const p = join(root, FIX_LOCK);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').trim().split('\n')[0] || 'a bug';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop())) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    const ev = JSON.parse(raw || '{}');
    const root = process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd();
    const fixing = fixingBug(root);
    const why = verdict(ev.tool_name, ev.tool_input ?? {}, root, '', fixing);
    if (!why) return;
    const still = verdict(ev.tool_name, ev.tool_input ?? {}, root, branchCrText(root), fixing);
    if (!still) return;
    const how = still.startsWith('tests are locked')
      ? 'Fix the app so the test passes. If the test itself is wrong, stop and tell the lead; only the lead removes .claude/fix.lock.'
      : 'Write the CR first (docs/cr/CR-nnnn-*.md naming this path), or leave the check as it is.';
    process.stderr.write(`${still} ${how}\n`);
    process.exit(2);
  });
}
