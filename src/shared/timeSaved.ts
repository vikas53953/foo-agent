// Spec: CR-0021 pick 14 (X-179): time saved is a fixed table, never a guess by the AI (Article 12). One step-kind enum
// (`StepKind`: search, read, fill, send, sign_in, pay, wait) drives both the checklist icons (pick 12) and this table. Per
// finished step: search 2, read (or compare) a page 3, fill a form 6, send a message or email 3, sign in 2, pay or book 5,
// wait 0 min; summed, rounded to the nearest 5 and shown only when ≥ 5 min (pick 13: the DONE card line). Kinds are given
// to the 08-4 §26.1 phrase keys; runner-only rows (took over, stopped, blocked) and `generic_working` have no kind.
import { isPhraseKey, type PhraseKey } from './phrases';
import type { StepRow } from './types';

export const STEP_KINDS = ['search', 'read', 'fill', 'send', 'sign_in', 'pay', 'wait'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** Pick 14: minutes per finished step of each kind. */
export const STEP_MINUTES: Readonly<Record<StepKind, number>> = { search: 2, read: 3, fill: 6, send: 3, sign_in: 2, pay: 5, wait: 0 };

const KIND_OF_PHRASE: Readonly<Record<PhraseKey, StepKind | null>> = {
  read_app: 'read',
  read_email: 'read',
  check_calendar: 'read',
  look_web: 'search',
  check_sites: 'read',
  check_site: 'read',
  wait_site: 'wait',
  look_for: 'search',
  compare: 'read',
  shortlist: 'read',
  wait_pick: 'wait',
  wait_approve: 'wait',
  show_before: 'wait',
  wait_signin: 'sign_in',
  fill_details: 'fill',
  book: 'pay',
  book_calendar: 'pay',
  pay: 'pay',
  add_calendar: 'fill',
  draft: 'fill',
  writing: 'fill',
  send: 'send',
  make_file: 'fill',
  use_pc: null,
  find_proof: 'read',
  blocked_try_next: null,
  took_over: null,
  stopped: null,
  find_trains: 'search',
  sign_in: 'sign_in',
  fill_passengers: 'fill',
  get_fare: 'read',
  wait_opens: 'wait',
  read_plans: 'read',
  read_bill: 'read',
  generic_working: null,
};

/** The kind of a stored step's phrase key; null for runner-only rows, the fallback phrase and unknown keys. */
export function stepKind(phraseKey: string): StepKind | null {
  return isPhraseKey(phraseKey) ? KIND_OF_PHRASE[phraseKey] : null;
}

const ROUND_TO = 5;
const SHOW_FROM = 5;

/**
 * Pick 14: minutes saved by the job's finished (`done`) steps, rounded to the nearest 5, or null when the sum is under
 * 5 min (the line is hidden). A skipped or failed step saved nothing.
 */
export function minutesSaved(steps: readonly Pick<StepRow, 'phraseKey' | 'state'>[]): number | null {
  const sum = steps.reduce((n, s) => {
    const kind = s.state === 'done' ? stepKind(s.phraseKey) : null;
    return n + (kind ? STEP_MINUTES[kind] : 0);
  }, 0);
  return sum < SHOW_FROM ? null : Math.round(sum / ROUND_TO) * ROUND_TO;
}
