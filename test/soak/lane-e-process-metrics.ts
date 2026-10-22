// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. Producer-owned process evidence for the Lane E live fixture.
// The PID is taken from ElectronApplication.process() and is never substituted with an arbitrary executable PID.
import { execFileSync } from 'node:child_process';

export type ProducerProcessOwner = {
  process(): { pid?: number | null };
};

export type ProducerProcessMetrics = {
  pid: number;
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
    'Get-Process -Id ' + pid + ' -ErrorAction Stop | Select-Object Id,HandleCount,WorkingSet64,Responding | ConvertTo-Json -Compress';
  const raw = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]).trim();
  if (!raw) throw new Error('producer process ' + pid + ' returned no Windows metrics');
  const value = JSON.parse(raw) as {
    Id?: number;
    HandleCount?: number;
    WorkingSet64?: number;
    Responding?: boolean;
  };
  if (value.Id !== pid) throw new Error('Windows metrics PID ' + String(value.Id) + ' did not match producer PID ' + pid);
  if (!Number.isFinite(value.HandleCount) || !Number.isFinite(value.WorkingSet64)) {
    throw new Error('Windows metrics for producer PID ' + pid + ' were incomplete');
  }
  return {
    pid,
    handleCount: Number(value.HandleCount),
    workingSetBytes: Number(value.WorkingSet64),
    responding: value.Responding !== false,
  };
}

export function producerProcessMetrics(
  owner: ProducerProcessOwner,
  execute: ProcessMetricsExecutor = defaultExecute,
): ProducerProcessMetrics {
  const pid = owner.process().pid;
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('producer ElectronApplication PID is unavailable: ' + String(pid));
  return processMetricsForPid(pid, execute);
}
