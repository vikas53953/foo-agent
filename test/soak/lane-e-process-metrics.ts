// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. Producer-owned process evidence for the Lane E live fixture.
// The PID is taken from ElectronApplication.process() and is never substituted with an arbitrary executable PID.
import { execFileSync } from 'node:child_process';

export type ProducerProcessOwner = {
  process(): { pid?: number | null; spawnfile?: string | null };
};

export type ProducerProcessMetrics = {
  pid: number;
  executablePath: string;
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

export function producerProcessMetrics(
  owner: ProducerProcessOwner,
  execute: ProcessMetricsExecutor = defaultExecute,
): ProducerProcessMetrics {
  const process = owner.process();
  const pid = process.pid;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0)
    throw new Error('producer ElectronApplication PID is unavailable: ' + String(pid));
  const spawnfile = process.spawnfile;
  if (!spawnfile?.trim()) throw new Error('producer ElectronApplication executable path is unavailable');
  const metrics = processMetricsForPid(pid, execute);
  const normalize = (path: string) =>
    path
      .trim()
      .replaceAll('/', '\\')
      .replace(/[\\]+$/u, '')
      .toLowerCase();
  if (normalize(metrics.executablePath) !== normalize(spawnfile)) {
    throw new Error(`Windows metrics executable path ${metrics.executablePath} did not match producer executable ${spawnfile}`);
  }
  return metrics;
}
