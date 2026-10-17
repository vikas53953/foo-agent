// 11-fidelity §11.6.2: the fidelity report reads Vitest/Playwright JSON, resolves audit rows against fresh evidence and
// never reports a missing input as passing.
import { describe, expect, it } from 'vitest';
import { build, evidenceStatus, html, playwrightCases, vitestCases } from '../../scripts/fidelity-report';

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
  audit: { rows: [{ group: 'g', item: 'FID-01', status: 'UNVERIFIABLE' as const, evidence: 'test:FID-01' }] },
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
});
