// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. Producer-owned process evidence for the Lane E live fixture.
// The sampled PID/path come from process.pid/process.execPath in the Electron main context. ElectronApplication.process()
// is retained only as launcher metadata because Playwright may expose its cmd.exe wrapper on Windows.
import { execFileSync } from 'node:child_process';

export type ProducerMainProcessIdentity = { pid?: number | null; executablePath?: string | null };

export type ProducerProcessOwner = {
  process(): { pid?: number | null; spawnfile?: string | null };
  evaluate(pageFunction: () => ProducerMainProcessIdentity): Promise<ProducerMainProcessIdentity>;
};

export type ProducerProcessMetrics = {
  pid: number;
  executablePath: string;
  launcherPid?: number;
  launcherExecutablePath?: string;
  handleCount: number;
  workingSetBytes: number;
  responding: boolean;
};

export type ProcessMetricsExecutor = (file: string, args: readonly string[]) => string;

function defaultExecute(file: string, args: readonly string[]): string {
  return execFileSync(file, [...args], { encoding: 'utf8' });
}

export function processMetricsForPid(pid: number, execute: ProcessMetricsExecutor = defaultExecute): ProducerProcessMetrics {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('invalid producer ElectronApplication PID: ' + pid);
  const command =
    'Get-Process -Id ' + pid + ' -ErrorAction Stop | Select-Object Id,Path,HandleCount,WorkingSet64,Responding | ConvertTo-Json -Compress';
  const raw = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]).trim();
  if (!raw) throw new Error('producer process ' + pid + ' returned no Windows metrics');
  const value = JSON.parse(raw) as {
    Id?: number;
    Path?: string;
    HandleCount?: number;
    WorkingSet64?: number;
    Responding?: boolean;
  };
  if (value.Id !== pid) throw new Error('Windows metrics PID ' + String(value.Id) + ' did not match producer PID ' + pid);
  if (!value.Path?.trim()) throw new Error('Windows metrics for producer PID ' + pid + ' omitted executable path');
  const handleCount = value.HandleCount;
  const workingSetBytes = value.WorkingSet64;
  if (
    typeof handleCount !== 'number' ||
    !Number.isInteger(handleCount) ||
    handleCount < 0 ||
    typeof workingSetBytes !== 'number' ||
    !Number.isInteger(workingSetBytes) ||
    workingSetBytes < 0 ||
    typeof value.Responding !== 'boolean'
  ) {
    throw new Error('Windows metrics for producer PID ' + pid + ' were incomplete');
  }
  return {
    pid,
    executablePath: value.Path,
    handleCount,
    workingSetBytes,
    responding: value.Responding,
  };
}

export async function producerProcessMetrics(
  owner: ProducerProcessOwner,
  execute: ProcessMetricsExecutor = defaultExecute,
): Promise<ProducerProcessMetrics> {
  const launcher = owner.process();
  const runtime = await owner.evaluate(() => ({ pid: process.pid, executablePath: process.execPath }));
  const pid = runtime?.pid;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0)
    throw new Error('producer Electron main PID is unavailable: ' + String(pid));
  const executablePath = runtime?.executablePath;
  if (typeof executablePath !== 'string' || !executablePath.trim())
    throw new Error('producer Electron main executable path is unavailable');
  const metrics = processMetricsForPid(pid, execute);
  const normalize = (path: string) =>
    path
      .trim()
      .replaceAll('/', '\\')
      .replace(/[\\]+$/u, '')
      .toLowerCase();
  if (normalize(metrics.executablePath) !== normalize(executablePath)) {
    throw new Error(`Windows metrics executable path ${metrics.executablePath} did not match Electron main executable ${executablePath}`);
  }
  return {
    ...metrics,
    ...(typeof launcher.pid === 'number' && Number.isInteger(launcher.pid) && launcher.pid > 0 ? { launcherPid: launcher.pid } : {}),
    ...(launcher.spawnfile?.trim() ? { launcherExecutablePath: launcher.spawnfile } : {}),
  };
}
