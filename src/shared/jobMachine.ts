// Spec: 07-journeys-2 §4 (job state machine; only the runner moves it; never back to WORKING from FAILED or CANCELLED), §7.4.3
// SM-A1…A13 (amendments win), 08-0 §F (badge per state), 08-1 §2.4.1 (`transition` op → DB_BAD_TRANSITION), 11-fidelity
// FID-16/17. CR-0008 (G-M4-01, -04, -06, -16, -17). One table for the engine's runner and main's db.tx guard; FID-16 checks it
// against spec/state-machines.json (scripts/extract-sm.ts) cell by cell.
import type { BadgeValue, JobState } from './types';

export const JOB_STATES: readonly JobState[] = [
  'queued',
  'working',
  'needs_you',
  'waiting',
  'done',
  'done_unverified',
  'failed',
  'cancelled',
];
export const TERMINAL: ReadonlySet<JobState> = new Set<JobState>(['done', 'done_unverified', 'failed', 'cancelled']);

export type JobEvent =
  | 'slot_free'
  | 'stop'
  | 'system_cancel'
  | 'needs_person'
  | 'purchase_cap'
  | 'stuck'
  | 'answered'
  | 'declined_other_route'
  | 'declined'
  | 'card_expired'
  | 'choice_expired'
  | 'stuck_stop'
  | 'stuck_timeout'
  | 'recovery_resume'
  | 'pause'
  | 'pause_all'
  | 'resume'
  | 'opens_at_missed'
  | 'finish_proof'
  | 'finish_unverified'
  | 'fail'
  | 'crash_recover'
  | 'retry';

const LIVE: JobState[] = ['queued', 'working', 'needs_you', 'waiting'];

/** event → (from → to). `null` = allowed, the state stays (retry makes a new linked job, AT-120). */
export const JOB_EVENTS: Record<JobEvent, Partial<Record<JobState, JobState | null>>> = {
  slot_free: { queued: 'working' },
  stop: Object.fromEntries(LIVE.map((s) => [s, 'cancelled'])),
  system_cancel: Object.fromEntries(LIVE.map((s) => [s, 'cancelled'])),
  needs_person: { working: 'needs_you' },
  purchase_cap: { working: 'needs_you' },
  stuck: { working: 'needs_you' },
  answered: { needs_you: 'working' },
  declined_other_route: { needs_you: 'working' },
  declined: { needs_you: 'cancelled' },
  card_expired: { needs_you: 'cancelled' },
  choice_expired: { needs_you: 'needs_you' },
  stuck_stop: { needs_you: 'cancelled' },
  stuck_timeout: { needs_you: 'failed' },
  recovery_resume: { needs_you: 'working' },
  pause: { working: 'waiting', waiting: 'waiting' },
  pause_all: { working: 'waiting' },
  resume: { waiting: 'working' },
  opens_at_missed: { waiting: 'failed' },
  finish_proof: { working: 'done' },
  finish_unverified: { working: 'done_unverified' },
  fail: { working: 'failed' },
  crash_recover: { working: 'needs_you', queued: 'needs_you' },
  retry: { failed: null, cancelled: null },
};

/** The state an event leads to; `undefined` when the event is not allowed in that state. */
export function nextState(from: JobState, event: JobEvent): JobState | null | undefined {
  const row = JOB_EVENTS[event];
  return from in row ? row[from] : undefined;
}

const ALLOWED = new Set(
  Object.values(JOB_EVENTS).flatMap((row) =>
    Object.entries(row)
      .filter(([, to]) => to !== null)
      .map(([from, to]) => `${from}>${to}`),
  ),
);

/** The db.tx `transition` guard (08-1 §2.4.1): may `jobs.state` move from → to? Nothing ever leaves a terminal state. */
export function canTransition(from: string, to: string): boolean {
  return ALLOWED.has(`${from}>${to}`);
}

/** 08-0 §F: the badge of the bubble that started a job in each state (FID-17 "badge = runner state"). */
export const BADGE_OF_STATE: Record<JobState, BadgeValue> = {
  queued: 'seen',
  working: 'working',
  needs_you: 'waiting',
  waiting: 'working',
  done: 'done',
  done_unverified: 'done_unverified',
  failed: 'failed',
  cancelled: 'stopped',
};
