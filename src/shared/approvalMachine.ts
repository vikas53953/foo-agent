// Spec: 07-journeys-2 §5 (approval machine; the authoritative diagram and state table), §7.4.3 SM-A4…A9; 08-2 §9.1 (only
// main's ApprovalGate writes approvals.state, anything off the table is APPROVAL_BAD_TRANSITION; expiry per verb), §9.4.2
// (fresh terms before executing), §5.9 step 2 (expired PENDING/HELD at start → EXPIRED); 08-4 §26.5 (steer supersedes a
// PENDING card), 08-0 §G.7 (Draft = approval row at creation, 60 min; X-65), X-125 (after APPROVED: second look →
// liveTermsCheck → write-ahead RUNNING). CR-0009 (G-M5-03, -04, -15, -18, -19). One table for main's ApprovalGate and the
// engine's gate; FID-16 checks it against spec/state-machines.json (scripts/extract-sm.ts) cell by cell.
import type { ApprovalState, ApprovalVerb } from './types';

export const APPROVAL_STATES: readonly ApprovalState[] = [
  'PENDING',
  'APPROVED',
  'RUNNING',
  'COMPLETED',
  'HELD',
  'CHECKING',
  'DECLINED',
  'EXPIRED',
  'SUPERSEDED',
  'WITHDRAWN',
  'FAILED',
];
/** Single use: nothing leaves these (EXPIRED and DECLINED never auto-retry; "Ask me again" builds a fresh card). */
export const APPROVAL_TERMINAL: ReadonlySet<ApprovalState> = new Set<ApprovalState>([
  'COMPLETED',
  'DECLINED',
  'EXPIRED',
  'SUPERSEDED',
  'WITHDRAWN',
  'FAILED',
]);

export type ApprovalEvent =
  | 'approve'
  | 'decline'
  | 'expire'
  | 'terms_changed'
  | 'steer'
  | 'withdraw'
  | 'second_look_held'
  | 'held_pick_action'
  | 'held_pick_own'
  | 'submit'
  | 'proof_ok'
  | 'checkout_changed'
  | 'submit_failed'
  | 'result_unknown'
  | 'proof_found'
  | 'no_proof'
  | 'draft_undo';

/** event → (from → to). */
export const APPROVAL_EVENTS: Record<ApprovalEvent, Partial<Record<ApprovalState, ApprovalState>>> = {
  approve: { PENDING: 'APPROVED' },
  decline: { PENDING: 'DECLINED' },
  expire: { PENDING: 'EXPIRED', HELD: 'EXPIRED' },
  terms_changed: { PENDING: 'SUPERSEDED', APPROVED: 'SUPERSEDED' },
  steer: { PENDING: 'SUPERSEDED' },
  withdraw: { PENDING: 'WITHDRAWN', HELD: 'WITHDRAWN', APPROVED: 'WITHDRAWN' },
  second_look_held: { APPROVED: 'HELD' },
  held_pick_action: { HELD: 'APPROVED' },
  held_pick_own: { HELD: 'DECLINED' },
  submit: { APPROVED: 'RUNNING' },
  proof_ok: { RUNNING: 'COMPLETED' },
  checkout_changed: { RUNNING: 'SUPERSEDED' },
  submit_failed: { RUNNING: 'FAILED' },
  result_unknown: { RUNNING: 'CHECKING' },
  proof_found: { CHECKING: 'COMPLETED' },
  no_proof: { CHECKING: 'FAILED' },
  draft_undo: { APPROVED: 'PENDING' },
};

/** The state an event leads to; `undefined` when the event is not allowed in that state. */
export function nextApproval(from: ApprovalState, event: ApprovalEvent): ApprovalState | undefined {
  return APPROVAL_EVENTS[event][from];
}

const ALLOWED = new Set(Object.values(APPROVAL_EVENTS).flatMap((row) => Object.entries(row).map(([from, to]) => `${from}>${to}`)));

/** main's `approval.transition` guard (08-2 §9.1): may `approvals.state` move from → to? Else APPROVAL_BAD_TRANSITION. */
export function canApprovalTransition(from: string, to: string): boolean {
  return ALLOWED.has(`${from}>${to}`);
}

/** 08-2 §9.1 expiry minutes from creation (G-M5-15: use_app and calendar_write 60, 05-2 §5.5.2; buy is the pay row). */
export const APPROVAL_EXPIRY_MIN: Record<ApprovalVerb, number> = {
  pay: 10,
  buy: 10,
  book: 15,
  send: 60,
  post: 60,
  delete: 60,
  share: 60,
  switch: 60,
  use_app: 60,
  calendar_write: 60,
};

export const expiryMinutes = (verb: ApprovalVerb): number => APPROVAL_EXPIRY_MIN[verb];

/** `expires_at` for a new approval (a Draft's row: 60 min from the draft's creation, 08-0 §G.7). */
export const approvalExpiresAt = (verb: ApprovalVerb, createdAt: number): number => createdAt + expiryMinutes(verb) * 60_000;
