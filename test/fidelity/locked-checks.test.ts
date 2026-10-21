// FID-22 (11-fidelity §11.7.1, X-189, CR-0031): a PR that changes a check file or removes more test cases than it adds
// needs a CR; FID-06 also refuses a new coverage gap without one (FID-21's list only shrinks).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addedLines, guard, LOCKED, parseOwners, removedLines, testCasesLost, type GuardInput } from '../../scripts/fid-guard';

const owners = parseOwners(readFileSync('OWNERS.yml', 'utf8'));
const base: GuardInput = { files: [], added: [], removed: [], text: '', owners, crExists: (id) => id === 'CR-0031' };
const at = (file: string, ...lines: string[]) => lines.map((line) => ({ file, line }));

const PATCH = [
  'diff --git a/test/unit/old.test.ts b/test/unit/old.test.ts',
  'deleted file mode 100644',
  '--- a/test/unit/old.test.ts',
  '+++ /dev/null',
  '@@ -1,3 +0,0 @@',
  "-it('one', () => {});",
  '---- not a header: a removed line that starts with two dashes',
  "-test.each([1, 2])('two %s', () => {});",
  'diff --git a/test/unit/new.test.ts b/test/unit/new.test.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/test/unit/new.test.ts',
  '@@ -0,0 +1,2 @@',
  "+it('one', () => {});",
  '+++counter;',
].join('\n');

describe('FID-22 locked checks', () => {
  it('reads removed lines of a deleted file under its old path; a content line is never taken for a header', () => {
    expect(removedLines(PATCH)).toEqual(at('test/unit/old.test.ts', "it('one', () => {});", "test.each([1, 2])('two %s', () => {});"));
    expect(addedLines(PATCH)).toEqual(at('test/unit/new.test.ts', "it('one', () => {});"));
  });

  it('counts test cases lost across files: a moved test cancels out, describe and test.step do not count', () => {
    expect(testCasesLost(addedLines(PATCH), removedLines(PATCH))).toBe(1);
    expect(testCasesLost(at('test/a.test.ts', "it('x', () => {})"), at('test/b.test.ts', "it('x', () => {})"))).toBe(0);
    expect(testCasesLost([], at('test/a.test.ts', "describe('x', () => {", "  await test.step('y', async () => {"))).toBe(0);
    expect(testCasesLost([], at('src/a.test.ts', "it('x', () => {})"))).toBe(0);
    expect(testCasesLost([], at('test/e2e/a.spec.ts', "  test('opens the app', async () => {"))).toBe(1);
  });

  it('a PR that removes test cases needs a CR; with one cited it passes', () => {
    const removed = at('test/e2e/a.spec.ts', "  test('opens the app', async () => {");
    expect(guard({ ...base, removed })).toEqual(['FID-22: 1 test case(s) removed without a CR (cite CR-nnnn saying why)']);
    expect(guard({ ...base, removed, text: 'Fidelity-CR: CR-0031' })).toEqual([]);
  });

  it('a change to a locked check file needs a CR', () => {
    expect(LOCKED).toContain('scripts/fid-guard.ts');
    expect(guard({ ...base, files: ['.github/workflows/ci.yml'] })).toEqual([
      'FID-22: locked check files changed without a CR: .github/workflows/ci.yml',
    ]);
    expect(guard({ ...base, files: ['.github/workflows/ci.yml'], text: 'CR-0031' })).toEqual([]);
    expect(guard({ ...base, files: ['.github/workflows/real-ai-e2e.yml'] })).toEqual([]);
  });

  it('FID-06: a new id in coverage-gaps.json needs a CR; removing one does not', () => {
    const added = at('docs/fidelity/coverage-gaps.json', '    "UX-14-05": "M9: pending",');
    expect(guard({ ...base, added })[0]).toMatch(/^FID-06: added without a CR:\n {2}docs\/fidelity\/coverage-gaps\.json: new coverage gap/);
    expect(guard({ ...base, removed: added })).toEqual([]);
  });

  it('the Claude Code hook blocks editing a locked file or deleting a test unless a branch CR names the path', async () => {
    type Hook = { LOCKED: string[]; verdict: (tool: string, input: Record<string, string>, root: string, crText: string) => string | null };
    const hook = (await import('../../.claude/hooks/locked-checks.mjs' as string)) as Hook;
    expect(hook.LOCKED).toEqual(LOCKED);
    const root = '/repo';
    expect(hook.verdict('Edit', { file_path: '/repo/scripts/fid-guard.ts' }, root, '')).toMatch(/locked check file/);
    expect(hook.verdict('Edit', { file_path: '/repo/scripts/fid-guard.ts' }, root, 'Change: scripts/fid-guard.ts')).toBeNull();
    expect(hook.verdict('Write', { file_path: '/repo/test/unit/a.test.ts' }, root, '')).toBeNull();
    expect(hook.verdict('Bash', { command: 'git rm test/unit/a.test.ts' }, root, '')).toMatch(/test\/unit\/a\.test\.ts/);
    expect(hook.verdict('Bash', { command: 'rm -rf node_modules && pnpm test' }, root, '')).toBeNull();
    expect(hook.verdict('Bash', { command: 'pnpm exec vitest run test/unit/a.test.ts' }, root, '')).toBeNull();
  });
});
