// FID-02, FID-06, FID-19 (11-fidelity §11.1.3, §11.2.7, §11.7.1): the PR guard.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  addedLines,
  citedCrs,
  crPending,
  guard,
  ownedBy,
  parseOwners,
  pendingCrs,
  statusLine,
  type GuardInput,
} from '../../scripts/fid-guard';
import { crFile } from '../../scripts/golden-bless';

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
    // Masks and thresholds count only in picture-comparison code; app code and docs may use the word.
    expect(guard({ ...base, added: [{ file: 'src/renderer/messages/stickToBottom.ts', line: 'const threshold = 15;' }] })).toEqual([]);
    expect(guard({ ...base, added: [{ file: 'implementation-notes.md', line: 'threshold 15px' }] })).toEqual([]);
    expect(guard({ ...base, added: [{ file: 'scripts/tier-r.ts', line: 'threshold: 0.2' }] })).toHaveLength(1);
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
  it('FID-02 CR status: a cited CR not "Approved by Vikas" with a DECISIONS row is PENDING; only --strict fails (review D1)', () => {
    const status: Record<string, string> = {
      'CR-0001': 'Approved by Vikas (2026-10-18, "yes") · DECISIONS X-145',
      'CR-0003': "Approved under overnight instruction (Vikas, 2026-10-17 18:52Z: continue the overnight build, don't wait",
      'CR-0004': 'Approved by Vikas (2026-10-18) · DECISIONS X-999',
    };
    const input: GuardInput = {
      ...base,
      files: ['spec/trace.csv'],
      text: 'Fidelity-CR: CR-0001\nsee CR-0003 and CR-0004 and CR-0042',
      crExists: (id) => id in status,
      crStatus: (id) => status[id] ?? null,
      decisions: new Set(['X-145']),
    };
    expect(pendingCrs(input)).toEqual([
      { id: 'CR-0003', status: status['CR-0003'], reason: 'not "Approved by Vikas"' },
      { id: 'CR-0004', status: status['CR-0004'], reason: 'no DECISIONS row id that exists' },
    ]);
    // Without --strict the pending CRs warn only (CI keeps running while they await Vikas's review).
    expect(guard(input)).toEqual(['cited CR-0042 has no file in docs/cr/']);
    const strict = guard({ ...input, strict: true });
    expect(strict.filter((p) => p.startsWith('FID-02 (--strict)'))).toHaveLength(2);
    expect(strict.join('\n')).toContain('CR-0003: not "Approved by Vikas"');
    expect(guard({ ...input, text: 'Fidelity-CR: CR-0001', strict: true })).toEqual([]);
  });
  it('reads the Status line of a CR file in both written forms', () => {
    expect(statusLine('# CR-0007 · x\n\nStatus: Draft\nRaised by: me')).toBe('Draft');
    expect(statusLine('# CR-0003\n- **Asked by:** b\n- **Status:** Approved under overnight instruction\n  more')).toBe(
      'Approved under overnight instruction',
    );
    expect(statusLine('# no status')).toBeNull();
    expect(crPending('CR-0001', 'Approved', new Set(['X-1']))?.reason).toBe('not "Approved by Vikas"');
    expect(crPending('CR-0001', 'Approved by Vikas (X-1)', new Set(['X-1']))).toBeNull();
    // The real CR files on this branch: every one is listed, none silently counted.
    for (const id of ['CR-0003', 'CR-0004', 'CR-0005']) {
      const f = crFile(id)!;
      expect(crPending(id, statusLine(readFileSync(f, 'utf8')), new Set()), id).not.toBeNull();
    }
  });
  it('reads added lines per file from a -U0 diff', () => {
    const patch = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '-old', '+new', '+++not a header'].join('\n');
    expect(addedLines(patch)).toEqual([{ file: 'x.ts', line: 'new' }]);
  });
});
