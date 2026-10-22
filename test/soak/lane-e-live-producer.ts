// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. This is the live source-app fixture producer for the packaged-process
// observer in lane-e-soak.ts. It launches through the repository's Playwright Electron launcher, uses only FOO_TEST and a
// fake-AI JSONL script, seeds the real ux-world, and submits one safe pretend job every five minutes through the same UI.
// Every successful fixture job is done_unverified; routine_runs is retained as diagnostic context only. It never invents
// heartbeat counters: an absent job row remains blocked.
import { type ElectronApplication, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fakeTurns, type FakeLine } from '../e2e/fakeAi';
import { launch } from '../e2e/launch';
import { openChat, openWorld } from '../fidelity/capture';
import { TID } from '../../src/shared/testids';
import { FULL_SOAK_HOURS, resolveSoakDuration } from './lane-e-duration';
import { producerProcessMetrics, type ProducerProcessMetrics } from './lane-e-process-metrics';
import { JOB_COMPLETION_TIMEOUT_MS, jobCompletionFailure, PRODUCER_PROCESS_OWNER } from './lane-e-soak-contract';

const SAMPLE_MS = 30_000;
const WORKLOAD_INTERVAL_MS = 5 * 60_000;
const ASK = 'Lane E live fixture job';

function usage(): never {
  throw new Error(
    `usage: lane-e-live-producer.ts --out <RUNNER_TEMP dir> --mode pretend|real [--duration-hours ${FULL_SOAK_HOURS}] [--partial] [--smoke]`,
  );
}

if (process.argv.includes('--help')) {
  console.log(
    `lane-e-live-producer: launches the source Electron app with the existing FOO_TEST/fake-AI fixture; ${FULL_SOAK_HOURS}h is the acceptance gate, while --partial --duration-hours 1 writes diagnostic evidence only; --smoke runs only the launch/job producer check.`,
  );
  process.exit(0);
}

const cli = new Map<string, string>();
const smoke = process.argv.includes('--smoke');
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key === '--smoke' || key === '--partial') continue;
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || value === undefined) usage();
  cli.set(key.slice(2), value);
  i += 1;
}
const mode = cli.get('mode');
const outArg = cli.get('out');
if (mode !== 'pretend' && mode !== 'real') usage();
if (!outArg) usage();
const partial = !smoke && process.argv.includes('--partial');
const duration = smoke ? null : resolveSoakDuration(cli.get('duration-hours'), partial);
const soakHours = duration?.hours ?? FULL_SOAK_HOURS;
const soakMs = soakHours * 60 * 60 * 1000;
if (process.platform !== 'win32') throw new Error('BLOCKED: the live Windows producer requires Windows CI.');
if (mode === 'real' && process.env.FOO_REAL_AI_APPROVED !== '1') {
  throw new Error('BLOCKED: no lane-provided real-AI key/environment is configured; this producer never reads or uses an AI key.');
}
if (!process.env.RUNNER_TEMP) throw new Error('BLOCKED: RUNNER_TEMP is required for isolated fixture paths.');

function inside(path: string, root: string): boolean {
  const p = resolve(path)
    .toLowerCase()
    .replace(/[\\/]$/u, '');
  const r = resolve(root)
    .toLowerCase()
    .replace(/[\\/]$/u, '');
  return p.startsWith(`${r}\\`) || p.startsWith(`${r}/`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function buildSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(process.cwd()), encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const runnerTemp = resolve(process.env.RUNNER_TEMP);
const outDir = resolve(outArg);
if (!inside(outDir, runnerTemp)) throw new Error('BLOCKED: producer output must be below RUNNER_TEMP.');
mkdirSync(outDir, { recursive: true });
const root = join(runnerTemp, `foo-lane-e-live-producer-${process.pid}`);
const dataDir = join(root, 'data');
const localDir = join(root, 'local');
const runtimeOut = join(root, 'runtime-out');
const electronAppData = join(root, 'electron-appdata');
const electronLocalAppData = join(root, 'electron-localappdata');
const fakeScript = join(root, 'fake-ai.jsonl');
const heartbeatFile = join(outDir, 'lane-e-live-heartbeat.json');
mkdirSync(root, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(localDir, { recursive: true });
mkdirSync(runtimeOut, { recursive: true });
mkdirSync(electronAppData, { recursive: true });
mkdirSync(electronLocalAppData, { recursive: true });

const act = (decision: Record<string, unknown>): string => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const fakeLines: FakeLine[] = [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: act({
      kind: 'job',
      title: 'Lane E live fixture job',
      plan: [{ phraseKey: 'look_for', slots: { what: 'fixture' }, route: 'api' }],
      estimate: { minutes: 1 },
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  {
    match: { purpose: 'step' },
    reply: act({ kind: 'done', result: 'Lane E fixture job completed.', unverified: true }),
    delayMs: 1_000,
    once: false,
  },
];
writeFileSync(fakeScript, fakeLines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf8');

type Heartbeat = {
  at: string;
  buildSha: string;
  routineRuns: number;
  expectedWorkloadJobs: number;
  jobsSubmitted: number;
  completedUnverifiedJobs: number;
  jobStarts: number;
  jobState: string;
  lastActionAt: string | null;
  processOwner?: 'producer-electron-application';
  processPid?: number;
  processExecutablePath?: string;
  launcherProcessPid?: number;
  launcherProcessExecutablePath?: string;
  processHandleCount?: number;
  processWorkingSetBytes?: number;
  processResponding?: boolean;
};

type LiveJob = { id: string; state: string; createdAt: number };

function readLiveJobs(dbFile: string, baselineJobIds: ReadonlySet<string>): LiveJob[] {
  if (!existsSync(dbFile)) return [];
  const db = new Database(dbFile, { readonly: true });
  try {
    const jobs = db.prepare('SELECT id, state, created_at FROM jobs ORDER BY created_at DESC, id DESC').all() as {
      id: string;
      state: string;
      created_at: number;
    }[];
    return jobs.filter((job) => !baselineJobIds.has(job.id)).map((job) => ({ id: job.id, state: job.state, createdAt: job.created_at }));
  } finally {
    db.close();
  }
}

function readCounts(
  dbFile: string,
  baselineJobIds: ReadonlySet<string>,
): {
  routineRuns: number;
  jobsSubmitted: number;
  completedUnverifiedJobs: number;
  jobStarts: number;
  jobState: string;
  lastActionAt: string | null;
} {
  if (!existsSync(dbFile)) {
    return {
      routineRuns: 0,
      jobsSubmitted: 0,
      completedUnverifiedJobs: 0,
      jobStarts: 0,
      jobState: 'missing',
      lastActionAt: null,
    };
  }
  const liveJobs = readLiveJobs(dbFile, baselineJobIds);
  const db = new Database(dbFile, { readonly: true });
  try {
    const routines = Number((db.prepare('SELECT COUNT(*) AS n FROM routine_runs').get() as { n: number }).n);
    const latest = liveJobs[0];
    return {
      routineRuns: routines,
      jobsSubmitted: liveJobs.length,
      completedUnverifiedJobs: liveJobs.filter((job) => job.state === 'done_unverified').length,
      jobStarts: liveJobs.length,
      jobState: latest?.state ?? 'missing',
      lastActionAt: latest ? new Date(latest.createdAt).toISOString() : null,
    };
  } finally {
    db.close();
  }
}

function writeHeartbeat(value: Heartbeat): void {
  writeFileSync(heartbeatFile, JSON.stringify(value, null, 2), 'utf8');
}

function processHeartbeat(
  metrics: ProducerProcessMetrics | null,
): Pick<
  Heartbeat,
  | 'processOwner'
  | 'processPid'
  | 'processExecutablePath'
  | 'launcherProcessPid'
  | 'launcherProcessExecutablePath'
  | 'processHandleCount'
  | 'processWorkingSetBytes'
  | 'processResponding'
> {
  if (!metrics) return {};
  return {
    processOwner: PRODUCER_PROCESS_OWNER,
    processPid: metrics.pid,
    processExecutablePath: metrics.executablePath,
    ...(metrics.launcherPid ? { launcherProcessPid: metrics.launcherPid } : {}),
    ...(metrics.launcherExecutablePath ? { launcherProcessExecutablePath: metrics.launcherExecutablePath } : {}),
    processHandleCount: metrics.handleCount,
    processWorkingSetBytes: metrics.workingSetBytes,
    processResponding: metrics.responding,
  };
}

async function submitLiveJob(page: Page, prompt: string): Promise<void> {
  await openChat(page, 'Home');
  const composer = page.getByTestId(TID.composerField);
  await composer.click();
  await composer.fill(prompt);
  await page.keyboard.press('Enter');
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (fakeTurns({ FOO_DATA_DIR: dataDir, FOO_LOCAL_DIR: localDir, FOO_OUT_DIR: runtimeOut }).some((turn) => turn.purpose === 'intake'))
      return;
    await sleep(250);
  }
  throw new Error('fake-AI intake did not observe the live fixture job within 30s');
}

async function waitForJobCompletion(
  page: Page,
  dbFile: string,
  baselineJobIds: ReadonlySet<string>,
  knownJobIds: Set<string>,
): Promise<LiveJob> {
  const startedAt = Date.now();
  let jobId: string | undefined;
  while (Date.now() - startedAt < JOB_COMPLETION_TIMEOUT_MS) {
    await advanceClock(page, 500);
    const jobs = readLiveJobs(dbFile, baselineJobIds);
    const unseen = jobs.filter((job) => !knownJobIds.has(job.id));
    if (unseen.length > 1) throw new Error('multiple live fixture jobs were in flight');
    jobId ??= unseen[0]?.id;
    const job = jobId ? jobs.find((candidate) => candidate.id === jobId) : undefined;
    const failure = jobCompletionFailure(job?.state ?? 'queued', Date.now() - startedAt);
    if (failure) throw new Error(failure);
    if (job?.state === 'done_unverified') return job;
    await sleep(100);
  }
  throw new Error(`job completion timed out after ${JOB_COMPLETION_TIMEOUT_MS / 1000}s`);
}

async function advanceClock(page: Page, milliseconds: number): Promise<void> {
  await page.evaluate((ms) => window.__fooTest!.clock.advance(ms), milliseconds);
}

async function main(): Promise<number> {
  let app: ElectronApplication | null = null;
  const startedAt = Date.now();
  let soakStartedAt = startedAt;
  const dbFile = join(dataDir, 'data', 'foo.db');
  let baselineJobIds = new Set<string>();
  const knownJobIds = new Set<string>();
  let lastProcessMetrics: ProducerProcessMetrics | null = null;
  const processSamples: ProducerProcessMetrics[] = [];
  const expectedWorkloadJobs = smoke ? 1 : 1 + Math.floor((soakMs - 1) / WORKLOAD_INTERVAL_MS);
  let failure: string | null = null;
  try {
    app = await launch({ FOO_DATA_DIR: dataDir, FOO_LOCAL_DIR: localDir, FOO_OUT_DIR: runtimeOut }, [], {
      FOO_FAKE_AI: fakeScript,
      FOO_SOAK: '1',
      APPDATA: electronAppData,
      LOCALAPPDATA: electronLocalAppData,
    });
    lastProcessMetrics = await producerProcessMetrics(app);
    processSamples.push(lastProcessMetrics);
    const page = await app.firstWindow();
    await openWorld(app, page);
    if (existsSync(dbFile)) {
      const db = new Database(dbFile, { readonly: true });
      try {
        baselineJobIds = new Set(db.prepare('SELECT id FROM jobs').pluck().all() as string[]);
      } finally {
        db.close();
      }
    }
    await submitLiveJob(page, `${ASK} #1`);
    const initialJob = await waitForJobCompletion(page, dbFile, baselineJobIds, knownJobIds);
    knownJobIds.add(initialJob.id);
    if (!smoke) {
      soakStartedAt = Date.now();
      let nextWorkAt = soakStartedAt + WORKLOAD_INTERVAL_MS;
      let lastWallAt = Date.now();
      while (Date.now() - soakStartedAt < soakMs) {
        const wallNow = Date.now();
        await advanceClock(page, Math.max(1, wallNow - lastWallAt));
        lastWallAt = wallNow;
        if (wallNow >= nextWorkAt) {
          const sequence = knownJobIds.size + 1;
          await submitLiveJob(page, `${ASK} #${sequence}`);
          const completedJob = await waitForJobCompletion(page, dbFile, baselineJobIds, knownJobIds);
          knownJobIds.add(completedJob.id);
          nextWorkAt += WORKLOAD_INTERVAL_MS;
        }
        const counts = readCounts(dbFile, baselineJobIds);
        lastProcessMetrics = await producerProcessMetrics(app);
        processSamples.push(lastProcessMetrics);
        writeHeartbeat({
          at: new Date().toISOString(),
          buildSha: buildSha(),
          expectedWorkloadJobs,
          ...counts,
          ...processHeartbeat(lastProcessMetrics),
        });
        await sleep(SAMPLE_MS);
      }
    }
    lastProcessMetrics = await producerProcessMetrics(app);
    processSamples.push(lastProcessMetrics);
    const liveCounts = readCounts(dbFile, baselineJobIds);
    writeHeartbeat({
      at: new Date().toISOString(),
      buildSha: buildSha(),
      expectedWorkloadJobs,
      ...liveCounts,
      ...processHeartbeat(lastProcessMetrics),
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    if (app) await app.close().catch(() => undefined);
  }

  const counts = readCounts(dbFile, baselineJobIds);
  const completed = !smoke && failure === null && Date.now() - soakStartedAt >= soakMs;
  if (!smoke && failure === null && completed && counts.completedUnverifiedJobs < expectedWorkloadJobs) {
    failure = `expected ${expectedWorkloadJobs} completed unverified jobs, observed ${counts.completedUnverifiedJobs}`;
  }
  const result = smoke
    ? failure
      ? 'fail'
      : counts.completedUnverifiedJobs === 1
        ? 'pass'
        : 'blocked'
    : !completed
      ? failure
        ? 'fail'
        : 'blocked'
      : failure
        ? 'fail'
        : counts.completedUnverifiedJobs < expectedWorkloadJobs
          ? 'blocked'
          : duration?.partial
            ? 'partial'
            : 'pass';
  writeHeartbeat({
    at: new Date().toISOString(),
    buildSha: buildSha(),
    expectedWorkloadJobs,
    ...counts,
    ...processHeartbeat(lastProcessMetrics),
  });
  const report = {
    result,
    mode,
    durationHours: smoke ? null : soakHours,
    acceptanceDurationHours: smoke ? null : (duration?.acceptanceHours ?? FULL_SOAK_HOURS),
    partial: smoke ? false : (duration?.partial ?? false),
    smoke,
    fixture: { dataDir, localDir, runtimeOut, fakeScript, heartbeatFile },
    buildSha: buildSha(),
    routineRuns: counts.routineRuns,
    jobsSubmitted: counts.jobsSubmitted,
    expectedWorkloadJobs,
    completedUnverifiedJobs: counts.completedUnverifiedJobs,
    jobStarts: counts.jobStarts,
    jobState: counts.jobState,
    processOwner: PRODUCER_PROCESS_OWNER,
    processPid: lastProcessMetrics?.pid ?? null,
    processExecutablePath: lastProcessMetrics?.executablePath ?? null,
    launcherProcessPid: lastProcessMetrics?.launcherPid ?? null,
    launcherProcessExecutablePath: lastProcessMetrics?.launcherExecutablePath ?? null,
    maxHandleCount: processSamples.reduce((max, sample) => Math.max(max, sample.handleCount), 0),
    maxWorkingSetBytes: processSamples.reduce((max, sample) => Math.max(max, sample.workingSetBytes), 0),
    nonRespondingSamples: processSamples.filter((sample) => !sample.responding).length,
    processSamples: processSamples.length,
    failure,
    note: smoke
      ? 'Smoke only: it requires one completed done_unverified fake-AI job; routine_runs is diagnostic only and makes no eight-hour soak claim.'
      : duration?.partial
        ? `Partial ${soakHours}-hour diagnostic only; ${expectedWorkloadJobs} done_unverified jobs were required; the full ${duration.acceptanceHours}-hour acceptance requirement remains unproven.`
        : `Counts come from the live FOO_TEST app SQLite fixture; ${expectedWorkloadJobs} done_unverified jobs are required; routine_runs is diagnostic only.`,
  };
  writeFileSync(join(outDir, `lane-e-live-producer-${mode}.json`), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report));
  return result === 'fail' ? 1 : result === 'blocked' ? 2 : 0;
}

void main().then((code) => {
  process.exitCode = code;
});
