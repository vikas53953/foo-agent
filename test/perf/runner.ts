// Spec: 10-acceptance-2 §E.1 (reference laptop, Windows 10 and 11, release build, after a reboot, the E.1 data set; each test
// runs 20 times and the 95th percentile must meet the budget; PERF-01…04 again at text size 225 %), §E.2 (> 10 % worse than
// the last build = P1), §G.1/G.10 (qa-evidence/{build}/perf: per-PERF CSV + trace files + the p95 table), 08-3 §20,
// 11-fidelity §11.8.4 (smoke on every PR is a report until the RC, then a regression blocks), G-M14-25 (the shipped build
// unchanged, perf data in the real {DATA}).
// Usage: pnpm perf --smoke | --full  [--runs 20] [--ids PERF-01,PERF-14] [--build id] [--out qa-evidence] [--app foo.exe]
//        [--perf-data dir] [--baseline summary.json] [--no-text-scale] [--idle-ms 60000] [--blocking]
// A run is one cold launch of the measured build; every session probe reads that launch once (PERF-01 at start, PERF-16/17
// after the idle, then the interactions, PERF-15 last). PERF-14 runs its 20 writes outside the window.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetText, meets, p95, regressions, type Regression, type SummaryRow, type Variant } from './compare';
import { PROBES, SMOKE_IDS } from './probes';
import type { ProcessCtx, Probe, ProcessProbe, Sample, SessionCtx, SessionProbe } from './probes/types';

export interface PerfOptions {
  mode: 'smoke' | 'full';
  runs: number;
  ids?: string[];
  build: string;
  out: string;
  textScale: boolean;
  idleMs: number;
  blocking: boolean;
  baseline?: string;
  app?: string;
  perfData?: string;
}

export interface PerfHarness {
  probes: readonly Probe[];
  openSession(o: { run: number; textScale: number; idleMs: number }): Promise<SessionCtx>;
  processCtx?: ProcessCtx;
}

export interface PerfResult {
  code: number;
  rows: SummaryRow[];
  regressions: Regression[];
}

const TEXT_SCALE = 2.25;

export function parseArgs(argv: readonly string[]): PerfOptions {
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = argv.includes('--full') ? 'full' : 'smoke';
  const ids = val('--ids');
  const runs = Number(val('--runs') ?? 20);
  const idleMs = Number(val('--idle-ms') ?? (mode === 'full' ? 60_000 : 15_000));
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a whole number from 1');
  if (!Number.isFinite(idleMs) || idleMs < 0) throw new Error('--idle-ms must be a number of ms');
  return {
    mode,
    runs,
    ...(ids ? { ids: ids.split(',').map((s) => s.trim()) } : {}),
    build: val('--build') ?? process.env.FOO_BUILD_ID ?? 'local',
    out: val('--out') ?? 'qa-evidence',
    textScale: !argv.includes('--no-text-scale'),
    idleMs,
    blocking: argv.includes('--blocking'),
    ...(val('--baseline') ? { baseline: val('--baseline') } : {}),
    ...(val('--app') ? { app: val('--app') } : {}),
    ...(val('--perf-data') ? { perfData: val('--perf-data') } : {}),
  };
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const csvName = (id: string, v: Variant) => (v === 't100' ? `${id}.csv` : `${id}__${v}.csv`);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Collected {
  samples: Sample[];
  errors: string[];
}

export async function runPerf(opts: PerfOptions, h: PerfHarness, log: (line: string) => void = console.log): Promise<PerfResult> {
  // Smoke lists the ids still waiting for a milestone too, so the table says what each one needs.
  const smoke = new Set(SMOKE_IDS);
  const wanted = (p: Probe) => (opts.ids ? opts.ids.includes(p.id) : opts.mode === 'full' || smoke.has(p.id) || p.kind === 'pending');
  const probes = h.probes.filter(wanted);
  const dir = join(opts.out, opts.build, 'perf');
  mkdirSync(join(dir, 'traces'), { recursive: true });
  const got = new Map<string, Collected>();
  const slot = (id: string, v: Variant) => {
    const k = `${id} ${v}`;
    if (!got.has(k)) got.set(k, { samples: [], errors: [] });
    return got.get(k)!;
  };
  const keep = (id: string, v: Variant, run: number, s: Sample) => {
    slot(id, v).samples.push(s);
    writeFileSync(join(dir, 'traces', `${id}__${v}__run-${run}.json`), JSON.stringify({ id, variant: v, run, ...s }, null, 2) + '\n');
  };

  const session = probes.filter((p): p is SessionProbe => p.kind === 'session').sort((a, b) => a.order - b.order);
  const variants: Variant[] = ['t100', ...(opts.textScale ? (['t225'] as const) : [])];
  for (const v of variants) {
    const these = v === 't100' ? session : session.filter((p) => p.textScale);
    if (these.length === 0) continue;
    for (let run = 1; run <= opts.runs; run++) {
      let ctx: SessionCtx;
      try {
        ctx = await h.openSession({ run, textScale: v === 't100' ? 1 : TEXT_SCALE, idleMs: opts.idleMs });
      } catch (e) {
        for (const p of these) slot(p.id, v).errors.push(`launch: ${message(e)}`);
        log(`run ${run} ${v}: launch failed: ${message(e)}`);
        continue;
      }
      try {
        for (const p of these) {
          try {
            keep(p.id, v, run, await p.measure(ctx));
          } catch (e) {
            slot(p.id, v).errors.push(message(e));
          }
        }
      } finally {
        await ctx.close().catch(() => {});
      }
    }
  }
  for (const p of probes.filter((x): x is ProcessProbe => x.kind === 'process')) {
    try {
      if (!h.processCtx) throw new Error('no perf data for process probes');
      (await p.measureAll(opts.runs, h.processCtx)).forEach((s, i) => keep(p.id, 't100', i + 1, s));
    } catch (e) {
      slot(p.id, 't100').errors.push(message(e));
    }
  }

  const rows: SummaryRow[] = [];
  for (const v of variants) {
    for (const p of probes) {
      const base = { id: p.id, variant: v, unit: p.budget.unit, budget: budgetText(p.budget) };
      if (p.kind === 'pending') {
        if (v === 't100') rows.push({ ...base, p95: null, runs: 0, verdict: 'skipped', note: `needs ${p.needs}` });
        continue;
      }
      const c = got.get(`${p.id} ${v}`);
      if (!c) continue;
      const values = c.samples.map((s) => s.value);
      const q = values.length ? p95(values) : null;
      const verdict: SummaryRow['verdict'] = c.errors.length ? 'error' : meets(p.budget, q!) ? 'pass' : 'fail';
      rows.push({ ...base, p95: q, runs: values.length, verdict, ...(c.errors.length ? { note: c.errors[0]! } : {}) });
      writeFileSync(
        join(dir, csvName(p.id, v)),
        ['id,variant,run,value,unit', ...values.map((x, i) => `${p.id},${v},${i + 1},${x},${p.budget.unit}`)].join('\n') + '\n',
      );
    }
  }

  log(`PERF ${opts.mode} · build ${opts.build} · ${opts.runs} runs · p95 (10-2 §E)`);
  for (const r of rows) {
    if (r.verdict === 'skipped') log(`${r.id} ${r.variant}  skipped  ${r.note}`);
    else
      log(
        `${r.id} ${r.variant}  p95 ${r.p95 === null ? '—' : `${fmt(r.p95)} ${r.unit}`}  (${r.budget})  ${r.verdict}  ${r.runs} runs${r.note ? `  ${r.note}` : ''}`,
      );
  }

  let found: Regression[] = [];
  if (opts.baseline) {
    if (existsSync(opts.baseline)) {
      const base = JSON.parse(readFileSync(opts.baseline, 'utf8')) as { build?: string; rows: SummaryRow[] };
      found = regressions(rows, base.rows);
      writeFileSync(join(dir, 'regressions.json'), JSON.stringify(found, null, 2) + '\n');
      log(`E.2 against ${base.build ?? opts.baseline}: ${found.length ? `${found.length} P1` : 'no regression over 10 %'}`);
      for (const r of found) {
        const unit = rows.find((x) => x.id === r.id)?.unit ?? '';
        const pct = Number.isFinite(r.change) ? `+${Math.round(r.change * 100)} %` : 'from 0';
        log(`P1  ${r.id} ${r.variant}  ${fmt(r.before)} ${unit} → ${fmt(r.after)} ${unit}  (${pct})`);
      }
    } else log(`E.2: no baseline at ${opts.baseline} yet; nothing compared`);
  }

  writeFileSync(
    join(dir, 'summary.json'),
    JSON.stringify(
      {
        build: opts.build,
        mode: opts.mode,
        os: `${process.platform} ${process.arch}`,
        at: new Date().toISOString(),
        runs: opts.runs,
        idleMs: opts.idleMs,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  const bad = rows.some((r) => r.verdict === 'fail' || r.verdict === 'error') || found.length > 0;
  return { code: opts.blocking && bad ? 1 : 0, rows, regressions: found };
}

function gitBuild(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (!argv.includes('--build') && !process.env.FOO_BUILD_ID) opts.build = gitBuild();
  const { openProdSession } = await import('./probes/session');
  const { claimProfile, realDataDir } = await import('../../scripts/perf/profile');
  const { makePerfData, PERF_DATA_DIR } = await import('../../scripts/perf/make-perf-db');
  let perfData = opts.perfData;
  if (!perfData) {
    const m = await makePerfData(PERF_DATA_DIR);
    console.log(`perf data: ${m.chats} chats, ${m.messages} messages (E.1 parts pending: ${Object.values(m.pending).join(', ')})`);
    perfData = PERF_DATA_DIR;
  }
  const dataDir = realDataDir(process.platform, process.env, homedir());
  claimProfile(dataDir);
  console.log(`measured build: ${opts.app ?? 'this checkout (electron .)'}; {DATA}: ${dataDir}`);
  const r = await runPerf(opts, {
    probes: PROBES,
    openSession: (o) => openProdSession({ ...o, perfData, dataDir, ...(opts.app ? { app: opts.app } : {}) }),
    processCtx: { perfData, outMain: join('out', 'main') },
  });
  process.exitCode = r.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 2;
  });
}
