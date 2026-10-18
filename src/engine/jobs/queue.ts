// Spec: 08-2 §5.4.1 (3 WORKING slots; NEEDS_YOU and WAITING release the slot; when a slot frees the oldest startable queued
// job starts, FIFO by created_at; start needs the AI verified within 10 min, else a verify call first), 08-4 §26.8 items 1–3
// (a queued browser job also needs one of the 3 job windows; no waiting_reason while queued). Pure: the runner calls these.
import type { JobState } from '../../shared/types';

export const MAX_WORKING = 3;
export const MAX_JOB_WINDOWS = 3;
export const VERIFY_FRESH_MS = 10 * 60_000;

export interface QueueJob {
  id: string;
  state: JobState;
  createdAt: number;
  usesBrowser: boolean;
  /** A NEEDS_YOU job whose card is answered and waits for a slot to resume (resolved_at of its card). */
  answeredAt?: number;
}

/**
 * The jobs to start now within the free WORKING slots and job windows: answered NEEDS_YOU jobs first (oldest answer first;
 * they started before and the user is waiting on them), then queued jobs oldest first.
 */
export function pickStartable(jobs: readonly QueueJob[], openWindows: number): string[] {
  let free = MAX_WORKING - jobs.filter((j) => j.state === 'working').length;
  let windows = MAX_JOB_WINDOWS - openWindows;
  const out: string[] = [];
  const resumable = jobs
    .filter((j) => j.state === 'needs_you' && j.answeredAt !== undefined)
    .sort((a, b) => a.answeredAt! - b.answeredAt! || a.id.localeCompare(b.id));
  const queued = jobs.filter((j) => j.state === 'queued').sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const j of [...resumable, ...queued]) {
    if (free <= 0) break;
    if (j.usesBrowser) {
      if (windows <= 0) continue;
      windows -= 1;
    }
    free -= 1;
    out.push(j.id);
  }
  return out;
}

/** AT-106: a verify call runs first unless the AI was verified within the last 10 min. */
export function needsVerify(lastVerifiedAt: number | undefined, now: number): boolean {
  return lastVerifiedAt === undefined || now - lastVerifiedAt > VERIFY_FRESH_MS;
}
