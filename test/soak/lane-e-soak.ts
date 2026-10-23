// Spec: app-wide long-run soak (08-3 §22.9 / 10-2 §E) and 09-windows §9.8/§9.9 (job notifications and process stability).
// This harness runs the full eight-hour acceptance window by default. An explicit one-hour partial route is diagnostic only;
// it needs a Windows fixture driver to write heartbeat evidence. An absent or stale heartbeat is blocked/fail evidence,
// never a silent skip. routine_runs is diagnostic only because the routine milestone is not an acceptance dependency.
// Process metrics are emitted by the live producer from process.pid/process.execPath in the Electron main context; Playwright's
// ElectronApplication.process() PID/path are retained as launcher metadata. This observer never launches or samples --exe.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { FULL_SOAK_HOURS, resolveSoakDuration } from './lane-e-duration';
import {
  PRODUCER_PROCESS_OWNER,
  validateHeartbeat,
  writeSoakReports,
  type PinnedProcessIdentity,
  type SoakHeartbeat,
} from './lane-e-soak-contract';

const SAMPLE_MS = 30 * 1000;
type ProcessSample = {
  at: string;
  pid: number;
  executablePath: string;
  handleCount: number;
  workingSetBytes: number;
  responding: boolean;
  heartbeat: SoakHeartbeat;
};

function usage(): never {
  throw new Error(
    `usage: lane-e-soak.ts --exe <fixture exe> --scenario <heartbeat json> --out <dir> --mode pretend|real [--duration-hours ${FULL_SOAK_HOURS}] [--partial]`,
  );
}
if (process.argv.includes('--help')) {
  console.log(
    `lane-e-soak: ${FULL_SOAK_HOURS}h is the Windows acceptance gate; --partial --duration-hours 1 records diagnostic producer-owned process, memory and heartbeat evidence only; --exe is provenance-only.`,
  );
  process.exit(0);
}
const cli = new Map<string, string>();
for (let i = 2; i < process.argv.length;) {
  const key = process.argv[i];
  if (key === '--partial') {
    i += 1;
    continue;
  }
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || value === undefined) usage();
  cli.set(key.slice(2), value);
  i += 2;
}
const mode = cli.get('mode');
if (mode !== 'pretend' && mode !== 'real') usage();
const exe = cli.get('exe');
const scenarioPath = cli.get('scenario');
const outDirArg = cli.get('out');
const partial = process.argv.includes('--partial');
if (!exe || !scenarioPath || !outDirArg) usage();
const duration = resolveSoakDuration(cli.get('duration-hours'), partial);
const soakHours = duration.hours;
const soakMs = soakHours * 60 * 60 * 1000;
if (process.platform !== 'win32') throw new Error('BLOCKED: lane-e-soak requires Windows CI for process handles and freeze evidence.');
if (mode === 'real' && process.env.FOO_REAL_AI_APPROVED !== '1') {
  throw new Error('BLOCKED: no lane-provided real-AI key/environment is configured; no credential is inspected or used by this harness.');
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
const runnerTemp = resolve(process.env.RUNNER_TEMP);
const exePath = resolve(exe);
const scenarioFile = resolve(scenarioPath);
const outDir = resolve(outDirArg);
if (!inside(exePath, runnerTemp) || !inside(scenarioFile, runnerTemp) || !inside(outDir, runnerTemp)) {
  throw new Error('BLOCKED: exe, heartbeat scenario and output must all be below RUNNER_TEMP.');
}
if (!existsSync(exePath)) throw new Error(`BLOCKED: fixture executable not found: ${exePath}`);
if (!existsSync(scenarioFile)) throw new Error(`BLOCKED: soak heartbeat scenario not found: ${scenarioFile}`);
mkdirSync(outDir, { recursive: true });

function readHeartbeat(): SoakHeartbeat | null {
  try {
    return JSON.parse(readFileSync(scenarioFile, 'utf8')) as SoakHeartbeat;
  } catch {
    return null;
  }
}
function sleep(ms: number): void {
  // Keep the soak loop synchronous so this script works under the repository's CommonJS tsx runtime.
  // The duration is a fixed spec value and the command contains only the numeric sleep interval.
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Sleep -Milliseconds ${ms}`], {
    stdio: 'ignore',
  });
}
const startedAt = Date.now();
const samples: ProcessSample[] = [];
let failure: string | null = null;
let previousHeartbeatAt: number | undefined;
let pinnedIdentity: PinnedProcessIdentity | undefined;
while (Date.now() - startedAt < soakMs) {
  sleep(SAMPLE_MS);
  const heartbeat = readHeartbeat();
  const validated = validateHeartbeat(heartbeat, Date.now(), previousHeartbeatAt, pinnedIdentity);
  if (validated.value) {
    previousHeartbeatAt = validated.value.timestamp;
    pinnedIdentity = validated.value.identity;
    samples.push({
      at: new Date().toISOString(),
      pid: validated.value.identity.pid,
      executablePath: validated.value.identity.executablePath,
      handleCount: validated.value.handleCount,
      workingSetBytes: validated.value.workingSetBytes,
      responding: validated.value.responding,
      heartbeat: heartbeat!,
    });
  }
  if (validated.failure) {
    failure = validated.failure;
    break;
  }
}

const lastHeartbeat = samples.at(-1)?.heartbeat;
const routineRuns = lastHeartbeat?.routineRuns ?? 0;
const expectedWorkloadJobs = lastHeartbeat?.expectedWorkloadJobs ?? 0;
const jobsSubmitted = lastHeartbeat?.jobsSubmitted ?? lastHeartbeat?.jobStarts ?? 0;
const completedUnverifiedJobs = lastHeartbeat?.completedUnverifiedJobs ?? 0;
const completed = failure === null && Date.now() - startedAt >= soakMs;
const workloadComplete = expectedWorkloadJobs > 0 && completedUnverifiedJobs >= expectedWorkloadJobs;
const result = !completed ? (failure ? 'fail' : 'blocked') : !workloadComplete ? 'blocked' : duration.partial ? 'partial' : 'pass';
const report = {
  result,
  mode,
  durationHours: soakHours,
  acceptanceDurationHours: duration.acceptanceHours,
  partial: duration.partial,
  startedAt: new Date(startedAt).toISOString(),
  endedAt: new Date().toISOString(),
  fixture: {
    fixtureIdentityPath: exePath,
    fixtureIdentityRole: 'provenance-only; observer never launches or samples this path',
    scenario: scenarioFile,
    processOwner: PRODUCER_PROCESS_OWNER,
  },
  routineRuns,
  expectedWorkloadJobs,
  jobsSubmitted,
  completedUnverifiedJobs,
  maxHandleCount: samples.reduce((max, sample) => Math.max(max, sample.handleCount), 0),
  maxWorkingSetBytes: samples.reduce((max, sample) => Math.max(max, sample.workingSetBytes), 0),
  processOwner: PRODUCER_PROCESS_OWNER,
  processPid: pinnedIdentity?.pid ?? null,
  processExecutablePath: pinnedIdentity?.executablePath ?? null,
  launcherProcessPid: lastHeartbeat?.launcherProcessPid ?? null,
  launcherProcessExecutablePath: lastHeartbeat?.launcherProcessExecutablePath ?? null,
  freezes: samples.filter((sample) => sample.responding === false).length,
  failure: failure ?? (!workloadComplete ? 'heartbeat did not prove the expected done_unverified workload' : null),
  samples,
};
const summary = [
  '| Check | Result | Detail |',
  '|---|---|---|',
  `| Requested soak duration | ${completed ? (duration.partial ? 'partial' : 'pass') : result} | requested=${soakHours}h; observedMs=${Date.now() - startedAt} |`,
  `| Full ${duration.acceptanceHours}-hour acceptance | ${duration.partial ? 'blocked' : completed ? 'pass' : result} | a one-hour diagnostic never satisfies the full acceptance requirement |`,
  `| Routine rows (diagnostic only) | pass | runs=${routineRuns}; routine execution is not a gate |`,
  `| Job execution evidence | ${workloadComplete ? 'pass' : 'blocked'} | expected=${expectedWorkloadJobs}; submitted=${jobsSubmitted}; completedUnverified=${completedUnverifiedJobs}; lastState=${lastHeartbeat?.jobState ?? 'missing'} |`,
  `| Process handles | ${samples.length > 0 ? 'pass' : 'blocked'} | owner=producer ElectronApplication; pid=${report.processPid ?? 'unknown'}; max=${report.maxHandleCount} |`,
  `| Working set | ${samples.length > 0 ? 'pass' : 'blocked'} | maxBytes=${report.maxWorkingSetBytes} |`,
  `| Freeze/response sample | ${report.freezes === 0 ? 'pass' : 'fail'} | nonRespondingSamples=${report.freezes} |`,
  `| Failure detail | ${report.failure ? 'fail' : 'pass'} | ${(report.failure ?? 'none').replaceAll('|', '/')} |`,
];
writeSoakReports(outDir, mode, report, summary.join('\n'));
console.log(JSON.stringify(report));
if (result === 'fail') process.exit(1);
if (result === 'blocked') process.exit(2);
