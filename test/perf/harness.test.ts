// Spec: 10-acceptance-2 §E (PERF-01…18 budgets, E.1 p95 of 20 runs, PERF-01…04 again at 225 %, E.2 > 10 % = P1),
// 08-3 §20 (the same table), §G.1/G.10 (qa-evidence/{build}/perf: CSV + traces + p95 table), M14 pack §4 (which PERF ids are
// measurable now and which wait for a milestone), G-M14-25 (the real {DATA} of a dedicated profile, tech-log timing rows).
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { meets, p95, regressions, type SummaryRow } from './compare';
import { parseArgs, runPerf, type PerfHarness } from './runner';
import { PROBES, SMOKE_IDS } from './probes';
import type { Probe, SessionCtx } from './probes/types';
import { claimProfile, realDataDir } from '../../scripts/perf/profile';
import { readTechLogMarks } from '../../scripts/perf/techLog';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `PERF-${String(i + 1).padStart(2, '0')}`);

describe('p95 and budgets (10-2 §E: the 95th percentile of 20 runs must meet the budget)', () => {
  it('takes the nearest-rank 95th percentile: the 19th of 20 sorted runs', () => {
    const runs = Array.from({ length: 20 }, (_, i) => 20 - i); // 20, 19, … 1
    expect(p95(runs)).toBe(19);
    expect(p95([7])).toBe(7);
  });

  it('reads "<" as strict, "≤" as inclusive and the checklist budget as a window from 1.5 s to 2 s', () => {
    const budget = (id: string) => PROBES.find((p) => p.id === id)!.budget;
    expect(meets(budget('PERF-01'), 1_999)).toBe(true);
    expect(meets(budget('PERF-01'), 2_000)).toBe(false); // cold start < 2.0 s
    expect(meets(budget('PERF-07'), 1_000)).toBe(true); // 👀 ≤ 1 s
    expect(meets(budget('PERF-08'), 1_499)).toBe(false); // checklist appears no earlier than 1.5 s
    expect(meets(budget('PERF-08'), 1_500)).toBe(true);
    expect(meets(budget('PERF-08'), 2_000)).toBe(true);
    expect(meets(budget('PERF-08'), 2_001)).toBe(false);
  });
});

describe('the PERF table (08-3 §20 = 10-2 §E)', () => {
  it('has one probe per PERF id, 01 to 18, with the spec budget', () => {
    expect(PROBES.map((p) => p.id)).toEqual(ids(18));
    const b = Object.fromEntries(PROBES.map((p) => [p.id, p.budget]));
    expect(b['PERF-01']).toEqual({ kind: 'lt', max: 2_000, unit: 'ms' });
    expect(b['PERF-02']).toEqual({ kind: 'lt', max: 16, unit: 'ms' });
    expect(b['PERF-03']).toEqual({ kind: 'lt', max: 100, unit: 'ms' });
    expect(b['PERF-04']).toEqual({ kind: 'le', max: 1, unit: '%' });
    expect(b['PERF-05']).toEqual({ kind: 'lt', max: 300, unit: 'ms' });
    expect(b['PERF-06']).toEqual({ kind: 'lt', max: 1_000, unit: 'ms' });
    expect(b['PERF-08']).toEqual({ kind: 'range', min: 1_500, max: 2_000, unit: 'ms' });
    expect(b['PERF-11']).toEqual({ kind: 'le', max: 10_000, unit: 'ms' });
    expect(b['PERF-12']).toEqual({ kind: 'le', max: 90_000, unit: 'ms' });
    expect(b['PERF-13']).toEqual({ kind: 'lt', max: 1, unit: '%' });
    expect(b['PERF-14']).toEqual({ kind: 'lt', max: 5, unit: 'ms' });
    expect(b['PERF-15']).toEqual({ kind: 'lt', max: 64, unit: 'KB' });
    expect(b['PERF-16']).toEqual({ kind: 'lt', max: 400, unit: 'MB' });
    expect(b['PERF-17']).toEqual({ kind: 'lt', max: 250, unit: 'MB' });
    expect(b['PERF-18']).toEqual({ kind: 'le', max: 3_000, unit: 'ms' });
  });

  it('smoke runs the eight ids measurable now; the rest wait for the milestone that makes them measurable (pack §4)', () => {
    expect([...SMOKE_IDS]).toEqual(['PERF-01', 'PERF-02', 'PERF-03', 'PERF-04', 'PERF-14', 'PERF-15', 'PERF-16', 'PERF-17']);
    const needs = Object.fromEntries(PROBES.filter((p) => p.kind === 'pending').map((p) => [p.id, p.needs]));
    expect(needs).toEqual({
      'PERF-05': 'M13',
      'PERF-06': 'M4',
      'PERF-07': 'M4',
      'PERF-08': 'M4',
      'PERF-09': 'M11',
      'PERF-10': 'M11',
      'PERF-11': 'M4',
      'PERF-12': 'M12',
      'PERF-18': 'M11',
    });
    expect(PROBES.filter((p) => p.textScale).map((p) => p.id)).toEqual(['PERF-01', 'PERF-02', 'PERF-03', 'PERF-04']);
  });
});

describe('E.2 regression: more than 10 % worse than the last main run is a P1', () => {
  const row = (id: string, v: number | null, verdict: SummaryRow['verdict'] = 'pass'): SummaryRow => ({
    id,
    variant: 't100',
    p95: v,
    unit: 'ms',
    runs: 20,
    budget: 'x',
    verdict,
  });

  it('flags 11 % worse, not exactly 10 %, not better, and skips ids the baseline lacks or skipped', () => {
    const base = [row('PERF-01', 1_000), row('PERF-02', 10), row('PERF-03', 50), row('PERF-07', null, 'skipped')];
    const cur = [row('PERF-01', 1_110), row('PERF-02', 11), row('PERF-03', 40), row('PERF-07', 900), row('PERF-14', 3)];
    const p1 = regressions(cur, base);
    expect(p1.map((r) => r.id)).toEqual(['PERF-01']);
    expect(p1[0]).toMatchObject({ before: 1_000, after: 1_110, severity: 'P1' });
    expect(p1[0]!.change).toBeCloseTo(0.11, 5);
  });

  it('compares each text size with its own baseline', () => {
    const base = [{ ...row('PERF-01', 1_000), variant: 't225' as const }, row('PERF-01', 1_500)];
    const cur = [{ ...row('PERF-01', 1_200), variant: 't225' as const }, row('PERF-01', 1_500)];
    expect(regressions(cur, base).map((r) => `${r.id} ${r.variant}`)).toEqual(['PERF-01 t225']);
  });
});

/** A probe that answers from a list, so the runner can be checked without launching foo. */
function fakeProbe(id: string, values: number[], extra: Partial<Probe> = {}): Probe {
  let i = 0;
  const base = PROBES.find((p) => p.id === id)!;
  return {
    ...base,
    kind: 'session',
    order: 1,
    measure: async () => ({ value: values[i++ % values.length]!, trace: { i } }),
    ...extra,
  } as Probe;
}

function harness(probes: Probe[]): PerfHarness & { sessions: number[]; closed: number } {
  const h = {
    probes,
    sessions: [] as number[],
    closed: 0,
    openSession: async (o: { textScale: number; run: number }) => {
      h.sessions.push(o.textScale);
      return { textScale: o.textScale, close: async () => void h.closed++ } as unknown as SessionCtx;
    },
  };
  return h;
}

describe('runner: 20 runs, p95 table, CSV + traces under qa-evidence/{build}/perf', () => {
  const out = () => mkdtempSync(join(tmpdir(), 'foo-perf-'));

  it('writes PERF-nn.csv with one row per run and a trace per run, and prints the p95 table', async () => {
    const root = out();
    const lines: string[] = [];
    const h = harness([fakeProbe('PERF-03', [40, 60, 80]), PROBES.find((p) => p.id === 'PERF-07')!]);
    const r = await runPerf({ ...parseArgs(['--smoke', '--runs', '3', '--build', 'b1', '--out', root, '--no-text-scale']) }, h, (l) =>
      lines.push(l),
    );
    const dir = join(root, 'b1', 'perf');
    const csv = readFileSync(join(dir, 'PERF-03.csv'), 'utf8').trim().split('\n');
    expect(csv[0]).toBe('id,variant,run,value,unit');
    expect(csv.slice(1)).toEqual(['PERF-03,t100,1,40,ms', 'PERF-03,t100,2,60,ms', 'PERF-03,t100,3,80,ms']);
    expect(existsSync(join(dir, 'traces', 'PERF-03__t100__run-1.json'))).toBe(true);
    expect(h.sessions).toEqual([1, 1, 1]); // one cold launch per run
    expect(h.closed).toBe(3);
    const row = r.rows.find((x) => x.id === 'PERF-03')!;
    expect(row).toMatchObject({ p95: 80, runs: 3, verdict: 'pass', variant: 't100' });
    const skipped = r.rows.find((x) => x.id === 'PERF-07')!;
    expect(skipped).toMatchObject({ verdict: 'skipped', note: 'needs M4', p95: null });
    expect(lines.join('\n')).toMatch(/PERF-03 .*p95 80 ms.*< 100 ms.*pass/);
    expect(lines.join('\n')).toMatch(/PERF-07 .*needs M4/);
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as { build: string; rows: SummaryRow[] };
    expect(summary.build).toBe('b1');
    expect(summary.rows).toEqual(r.rows);
  });

  it('runs the four text-size ids again at 225 % text in their own sessions and files', async () => {
    const root = out();
    const h = harness([fakeProbe('PERF-03', [50]), fakeProbe('PERF-16', [300])]);
    const r = await runPerf(parseArgs(['--smoke', '--runs', '2', '--build', 'b2', '--out', root]), h, () => {});
    expect(h.sessions).toEqual([1, 1, 2.25, 2.25]);
    expect(r.rows.map((x) => `${x.id} ${x.variant}`)).toEqual(['PERF-03 t100', 'PERF-16 t100', 'PERF-03 t225']);
    expect(existsSync(join(root, 'b2', 'perf', 'PERF-03__t225.csv'))).toBe(true);
  });

  it('smoke is a report: a budget miss or P1 exits 0; --blocking exits 1 (11 §11.8.4 from the RC on)', async () => {
    const h = () => harness([fakeProbe('PERF-03', [500])]);
    const smoke = await runPerf(parseArgs(['--smoke', '--runs', '1', '--out', out(), '--no-text-scale']), h(), () => {});
    expect(smoke.rows[0]!.verdict).toBe('fail');
    expect(smoke.code).toBe(0);
    const gate = await runPerf(parseArgs(['--smoke', '--runs', '1', '--out', out(), '--no-text-scale', '--blocking']), h(), () => {});
    expect(gate.code).toBe(1);
  });

  it('compares with the last main summary and writes regressions.json', async () => {
    const root = out();
    const basePath = join(root, 'base.json');
    writeFileSync(
      basePath,
      JSON.stringify({
        build: 'main',
        rows: [{ id: 'PERF-03', variant: 't100', p95: 40, unit: 'ms', runs: 20, budget: '< 100 ms', verdict: 'pass' }],
      }),
    );
    const lines: string[] = [];
    const h = harness([fakeProbe('PERF-03', [50])]);
    const r = await runPerf(
      parseArgs(['--smoke', '--runs', '1', '--build', 'b3', '--out', root, '--no-text-scale', '--baseline', basePath]),
      h,
      (l) => lines.push(l),
    );
    expect(r.regressions.map((x) => x.id)).toEqual(['PERF-03']);
    expect(lines.join('\n')).toMatch(/P1 .*PERF-03.*40 ms → 50 ms.*\+25 %/);
    expect(JSON.parse(readFileSync(join(root, 'b3', 'perf', 'regressions.json'), 'utf8'))).toHaveLength(1);
  });

  it('a probe that throws marks its row "error" with the message, and the run goes on', async () => {
    const h = harness([
      fakeProbe('PERF-03', [50], { measure: async () => Promise.reject(new Error('no chat rows')) } as Partial<Probe>),
      fakeProbe('PERF-16', [300]),
    ]);
    const r = await runPerf(parseArgs(['--smoke', '--runs', '2', '--out', out(), '--no-text-scale']), h, () => {});
    expect(r.rows.find((x) => x.id === 'PERF-03')).toMatchObject({ verdict: 'error', note: 'no chat rows' });
    expect(r.rows.find((x) => x.id === 'PERF-16')).toMatchObject({ verdict: 'pass', runs: 2 });
  });
});

describe('args', () => {
  it('smoke and full both run 20 times; full idles 60 s before reading memory, smoke 15 s', () => {
    expect(parseArgs(['--smoke'])).toMatchObject({ mode: 'smoke', runs: 20, idleMs: 15_000, textScale: true, blocking: false });
    expect(parseArgs(['--full'])).toMatchObject({ mode: 'full', runs: 20, idleMs: 60_000 });
    expect(parseArgs(['--smoke', '--ids', 'PERF-01,PERF-14']).ids).toEqual(['PERF-01', 'PERF-14']);
  });
});

describe('the measured profile is the real {DATA} (G-M14-25), and the runner never takes over someone’s foo', () => {
  it('resolves {DATA} the way Electron does: %APPDATA%\\foo on Windows, $XDG_CONFIG_HOME/foo on Linux', () => {
    expect(realDataDir('win32', { APPDATA: 'C:\\Users\\t\\AppData\\Roaming' }, 'C:\\Users\\t')).toBe('C:\\Users\\t\\AppData\\Roaming\\foo');
    expect(realDataDir('linux', { XDG_CONFIG_HOME: '/x/cfg' }, '/home/t')).toBe('/x/cfg/foo');
    expect(realDataDir('linux', {}, '/home/t')).toBe('/home/t/.config/foo');
  });

  it('claims an empty profile, re-uses its own, and refuses a {DATA} that already holds someone’s foo', () => {
    const root = mkdtempSync(join(tmpdir(), 'foo-prof-'));
    const fresh = join(root, 'fresh');
    expect(() => claimProfile(fresh)).not.toThrow();
    expect(() => claimProfile(fresh)).not.toThrow();
    const taken = join(root, 'taken');
    mkdirSync(join(taken, 'data'), { recursive: true });
    writeFileSync(join(taken, 'settings.json'), '{}');
    expect(() => claimProfile(taken)).toThrow(/not a perf profile/);
  });
});

describe('tech-log timing rows (G-M14-25: evt "perf.PERF-nn" with ms, read from {DATA}\\logs\\app-{date}.log)', () => {
  it('reads every perf row and ignores the other lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'foo-log-'));
    mkdirSync(join(dir, 'logs'));
    writeFileSync(
      join(dir, 'logs', 'app-2026-10-18.log'),
      [
        '{"evt":"app.start","at":1}',
        '{"evt":"perf.PERF-01","ms":1234}',
        'not json',
        '{"evt":"perf.PERF-14","ms":2.5}',
        '{"evt":"perf.PERF-14","ms":3}',
      ].join('\n'),
    );
    expect(readTechLogMarks(dir)).toEqual({ 'PERF-01': [1234], 'PERF-14': [2.5, 3] });
    expect(readTechLogMarks(join(dir, 'missing'))).toEqual({});
  });
});
