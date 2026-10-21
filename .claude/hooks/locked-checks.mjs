// Spec: 11-fidelity FID-22 (X-189, CR-0031): Claude Code PreToolUse hook. A coding agent may not edit a locked check file,
// or delete or move a test file, unless a CR on this branch (committed since origin/main, or not committed yet) names that
// path. CI's fid-guard is the lock that counts; this stops the agent before it tries. LOCKED must equal scripts/fid-guard.ts
// LOCKED (test/fidelity/locked-checks.test.ts).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
const TEST_FILE = /(?:^|[\s'"/])test\/\S*\.(?:test|spec)\.tsx?\b/;
const DELETE = /(?:^|[\s;&|(])(?:rm|unlink|git\s+rm|git\s+mv|mv)\s/;

/** The verdict for one tool call: null to allow, or why it is blocked. `crText` = the text of the branch's CRs. */
export function verdict(tool, input, root, crText) {
  const named = (p) => crText.includes(p);
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const file = input.file_path ?? input.notebook_path;
    if (!file) return null;
    const rel = relative(root, file).split('\\').join('/');
    if (LOCKED.includes(rel) && !named(rel)) return `${rel} is a locked check file (FID-22).`;
    return null;
  }
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '');
    if (!DELETE.test(cmd)) return null;
    const hits = [
      ...LOCKED.filter((p) => cmd.includes(p)),
      ...(cmd.match(new RegExp(TEST_FILE, 'g')) ?? []).map((m) => m.trim().replace(/^['"]/, '')),
    ];
    const blocked = hits.filter((p) => !named(p));
    if (blocked.length) return `deleting or moving ${blocked.join(', ')} removes a check (FID-22).`;
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop())) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    const ev = JSON.parse(raw || '{}');
    const root = process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd();
    const why = verdict(ev.tool_name, ev.tool_input ?? {}, root, '');
    if (!why) return;
    if (!verdict(ev.tool_name, ev.tool_input ?? {}, root, branchCrText(root))) return;
    process.stderr.write(`${why} Write the CR first (docs/cr/CR-nnnn-*.md naming this path), or leave the check as it is.\n`);
    process.exit(2);
  });
}
