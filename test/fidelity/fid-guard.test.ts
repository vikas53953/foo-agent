// FID-02, FID-06, FID-19 (11-fidelity §11.1.3, §11.2.7, §11.7.1): the PR guard.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addedLines, citedCrs, guard, ownedBy, parseOwners, type GuardInput } from '../../scripts/fid-guard';

const owners = parseOwners(readFileSync('OWNERS.yml', 'utf8'));
const base: GuardInput = { files: [], added: [], text: '', owners, crExists: (id) => id === 'CR-0001' };

describe('fid-guard', () => {
  it('reads OWNERS.yml', () => expect(owners).toEqual(['spec/', 'design/tokens.json', '*']));
  it('FID-02: spec/** or golden/** without a CR fails, with an existing CR passes', () => {
    expect(guard({ ...base, files: ['spec/trace.csv'] })[0]).toMatch(/^FID-02/);
    expect(guard({ ...base, files: ['golden/manifest.json'], text: 'Fidelity-CR: CR-0001' })).toEqual([]);
    expect(guard({ ...base, files: ['golden/manifest.json'], text: 'see CR-0042' })).toEqual([
      'cited CR-0042 has no file in docs/cr/',
      expect.stringMatching(/^FID-02/),
    ]);
    expect(guard({ ...base, files: ['src/main/index.ts'] })).toEqual([]);
  });
  it('the CR template id never counts', () => expect(citedCrs('CR-0000 and CR-0001')).toEqual(['CR-0001']));
  it('golden/app baselines may cite a fidelity report instead', () => {
    expect(guard({ ...base, files: ['golden/app/UX-08-01.light.png'], text: 'Fidelity-Report: M2-r1' })).toEqual([]);
    expect(guard({ ...base, files: ['golden/manifest.json'], text: 'Fidelity-Report: M2-r1' })[0]).toMatch(/^FID-02/);
  });
  it('FID-06: new skip/only, snapshot update, mask or threshold needs a CR', () => {
    const lines = [
      "  test.skip(true, 'later');",
      '  it.only("x", () => {});',
      '  test.describe.fixme("y", () => {});',
      'pnpm playwright test --update-snapshots',
      '  await expect(page).toHaveScreenshot({ mask: [page.locator("x")] });',
      '  maxDiffPixelRatio: 0.01,',
    ];
    const added = lines.map((line) => ({ file: 'test/e2e/x.spec.ts', line }));
    const problems = guard({ ...base, added });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.split('\n')).toHaveLength(lines.length + 1);
    expect(guard({ ...base, added, text: 'Fidelity-CR: CR-0001' })).toEqual([]);
    expect(guard({ ...base, added: [{ file: 'scripts/fid-guard.ts', line: 'threshold' }] })).toEqual([]);
    expect(guard({ ...base, added: [{ file: 'src/a.ts', line: 'const skipped = items.skip;' }] })).toEqual([]);
  });
  it('FID-19: every path needs an owner', () => {
    expect(ownedBy('spec/x/y.md', 'spec/')).toBe(true);
    expect(ownedBy('design/tokens.json', 'design/tokens.json')).toBe(true);
    expect(ownedBy('design/other.json', 'design/tokens.json')).toBe(false);
    expect(ownedBy('a/b/c.ts', '*.ts')).toBe(true);
    expect(ownedBy('a/b/c.ts', 'a/*.ts')).toBe(false);
    expect(ownedBy('a/b/c.ts', 'a/**')).toBe(true);
    expect(guard({ ...base, files: ['x/y.md'], owners: ['spec/'] })).toEqual(['FID-19: x/y.md has no owner in OWNERS.yml']);
  });
  it('reads added lines per file from a -U0 diff', () => {
    const patch = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '-old', '+new', '+++not a header'].join('\n');
    expect(addedLines(patch)).toEqual([{ file: 'x.ts', line: 'new' }]);
  });
});
