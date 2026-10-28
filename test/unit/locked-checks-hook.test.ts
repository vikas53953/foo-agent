// Spec: project testing rule §4–10 (Vikas 2026-10-21); release gate, Grok practice 3 (lock tests while fixing). The Claude
// Code hook in .claude/hooks/locked-checks.mjs: check files need a branch CR; while .claude/fix.lock exists no test moves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Hook = {
  LOCKED: string[];
  FIX_LOCK: string;
  verdict: (tool: string, input: Record<string, string>, root: string, crText: string, fixing?: string | null) => string | null;
};
const load = async () => (await import('../../.claude/hooks/locked-checks.mjs' as string)) as Hook;
const root = '/repo';

describe('locked-checks hook', () => {
  it('is wired as a PreToolUse hook for edits, writes and shell commands', () => {
    const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
    const entry = settings.hooks.PreToolUse[0];
    expect(entry.matcher).toBe('Edit|Write|MultiEdit|NotebookEdit|Bash');
    expect(entry.hooks[0].command).toContain('.claude/hooks/locked-checks.mjs');
  });

  it('a locked check file changes only when a branch CR names it; test files are free outside fix mode', async () => {
    const hook = await load();
    expect(hook.verdict('Edit', { file_path: '/repo/scripts/fid-guard.ts' }, root, '')).toMatch(/locked check file/);
    expect(hook.verdict('Edit', { file_path: '/repo/scripts/fid-guard.ts' }, root, 'Change: scripts/fid-guard.ts')).toBeNull();
    expect(hook.verdict('Write', { file_path: '/repo/test/unit/a.test.ts' }, root, '')).toBeNull();
    expect(hook.verdict('Bash', { command: 'mv vitest.config.ts x.ts' }, root, '')).toMatch(/vitest\.config\.ts/);
  });

  it('deleting a test needs a CR; deleting other things or running tests does not', async () => {
    const hook = await load();
    expect(hook.verdict('Bash', { command: 'git rm test/unit/a.test.ts' }, root, '')).toMatch(/test\/unit\/a\.test\.ts/);
    expect(hook.verdict('Bash', { command: 'rm /repo/test/unit/a.test.ts' }, root, 'CR names test/unit/a.test.ts')).toBeNull();
    expect(hook.verdict('Bash', { command: 'rm -rf dist && pnpm exec vitest run test/unit/a.test.ts' }, root, '')).toBeNull();
  });

  it('fix mode locks every test, journey and golden file, and the lock file itself', async () => {
    const hook = await load();
    const fix = (tool: string, input: Record<string, string>) => hook.verdict(tool, input, root, '', 'F30');
    expect(fix('Edit', { file_path: '/repo/test/e2e/chat.spec.ts' })).toMatch(/locked while you fix F30/);
    expect(fix('Write', { file_path: '/repo/test/real-pc/journeys/B1-batch1.json' })).toMatch(/B1-batch1\.json/);
    expect(fix('Edit', { file_path: '/repo/golden/app/chat.png' })).toMatch(/F30/);
    expect(fix('Bash', { command: "sed -i 's/ok/fine/' test/real-pc/gate/G1-first-run.json" })).toMatch(/G1-first-run/);
    expect(fix('Bash', { command: 'echo {} > test/real-pc/journeys/B1-batch1.json' })).toMatch(/B1-batch1/);
    expect(fix('Bash', { command: `rm ${hook.FIX_LOCK}` })).toMatch(/fix\.lock/);
    expect(fix('Edit', { file_path: `/repo/${hook.FIX_LOCK}` })).toMatch(/fix\.lock/);
  });

  it('fix mode leaves the app code and reading or running tests alone', async () => {
    const hook = await load();
    const fix = (tool: string, input: Record<string, string>) => hook.verdict(tool, input, root, '', 'F30');
    expect(fix('Edit', { file_path: '/repo/src/engine/chat/ChatLane.ts' })).toBeNull();
    expect(fix('Bash', { command: 'pnpm exec vitest run test/unit/a.test.ts' })).toBeNull();
    expect(fix('Bash', { command: 'cat test/unit/a.test.ts | head -20' })).toBeNull();
    expect(fix('Bash', { command: 'node test/real-pc/foo-drive.js test/real-pc/journeys/B1-batch1.json > out.log' })).toBeNull();
  });
});
