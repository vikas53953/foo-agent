// 11-fidelity §11.6.2: the fidelity report reads Vitest/Playwright JSON, resolves audit rows against fresh evidence and
// never reports a missing input as passing.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, evidenceStatus, html, playwrightCases, readFid14, resolveAudit, vitestCases } from '../../scripts/fidelity-report';

const vitest = {
  testResults: [
    {
      name: `${process.cwd()}/test/fidelity/spec.test.ts`,
      assertionResults: [
        { fullName: 'fidelity guards FID-01 spec/ is unchanged', status: 'passed' },
        { fullName: 'ART-02a banned words none', status: 'failed' },
      ],
    },
  ],
};
const e2e = {
  suites: [
    {
      title: 'm0-window.spec.ts',
      file: 'm0-window.spec.ts',
      specs: [
        { title: 'cold start (PERF-01 smoke)', tests: [{ status: 'expected' }] },
        { title: 'live switch', tests: [{ status: 'skipped' }] },
      ],
    },
  ],
};
const base = {
  milestone: 'M1',
  vitest,
  e2e,
  refsDir: 'does-not-exist',
  tierRDir: 'does-not-exist',
  runner: { pinned: null },
  fid14: [{ id: 'SV-16', ok: true, expected: 'height 32', measured: '1280×32' }],
  eslint: [{ errorCount: 0 }],
  audit: { rows: [{ group: 'g', item: 'FID-01', status: 'UNVERIFIABLE' as const, evidence: 'test:FID-01', covers: 'whole' as const }] },
  env: { GITHUB_RUN_ID: '42', GITHUB_SHA: 'abcdef0123456789', GITHUB_REPOSITORY: 'o/r' },
};

describe('fidelity report', () => {
  it('reads Vitest and Playwright JSON', () => {
    expect(vitestCases(vitest).map((c) => [c.file, c.status])).toEqual([
      ['test/fidelity/spec.test.ts', 'passed'],
      ['test/fidelity/spec.test.ts', 'failed'],
    ]);
    expect(playwrightCases(e2e).map((c) => [c.file, c.title, c.status])).toEqual([
      ['test/e2e/m0-window.spec.ts', 'cold start (PERF-01 smoke)', 'passed'],
      ['test/e2e/m0-window.spec.ts', 'live switch', 'skipped'],
    ]);
  });
  it('resolves evidence: passing → DONE, failing → NOT DONE, absent → null (UNVERIFIABLE)', () => {
    const cases = [...vitestCases(vitest), ...playwrightCases(e2e)];
    expect(evidenceStatus(cases, 'FID-01')).toBe('DONE');
    expect(evidenceStatus(cases, 'ART-02a')).toBe('NOT DONE');
    expect(evidenceStatus(cases, 'live switch')).toBeNull();
  });
  it('fails on a failed test, names the CI run, lists the M1 refs as not built', () => {
    const r = build(base);
    expect(r.verdict).toBe('FAIL');
    expect(r.verdictReasons[0]).toBe('1 test(s) failed');
    expect(r.ci.runUrl).toBe('https://github.com/o/r/actions/runs/42');
    expect(r.reportId).toBe('M1-abcdef0-42');
    expect(r.audit[0]!.resolved).toBe('DONE');
    expect(r.golden.counts.notBuilt).toBe(20);
    expect(r.fid04).toBe('UNVERIFIABLE');
    expect(r.behaviour.ids).toContainEqual({ id: 'PERF-01', status: 'passed', file: 'test/e2e/m0-window.spec.ts' });
  });
  it('names files from the Playwright test folder and lists the M2 refs, with the UX steps M2 tests first', () => {
    const run = {
      suites: [
        { title: 'e2e/m2-composer.spec.ts', file: 'e2e/m2-composer.spec.ts', specs: [{ title: 'a', tests: [{ status: 'expected' }] }] },
        {
          title: 'fidelity/ux/UX-08.chat.spec.ts',
          file: 'fidelity/ux/UX-08.chat.spec.ts',
          specs: [{ title: 'b', tests: [{ status: 'expected' }] }],
        },
      ],
    };
    expect(playwrightCases(run).map((c) => c.file)).toEqual(['test/e2e/m2-composer.spec.ts', 'test/fidelity/ux/UX-08.chat.spec.ts']);
    const r = build({ ...base, milestone: 'M2', audit: null });
    // 11 drawn M2 Blueprint refs + UX-08 (7) + the two UX-09 steps M2 tests first (CR-0003).
    expect(r.golden.counts.notBuilt).toBe(20);
    expect(r.golden.notBuilt).toEqual(expect.arrayContaining(['BP-COMP-09', 'UX-08-07', 'UX-09-01', 'UX-09-08']));
    expect(r.golden.notBuilt).not.toContain('BP-COMP-03');
  });
  it('merges the spec-value results of every E2E file in a folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fid14-'));
    writeFileSync(join(dir, 'fid-14.json'), JSON.stringify([{ id: 'SV-16', ok: true, expected: '', measured: '' }]));
    writeFileSync(join(dir, 'fid-14-m2-composer.json'), JSON.stringify([{ id: 'SV-10', ok: false, expected: '', measured: '' }]));
    writeFileSync(join(dir, 'other.json'), '[]');
    expect(readFid14(dir)!.map((x) => x.id)).toEqual(['SV-10', 'SV-16']); // name order
    expect(readFid14(join(dir, 'fid-14.json'))!.map((x) => x.id)).toEqual(['SV-16']);
    expect(readFid14(join(dir, 'missing'))).toBeNull();
    expect(readFid14(mkdtempSync(join(tmpdir(), 'fid14-empty-')))).toBeNull();
  });
  it('missing inputs are evidence gaps, not passes', () => {
    const r = build({ ...base, vitest: null, e2e: null, fid14: null, runner: null });
    expect(r.missingInputs).toHaveLength(4);
    expect(r.verdict).toBe('FAIL');
  });
  it('renders a self-contained page with the For Vikas box first and both themes', () => {
    const page = html(build(base));
    expect(page.indexOf('For Vikas')).toBeLessThan(page.indexOf('1 · Header'));
    for (const h of [
      '2 · Plan vs built audit',
      '3 · Golden summary',
      '4 · Copy',
      '5 · Tokens and values',
      '6 · Behaviour',
      '7 · Gaps and CRs',
      '8 · Deviations found by reading',
    ])
      expect(page).toContain(h);
    expect(page).toContain('prefers-color-scheme: dark');
    expect(page).not.toMatch(/<(script|link)[^>]+(src|href)="http/);
  });

  it('an audit row is DONE only when its evidence covers the whole item (§11.6.1, review D7)', () => {
    const pass = (n: string) => (n.includes('fail') ? 'NOT DONE' : n.includes('none') ? null : 'DONE');
    const row = { group: 'M2 Must pass', item: '10-2 §C.3 rows', status: 'UNVERIFIABLE' as const };
    // One loosely related passing test: PARTIAL, never DONE.
    expect(resolveAudit({ ...row, evidence: 'test:Enter sends' }, pass)).toBe('PARTIAL');
    expect(resolveAudit({ ...row, evidence: 'test:Enter sends', covers: 'part', manual: '225 %' }, pass)).toBe('PARTIAL');
    expect(resolveAudit({ ...row, evidence: 'test:AT-007', covers: 'whole' }, pass)).toBe('DONE');
    // Every needle counts: one failing → NOT DONE; one without a result → UNVERIFIABLE.
    expect(resolveAudit({ ...row, evidence: ['test:a', 'test:fail'], covers: 'whole' }, pass)).toBe('NOT DONE');
    expect(resolveAudit({ ...row, evidence: ['test:a', 'test:none'], covers: 'whole' }, pass)).toBe('UNVERIFIABLE');
    // No evidence: the row's own status; CHANGED stays CHANGED whatever passes.
    expect(resolveAudit(row, pass)).toBe('UNVERIFIABLE');
    expect(resolveAudit({ ...row, status: 'CHANGED', evidence: 'test:a', covers: 'whole' }, pass)).toBe('CHANGED');
  });

  it('M2 audit rows the reviewer flagged stay PARTIAL with a named manual check even when every test passes', () => {
    const m2 = JSON.parse(readFileSync(join(__dirname, '../../docs/fidelity/M2.audit.json'), 'utf8')) as {
      rows: Parameters<typeof resolveAudit>[0][];
    };
    const allPass = () => 'DONE' as const;
    const row = (prefix: string) => m2.rows.find((x) => x.item.startsWith(prefix))!;
    const flagged = [
      '10-2 §C.3 rows',
      '04 §1–§19',
      'Both bubble types',
      'The paste catcher',
      'PERF-02',
      'PERF-04',
      'ART-26a (messages',
      'FID-14 rows',
      'Tier R for the UX-09',
    ];
    for (const p of flagged) {
      expect(resolveAudit(row(p), allPass), p).toBe('PARTIAL');
      expect(row(p).manual, p).toBeTruthy();
    }
    expect(resolveAudit(row('Voice capture'), allPass)).toBe('CHANGED');
    expect(resolveAudit(row('AT-007'), allPass)).toBe('DONE');
    for (const r of m2.rows) if (r.evidence && r.covers !== 'whole') expect(r.manual, r.item).toBeTruthy();
  });
});
