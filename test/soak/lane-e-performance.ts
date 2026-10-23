// Spec: 10-2 §E.1–§E.2 (PERF-01..18), Article 28 (release Windows performance budgets).
// This executable validator consumes measurements from a real Windows adapter. It never invents samples, shortens the
// required 20-run set, or calls an AI provider. Missing release metadata, samples, UI probes or a lane-provided real-AI
// environment produce blocked rows. Use `corepack.cmd pnpm exec tsx test/soak/lane-e-performance.ts --help` for the contract.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const REQUIRED_RUNS = 20;
export const PERF_LIMITS = {
  'PERF-01': {
    metric: 'startupMs',
    budget: 2_000,
    comparison: 'lt',
    unit: 'ms',
    note: 'cold start to chat list painted and accepting input',
  },
  'PERF-02': { metric: 'typingMs', budget: 16, comparison: 'lt', unit: 'ms', note: 'keydown to character painted' },
  'PERF-03': { metric: 'switchMs', budget: 100, comparison: 'lt', unit: 'ms', note: 'chat row activation to last messages painted' },
  'PERF-04': {
    metric: 'scrollOverBudgetPct',
    budget: 1,
    comparison: 'lte',
    unit: '%',
    note: 'frames over 16.7ms; virtualized DOM must be proven',
  },
  'PERF-05': {
    metric: 'searchMs',
    budget: 300,
    comparison: 'lt',
    unit: 'ms',
    note: '150ms debounce to first result at 50k and 100k messages',
  },
  'PERF-06': { metric: 'stopMs', budget: 1_000, comparison: 'lt', unit: 'ms', note: 'stop sent to last click or AI call; no later event' },
  'PERF-07': { metric: 'seenBadgeMs', budget: 1_000, comparison: 'lte', unit: 'ms', note: 'send to seen badge painted' },
  'PERF-08': {
    metric: 'checklistMs',
    budget: 2_000,
    lower: 1_500,
    comparison: 'range',
    unit: 'ms',
    note: 'job start to checklist painted',
  },
  'PERF-09': { metric: 'taskbarOverlayMs', budget: 2_000, comparison: 'lte', unit: 'ms', note: 'Needs you to taskbar overlay' },
  'PERF-10': { metric: 'faceNameMs', budget: 1_000, comparison: 'lte', unit: 'ms', note: 'face tap to list/header/jump-list update' },
  'PERF-11': { metric: 'offlineMs', budget: 10_000, comparison: 'lte', unit: 'ms', note: 'network cut to WAITING and offline banner' },
  'PERF-12': { metric: 'welcomeMs', budget: 90_000, comparison: 'lte', unit: 'ms', note: 'Install tap to Welcome card' },
  'PERF-13': {
    metric: 'idleCpuPct',
    budget: 1,
    comparison: 'lt',
    unit: '%',
    note: 'visible faces focused/minimized/locked; zero animations when hidden',
  },
  'PERF-14': { metric: 'dbWriteMs', budget: 5, comparison: 'lt', unit: 'ms', note: 'single-row transaction commit' },
  'PERF-15': { metric: 'ipcPatchBytes', budget: 64 * 1024, comparison: 'lt', unit: 'bytes', note: 'main to renderer delta patch' },
  'PERF-16': { metric: 'mainRendererMb', budget: 400, comparison: 'lt', unit: 'MB', note: 'main + renderer resident memory' },
  'PERF-17': { metric: 'engineMb', budget: 250, comparison: 'lt', unit: 'MB', note: 'engine resident memory' },
  'PERF-18': { metric: 'transcriptMs', budget: 3_000, comparison: 'lte', unit: 'ms', note: '15-second voice note to transcript' },
} as const;

type PerfId = keyof typeof PERF_LIMITS;
type Sample = number | { value: number; virtualizedDomBounded?: boolean; minimizedAnimations?: number };
export type MeasurementBundle = {
  buildSha?: string;
  os?: string;
  aiMode?: 'pretend' | 'real';
  dataset?: { chats?: number; messages?: number; largestChatMessages?: number; memoryFacts?: number; routines?: number; helpers?: number };
  /** The §E.1 225% stress repeat for PERF-01..04; values must be measured by the adapter, never inferred here. */
  dataset225?: {
    scalePct?: number;
    chats?: number;
    messages?: number;
    largestChatMessages?: number;
    memoryFacts?: number;
    routines?: number;
    helpers?: number;
  };
  runs225?: Partial<Record<'PERF-01' | 'PERF-02' | 'PERF-03' | 'PERF-04', Sample[]>>;
  runs?: Partial<Record<PerfId, Sample[]>>;
};

export type PerfResult = { id: string; result: 'pass' | 'fail' | 'blocked'; p95: number | null; detail: string };

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

function valuesFor(samples: Sample[]): number[] {
  return samples.map((sample) => (typeof sample === 'number' ? sample : sample.value)).filter((value) => Number.isFinite(value));
}

export function evaluate(bundle: MeasurementBundle): PerfResult[] {
  const expected = { chats: 200, messages: 50_000, largestChatMessages: 5_000, memoryFacts: 300, routines: 25, helpers: 8 };
  const dataset = bundle.dataset;
  const datasetOk = Object.entries(expected).every(([key, value]) => dataset?.[key as keyof typeof expected] === value);
  const results: PerfResult[] = [];
  for (const id of Object.keys(PERF_LIMITS) as PerfId[]) {
    const limit = PERF_LIMITS[id];
    const samples = bundle.runs?.[id];
    if (!bundle.buildSha || bundle.os !== 'win32' || !datasetOk) {
      results.push({
        id,
        result: 'blocked',
        p95: null,
        detail: 'current Windows release build and exact E.1 data set metadata are required',
      });
      continue;
    }
    if (!samples || samples.length < REQUIRED_RUNS) {
      results.push({ id, result: 'blocked', p95: null, detail: `${REQUIRED_RUNS} samples are required; received ${samples?.length ?? 0}` });
      continue;
    }
    const numbers = valuesFor(samples);
    if (numbers.length !== samples.length) {
      results.push({ id, result: 'blocked', p95: null, detail: 'all samples must be finite numbers from a live probe' });
      continue;
    }
    const value = p95(numbers);
    const lower = 'lower' in limit ? limit.lower : undefined;
    const inRange =
      limit.comparison === 'range'
        ? value >= (lower ?? 0) && value <= limit.budget
        : limit.comparison === 'lt'
          ? value < limit.budget
          : value <= limit.budget;
    let supporting = true;
    if (id === 'PERF-04') supporting = samples.every((sample) => typeof sample !== 'number' && sample.virtualizedDomBounded === true);
    if (id === 'PERF-13') supporting = samples.every((sample) => typeof sample !== 'number' && sample.minimizedAnimations === 0);
    if (!supporting) {
      results.push({ id, result: 'blocked', p95: value, detail: 'required UI/animation evidence is absent from the live probe' });
      continue;
    }
    results.push({
      id,
      result: inRange ? 'pass' : 'fail',
      p95: value,
      detail: `p95=${value}${limit.unit}; budget ${limit.comparison} ${limit.budget}${limit.unit}`,
    });
  }
  const stressIds = ['PERF-01', 'PERF-02', 'PERF-03', 'PERF-04'] as const;
  const stressDataset = bundle.dataset225;
  const stressDatasetOk =
    stressDataset?.scalePct === 225 &&
    [
      stressDataset.chats,
      stressDataset.messages,
      stressDataset.largestChatMessages,
      stressDataset.memoryFacts,
      stressDataset.routines,
      stressDataset.helpers,
    ].every((value) => Number.isFinite(value));
  for (const id of stressIds) {
    const stressId = `${id}@225%`;
    const samples = bundle.runs225?.[id];
    if (!stressDatasetOk) {
      results.push({ id: stressId, result: 'blocked', p95: null, detail: 'a measured dataset225 object with scalePct=225 is required' });
      continue;
    }
    if (!samples || samples.length < REQUIRED_RUNS) {
      results.push({
        id: stressId,
        result: 'blocked',
        p95: null,
        detail: `${REQUIRED_RUNS} measured 225% samples are required; received ${samples?.length ?? 0}`,
      });
      continue;
    }
    const numbers = valuesFor(samples);
    if (numbers.length !== samples.length) {
      results.push({ id: stressId, result: 'blocked', p95: null, detail: 'all 225% samples must be finite numbers from a live probe' });
      continue;
    }
    const value = p95(numbers);
    const limit = PERF_LIMITS[id];
    const inRange = id === 'PERF-04' ? value <= limit.budget : value < limit.budget;
    const supporting = id !== 'PERF-04' || samples.every((sample) => typeof sample !== 'number' && sample.virtualizedDomBounded === true);
    results.push({
      id: stressId,
      result: supporting && inRange ? 'pass' : supporting ? 'fail' : 'blocked',
      p95: value,
      detail: supporting
        ? `p95=${value}${limit.unit}; 225% dataset budget ${limit.comparison} ${limit.budget}${limit.unit}`
        : '225% virtualized DOM evidence is absent from the live probe',
    });
  }
  return results;
}

function usage(): never {
  throw new Error('usage: lane-e-performance.ts --measurements <json> --out <dir> --mode pretend|real');
}

if (process.argv.includes('--help')) {
  console.log('lane-e-performance: validate 20 live Windows samples for PERF-01..18; missing prerequisites are blocked.');
  process.exit(0);
}
const cli = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || value === undefined) usage();
  cli.set(key.slice(2), value);
}
const mode = cli.get('mode');
if (mode !== 'pretend' && mode !== 'real') usage();
const measurementPath = cli.get('measurements');
const outDir = cli.get('out');
if (!measurementPath || !outDir) usage();
if (mode === 'real' && process.env.FOO_REAL_AI_APPROVED !== '1') {
  throw new Error('BLOCKED: no lane-provided real-AI key/environment is configured; no credential is inspected or used by this harness.');
}
if (!existsSync(measurementPath)) throw new Error(`BLOCKED: measurement file not found: ${measurementPath}`);
const bundle = JSON.parse(readFileSync(measurementPath, 'utf8')) as MeasurementBundle;
if (bundle.aiMode !== mode) throw new Error(`BLOCKED: measurement aiMode=${String(bundle.aiMode)} does not match requested mode=${mode}`);
const results = evaluate(bundle);
mkdirSync(resolve(outDir), { recursive: true });
const report = {
  result: results.some((r) => r.result === 'fail') ? 'fail' : results.some((r) => r.result === 'blocked') ? 'blocked' : 'pass',
  mode,
  buildSha: bundle.buildSha ?? null,
  results,
};
writeFileSync(join(resolve(outDir), `lane-e-performance-${mode}.json`), JSON.stringify(report, null, 2), 'utf8');
const md = [
  '| Feature or check | Result | p95 | Note |',
  '|---|---|---:|---|',
  ...results.map((r) => `| ${r.id} | ${r.result} | ${r.p95 ?? '—'} | ${r.detail.replaceAll('|', '/')} |`),
];
writeFileSync(join(resolve(outDir), `lane-e-performance-${mode}.md`), `${md.join('\n')}\n`, 'utf8');
console.log(JSON.stringify(report));
if (report.result === 'fail') process.exit(1);
if (report.result === 'blocked') process.exit(2);
