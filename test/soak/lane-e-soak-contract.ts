// Spec: 10-2 §E.1–§E.2 and 09-windows §9.8/§9.9. Shared Lane E soak acceptance rules.
// Successful fixture work is explicitly done_unverified; process identity, heartbeat time, and response evidence are strict.

export const HEARTBEAT_GRACE_MS = 120 * 1000;
export const JOB_COMPLETION_TIMEOUT_MS = 120 * 1000;
export const PRODUCER_PROCESS_OWNER = 'producer-electron-application' as const;

export type SoakJobState = string;

export type SoakHeartbeat = {
  at?: string;
  buildSha?: string;
  routineRuns?: number;
  expectedWorkloadJobs?: number;
  jobsSubmitted?: number;
  completedUnverifiedJobs?: number;
  jobStarts?: number;
  jobState?: SoakJobState;
  lastActionAt?: string | null;
  processOwner?: typeof PRODUCER_PROCESS_OWNER;
  processPid?: number;
  processExecutablePath?: string;
  launcherProcessPid?: number;
  launcherProcessExecutablePath?: string;
  processHandleCount?: number;
  processWorkingSetBytes?: number;
  processResponding?: boolean;
};

export type PinnedProcessIdentity = {
  pid: number;
  executablePath: string;
};

export type ValidatedHeartbeat = {
  timestamp: number;
  identity: PinnedProcessIdentity;
  handleCount: number;
  workingSetBytes: number;
  responding: boolean;
};

function normalizePath(path: string): string {
  return path
    .trim()
    .replaceAll('/', '\\')
    .replace(/[\\]+$/u, '')
    .toLowerCase();
}

export function validateHeartbeat(
  heartbeat: SoakHeartbeat | null,
  now: number,
  previousTimestamp?: number,
  pinnedIdentity?: PinnedProcessIdentity,
): { value?: ValidatedHeartbeat; failure?: string } {
  if (!heartbeat) return { failure: 'producer heartbeat is missing or invalid JSON' };
  if (!heartbeat.at) return { failure: 'producer heartbeat timestamp is missing' };
  const timestamp = Date.parse(heartbeat.at);
  if (!Number.isFinite(timestamp)) return { failure: 'producer heartbeat timestamp is invalid' };
  if (timestamp > now) return { failure: 'producer heartbeat timestamp is in the future' };
  if (previousTimestamp !== undefined && timestamp < previousTimestamp) {
    return { failure: 'producer heartbeat timestamp moved backwards' };
  }
  if (now - timestamp > HEARTBEAT_GRACE_MS) {
    return { failure: `producer heartbeat stale for more than ${HEARTBEAT_GRACE_MS / 1000}s` };
  }
  if (heartbeat.processOwner !== PRODUCER_PROCESS_OWNER) {
    return { failure: 'producer heartbeat process owner is missing or unexpected' };
  }
  const processPid = heartbeat.processPid;
  if (typeof processPid !== 'number' || !Number.isInteger(processPid) || processPid <= 0) {
    return { failure: 'producer heartbeat PID is missing or invalid' };
  }
  const processExecutablePath = heartbeat.processExecutablePath;
  if (!processExecutablePath?.trim()) {
    return { failure: 'producer heartbeat executable path is missing' };
  }
  const processHandleCount = heartbeat.processHandleCount;
  if (typeof processHandleCount !== 'number' || !Number.isInteger(processHandleCount) || processHandleCount < 0) {
    return { failure: 'producer heartbeat handle count is missing or invalid' };
  }
  const processWorkingSetBytes = heartbeat.processWorkingSetBytes;
  if (typeof processWorkingSetBytes !== 'number' || !Number.isInteger(processWorkingSetBytes) || processWorkingSetBytes < 0) {
    return { failure: 'producer heartbeat working set is missing or invalid' };
  }
  const processResponding = heartbeat.processResponding;
  if (typeof processResponding !== 'boolean') {
    return { failure: 'producer heartbeat response evidence is missing or invalid' };
  }
  const identity = {
    pid: processPid,
    executablePath: processExecutablePath,
  };
  if (pinnedIdentity && identity.pid !== pinnedIdentity.pid) {
    return { failure: `producer PID changed from ${pinnedIdentity.pid} to ${identity.pid}` };
  }
  if (pinnedIdentity && normalizePath(identity.executablePath) !== normalizePath(pinnedIdentity.executablePath)) {
    return { failure: 'producer executable path changed during soak' };
  }
  const value = {
    timestamp,
    identity,
    handleCount: processHandleCount,
    workingSetBytes: processWorkingSetBytes,
    responding: processResponding,
  };
  if (!processResponding) {
    return { value, failure: `producer ElectronApplication PID ${processPid} is not responding` };
  }
  return { value };
}

export function jobCompletionFailure(state: SoakJobState, elapsedMs: number): string | undefined {
  if (state === 'done_unverified') return undefined;
  if (state === 'queued' || state === 'working') {
    return elapsedMs >= JOB_COMPLETION_TIMEOUT_MS
      ? `job completion timed out after ${JOB_COMPLETION_TIMEOUT_MS / 1000}s in ${state}`
      : undefined;
  }
  if (state === 'failed' || state === 'cancelled' || state === 'needs_you' || state === 'waiting') {
    return `job entered disallowed state ${state}`;
  }
  return `job entered unexpected terminal state ${state}`;
}
