// Spec: docs/build-method.md §8 (no re-proving the same red tests); retro lever 3. scripts/ci-verdict.ts sorts each
// failing CI test into mine / known / new.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classify, digest, failuresFromAnnotations, failuresFromLog, MARKER, parseKnownRed } from '../../../scripts/ci-verdict';

const HEAD = 'match\treason\towner\tuntil';
const today = '2026-10-21';

describe('known-red.tsv', () => {
  it('the committed list parses', () => {
    expect(() => parseKnownRed(readFileSync('docs/known-red.tsv', 'utf8'))).not.toThrow();
  });

  it('skips comments and blank lines, and keeps the line number for the digest', () => {
    const rows = parseKnownRed(`${HEAD}\n# note\n\nAT-074\tredactor flake\tthread X\t2026-10-30\n`);
    expect(rows).toEqual([{ match: 'AT-074', reason: 'redactor flake', owner: 'thread X', until: '2026-10-30', line: 4 }]);
  });

  it('refuses a row whose until date is more than 14 days out', () => {
    const row = (until: string) => `${HEAD}\nAT-074\tflake\tme\t${until}\n`;
    expect(() => parseKnownRed(row('2026-11-04'), '2026-10-21')).not.toThrow();
    expect(() => parseKnownRed(row('2026-11-05'), '2026-10-21')).toThrow(/14 days/);
  });

  it('refuses a row with no owner or no until date', () => {
    expect(() => parseKnownRed(`${HEAD}\nAT-074\tflake\t\t2026-10-30\n`)).toThrow(/owner/);
    expect(() => parseKnownRed(`${HEAD}\nAT-074\tflake\tme\tsoon\n`)).toThrow(/until/);
    expect(() => parseKnownRed('test\twhy\n')).toThrow(/header/);
  });
});

describe('reading failures', () => {
  it('takes test failures from annotations, not the runner lines, and turns Windows backslashes into slashes', () => {
    const f = failuresFromAnnotations('Full suite 3/4', 7, [
      { path: '.github', annotation_level: 'failure', title: '', message: 'Process completed with exit code 1.' },
      { path: '.github', annotation_level: 'warning', title: '', message: 'Node.js 20 is deprecated.' },
      {
        path: 'test\\e2e\\m5.spec.ts',
        annotation_level: 'failure',
        title: 'test\\e2e\\m5.spec.ts:74:5 › approval › posts once',
        message: '\nError: expected 1\nreceived 2',
      },
    ]);
    expect(f).toEqual([
      {
        job: 'Full suite 3/4',
        jobId: 7,
        file: 'test/e2e/m5.spec.ts',
        title: 'test/e2e/m5.spec.ts:74:5 › approval › posts once',
        message: 'Error: expected 1',
      },
    ]);
  });

  it('reads vitest and Playwright failures from a saved log, once each', () => {
    const log = [
      '2026-10-21T10:00:00.1234567Z  FAIL  test/integration/jobs/finish.test.ts > finish > keeps its state',
      ' FAIL  test/integration/jobs/finish.test.ts > finish > keeps its state',
      '  ✘  3 [electron] › test/e2e/m5.spec.ts:10:5 › approval › posts once (2.1s)',
      '  ✓  4 [electron] › test/e2e/m5.spec.ts:20:5 › approval › other (1.0s)',
    ].join('\r\n');
    expect(failuresFromLog('log', log).map((f) => f.title)).toEqual([
      'test/integration/jobs/finish.test.ts > finish > keeps its state',
      'test/e2e/m5.spec.ts > approval › posts once',
    ]);
  });
});

describe('the verdict', () => {
  const known = parseKnownRed(
    `${HEAD}\nAT-074\tredactor flake\tflakes thread\t2026-10-30\ntest/perf/boot.test.ts\tcloud runner is slow\tperf thread\t2026-10-01\n`,
  );
  const fail = (file: string, title: string) => ({ job: 'j', file, title, message: '' });
  const ctx = { known, today, changed: ['test/unit/mine.test.ts'], baseName: 'main' };

  it('a live known-red row makes it known, by test id', () => {
    const [r] = classify([fail('test/unit/x.test.ts', 'test/unit/x.test.ts > AT-074 redacts ids')], { ...ctx, baseFailures: [] });
    expect(r!.verdict).toBe('known');
    expect(r!.why).toContain('known-red.tsv:2');
  });

  it('red on the base branch too makes it known, even when the reporters name it differently', () => {
    const base = [fail('test/e2e/a.spec.ts', 'test/e2e/a.spec.ts:9:1 › suite › opens')];
    const [r] = classify([fail('test/e2e/a.spec.ts', 'test/e2e/a.spec.ts > suite › opens')], { ...ctx, baseFailures: base });
    expect(r).toMatchObject({ verdict: 'known', why: 'red on main too' });
  });

  it('a failing test file the PR changed is mine', () => {
    const [r] = classify([fail('test/unit/mine.test.ts', 'test/unit/mine.test.ts > works')], { ...ctx, baseFailures: [] });
    expect(r!.verdict).toBe('mine');
  });

  it('an expired row no longer hides the failure', () => {
    const [r] = classify([fail('test/perf/boot.test.ts', 'test/perf/boot.test.ts > boots fast')], { ...ctx, baseFailures: [] });
    expect(r).toMatchObject({ verdict: 'new' });
    expect(r!.why).toContain('expired 2026-10-01');
  });

  it('a test the PR changes is mine even when it is red on the base branch or listed as known', () => {
    const f = fail('test/unit/mine.test.ts', 'test/unit/mine.test.ts > AT-074 works');
    const [r] = classify([f], { ...ctx, baseFailures: [f] });
    expect(r!.verdict).toBe('mine');
  });

  it('anything else is new', () => {
    const [r] = classify([fail('test/unit/y.test.ts', 'test/unit/y.test.ts > z')], { ...ctx, baseFailures: [] });
    expect(r).toMatchObject({ verdict: 'new', why: 'not in known-red.tsv and green on main' });
  });

  it('the digest is short: counts, one table row per test with mine first, and job-level failures', () => {
    const rows = classify(
      [fail('test/unit/y.test.ts', 'test/unit/y.test.ts > a | b'), fail('test/unit/mine.test.ts', 'test/unit/mine.test.ts > works')],
      { ...ctx, baseFailures: [] },
    );
    const text = digest(
      rows,
      { label: '#12', sha: 'abcdef123' },
      { jobOnly: [{ job: 'Golden', jobId: 5, step: 'Build' }], knownRows: 2, expiredRows: 1 },
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe(MARKER);
    expect(text).toContain('### CI verdict for #12 at abcdef1');
    expect(text).toContain('**1 mine · 0 known · 1 new** (known-red.tsv: 2 rows, 1 expired)');
    expect(lines.findIndex((l) => l.startsWith('| mine'))).toBeLessThan(lines.findIndex((l) => l.startsWith('| new')));
    expect(text).toContain('a \\| b');
    expect(text).toContain('Golden: step "Build" failed without a test annotation');
    const cut = digest(rows, { label: '#12', sha: 'abc' }, { jobOnly: [], knownRows: 0, expiredRows: 0, truncated: ['Shard 2'] });
    expect(cut).toContain('Shard 2: GitHub keeps 10 annotations per step');
    expect(digest([], { label: '#1', sha: 'abc' }, { jobOnly: [], knownRows: 0, expiredRows: 0 })).toContain('No failing tests.');
  });
});
