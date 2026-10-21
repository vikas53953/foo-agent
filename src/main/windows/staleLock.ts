// Spec: 09-windows §9.5 (single instance; CR-0036 / X-194: a lock a crashed foo left behind is taken over). No Electron
// here: singleInstance.ts gives the seams, so the rule is tested on its own.
/** How long a start waits for a dead foo's lock to free, and how often it asks. */
export const STALE_LOCK_WAIT_MS = 10_000;
const RETRY_MS = 250;

export interface LockSeams {
  request(): boolean;
  /** The pid that held the lock last, or null. */
  readOwner(): number | null;
  writeOwner(pid: number): void;
  alive(pid: number): boolean;
  /** Ends the processes whose parent is `pid` (the dead foo's helpers). */
  endChildren(pid: number): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(evt: string, kind?: string): void;
}

/**
 * `ours`: this process owns the lock. `running`: a live foo owns it (it was told, and shows its window); the caller quits
 * at once (§9.5). A lock whose owner is dead is taken over within STALE_LOCK_WAIT_MS, else `held`.
 */
export type LockResult = 'ours' | 'running' | 'held';

export async function takeLock(s: LockSeams): Promise<LockResult> {
  if (s.request()) {
    s.writeOwner(process.pid);
    return 'ours';
  }
  const owner = s.readOwner();
  if (owner === null || owner === process.pid || s.alive(owner)) return 'running';
  s.log('LOCK_STALE');
  await s.endChildren(owner).catch(() => undefined);
  const until = s.now() + STALE_LOCK_WAIT_MS;
  while (s.now() < until) {
    await s.sleep(RETRY_MS);
    if (s.request()) {
      s.writeOwner(process.pid);
      s.log('LOCK_TAKEN_OVER');
      return 'ours';
    }
    // Two double-clicks after a crash: the other start won and is a live foo now, so it shows the window.
    const now = s.readOwner();
    if (now !== null && now !== owner && now !== process.pid && s.alive(now)) return 'running';
  }
  s.log('LOCK_STALE_HELD', 'TIMEOUT');
  return 'held';
}
