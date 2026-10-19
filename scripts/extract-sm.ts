// Spec: 11-fidelity §11.5 (FID-16/17: `scripts/extract-sm.ts` turns the job machine of 07-journeys-2 §4 with SM-A1…A13 into
// `spec/state-machines.json`: states, events, allowed transitions, side effects, forbidden transitions); 07-2 §4 (table and
// rules), §7.4.3 (SM-A amendments win over the table), 08-0 §F (badge values), §G.2 (checklist card states), §B.2
// (StopReason, WaitingReason), 08-2 §5.4.1 (slots, opens_at), §5.9 (recovery), 08-4 §26.10 (resume after a clean quit),
// 08-1 §2.3 (pauseAll), DECISIONS X-17/X-61 (badge set), X-80 (Stop on a stuck card = CANCELLED). CR-0008 (G-M4-06, G-M4-16,
// G-M4-17). M5 (CR-0009) adds the approval machine of 07-2 §5 with SM-A4…A9, 08-2 §9.1 (expiry per verb), §9.4.2 (fresh
// terms before executing), §5.9 step 2, 08-4 §26.5 (steer), 08-0 §G.7 (Draft rows), X-125, and G-M5-03, -04, -15, -18, -19.
// The machine is written out here from the spec text, then checked against the 07-2 §4 table: every From → To pair the
// table names must be an allowed transition (after the SM-A amendments), so the hand-written rows cannot drift from it.
// Usage: tsx scripts/extract-sm.ts          (writes spec/state-machines.json; only with an approved CR, FID-02)
//        tsx scripts/extract-sm.ts --check  (fails when the file is stale or the 07-2 table names a pair the machine lacks)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SM_PATH = 'spec/state-machines.json';
const JOURNEYS = 'spec/constitution/07-journeys-2.md';

export const JOB_STATES = ['queued', 'working', 'needs_you', 'waiting', 'done', 'done_unverified', 'failed', 'cancelled'] as const;
export type SmJobState = (typeof JOB_STATES)[number];
export const TERMINAL: readonly SmJobState[] = ['done', 'done_unverified', 'failed', 'cancelled'];

/** One allowed transition. `to: null` = the event is allowed but the job's state does not change (retry spawns a new job). */
export interface SmTransition {
  from: SmJobState;
  event: string;
  to: SmJobState | null;
  /** Bubble badge after the move (08-0 §F); null = no badge change. */
  badge: string | null;
  /** Chat pill the move leads to when this is the chat's only job (03-shell-1 §3.4.5). */
  pill: 'needs_you' | 'paused' | 'working' | 'done' | null;
  /** The checklist card's state after the move (08-0 §G.2). */
  checklist: 'live' | 'done' | 'done_unverified' | 'failed' | 'stopped' | null;
  /** Other effects, in words (cards, stop reason, slot, keep-awake). */
  effects: string[];
  source: string;
}

export interface StateMachines {
  version: 1;
  generatedBy: string;
  sources: string[];
  machines: {
    job: {
      states: readonly SmJobState[];
      initial: SmJobState;
      terminal: readonly SmJobState[];
      events: string[];
      transitions: SmTransition[];
      /** Every (from, to) pair that no transition allows; leaving a terminal state is always among them (07-2 §4 rules). */
      forbidden: { from: SmJobState; to: SmJobState }[];
      /** Badge per state (08-0 §F; FID-17 "badge always equals the runner's state"). */
      badgeOf: Record<SmJobState, string>;
      invariants: string[];
    };
    approval: {
      states: readonly SmApprovalState[];
      initial: SmApprovalState;
      terminal: readonly SmApprovalState[];
      events: string[];
      transitions: SmApprovalTransition[];
      forbidden: { from: SmApprovalState; to: SmApprovalState }[];
      /** 08-2 §9.1 minutes from creation, per ApprovalVerb (G-M5-15). */
      expiryMinutes: Record<string, number>;
      invariants: string[];
    };
  };
}

export const APPROVAL_STATES = [
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
] as const;
export type SmApprovalState = (typeof APPROVAL_STATES)[number];
export const APPROVAL_TERMINAL: readonly SmApprovalState[] = ['COMPLETED', 'DECLINED', 'EXPIRED', 'SUPERSEDED', 'WITHDRAWN', 'FAILED'];

/** One allowed approval move. `card` = the copy key (or look) the card shows after it; `effects` = job and row effects. */
export interface SmApprovalTransition {
  from: SmApprovalState;
  event: string;
  to: SmApprovalState;
  card: string;
  effects: string[];
  source: string;
}

const T = (
  from: SmJobState,
  event: string,
  to: SmJobState | null,
  badge: string | null,
  pill: SmTransition['pill'],
  checklist: SmTransition['checklist'],
  effects: string[],
  source: string,
): SmTransition => ({ from, event, to, badge, pill, checklist, effects, source });

const STOPPABLE: SmJobState[] = ['queued', 'working', 'needs_you', 'waiting'];

export const JOB_TRANSITIONS: SmTransition[] = [
  T(
    'queued',
    'slot_free',
    'working',
    'working',
    'working',
    'live',
    [
      'needs count(working) < 3 and the AI verified within 10 min (else a 1-word verify first)',
      'checklist after 1.5 s when step_count ≥ 2',
      'power.keepAwake on',
    ],
    '07-2 §4 row QUEUED → WORKING; 08-2 §5.4.1',
  ),
  ...STOPPABLE.map((from) =>
    T(
      from,
      'stop',
      'cancelled',
      'stopped',
      null,
      'stopped',
      [
        'stop_reason ∈ user_word | user_button | stop_all | window_closed',
        'checklist last row "Stopped by you"',
        'open cards withdrawn',
        'stop report from activity rows',
      ],
      '07-2 §4 row Stop; 08-2 §5.7; CR-0008 G-M4-06',
    ),
  ),
  ...STOPPABLE.map((from) =>
    T(
      from,
      'system_cancel',
      'cancelled',
      'stopped',
      null,
      'stopped',
      ['stop_reason ∈ choice_timeout | signin_timeout | helper_deleted | chat_deleted | wipe | system', 'no "Stopped by you" row'],
      '08-0 §B.2 StopReason; CR-0008 G-M4-06',
    ),
  ),
  T(
    'working',
    'needs_person',
    'needs_you',
    'waiting',
    'needs_you',
    'live',
    ['choice, approval, payment, sign-in, code or secret card', 'current step waiting_user', 'slot released'],
    '07-2 §4; SM-A1; 08-2 §5.4.1',
  ),
  T('working', 'purchase_cap', 'needs_you', 'waiting', 'needs_you', 'live', ['purchase-cap card, no Payment card'], 'SM-A3'),
  T(
    'working',
    'stuck',
    'needs_you',
    'waiting',
    'needs_you',
    'live',
    ['stuck card; ⚠ only in its header', 'stuck_count + 1'],
    '07-2 §4 stuck row; SM-A2; 08-2 §5.6',
  ),
  T(
    'needs_you',
    'answered',
    'working',
    'working',
    'working',
    'live',
    ['card collapses to its answered state', 'step back to running'],
    '07-2 §4 row NEEDS YOU → WORKING',
  ),
  T(
    'needs_you',
    'declined_other_route',
    'working',
    'working',
    'working',
    'live',
    ['"Okay, I won\'t. {next step}"'],
    '07-2 §4 row declined',
  ),
  T(
    'needs_you',
    'declined',
    'cancelled',
    'stopped',
    null,
    'stopped',
    ['stop_reason approval_declined', '"Okay, I won\'t. Nothing else to do here."'],
    '07-2 §4 row declined; G-M4-06',
  ),
  T(
    'needs_you',
    'card_expired',
    'cancelled',
    'stopped',
    null,
    'stopped',
    ['payment or booking card expired: stop_reason approval_expired'],
    '07-2 §4 row card expired; §5',
  ),
  T(
    'needs_you',
    'choice_expired',
    'needs_you',
    null,
    'needs_you',
    'live',
    ['choice card: one reminder, stays NEEDS YOU'],
    '07-2 §4 row card expired',
  ),
  T(
    'needs_you',
    'stuck_stop',
    'cancelled',
    'stopped',
    null,
    'stopped',
    ['stop_reason stuck_stop', 'stuck card stopped', 'activity stopped_job'],
    'SM-A11; X-80; 08-0 §G.16',
  ),
  T('needs_you', 'stuck_timeout', 'failed', 'failed', null, 'failed', ['stuck card timed_out after 15 min without an answer'], 'SM-A11'),
  T(
    'needs_you',
    'recovery_resume',
    'working',
    'working',
    'working',
    'live',
    ['recovery card resumed'],
    '08-2 §5.9 step 3; 08-1 §3.2 recovery:choose',
  ),
  T(
    'working',
    'pause',
    'waiting',
    null,
    'paused',
    'live',
    [
      'waiting_reason ∈ ai_offline | ai_down | ai_signed_out | ai_limit | spend_cap | net_offline | asleep | opens_at',
      'one error card (not for asleep)',
      'no stuck timer',
      'slot released',
    ],
    '07-2 §4 row WORKING → WAITING; SM-A3; 08-2 §5.4.1; CR-0008 G-M4-17',
  ),
  T(
    'working',
    'pause_all',
    'waiting',
    null,
    'paused',
    'live',
    ['waiting_reason app_quit | windows_shutdown (jobs.pauseAll)'],
    '08-1 §2.3 steps 4–5; CR-0008 G-M4-04, G-M4-16',
  ),
  T(
    'waiting',
    'pause',
    'waiting',
    null,
    'paused',
    'live',
    ['the waiting reason changes (for example AI down, then the cap)'],
    '08-2 §5.9 step 4 (condition re-evaluated)',
  ),
  T(
    'waiting',
    'resume',
    'working',
    'working',
    'working',
    'live',
    [
      'app_quit | windows_shutdown | asleep: checklist edit only',
      'other reasons: the error card edited in place "Back on it. Picking up from step {n}."',
      'never a new message',
    ],
    'SM-A10; 08-4 §26.10; CR-0008 G-M4-02',
  ),
  T(
    'waiting',
    'opens_at_missed',
    'failed',
    'failed',
    null,
    'failed',
    ['wake_at passed while foo was closed: thread.trains.tatkal_missed'],
    '08-2 §5.4.1; 08-4 §26.8 item 6',
  ),
  T(
    'working',
    'finish_proof',
    'done',
    'done',
    'done',
    'done',
    ['proof verified from recorded tool results', 'Proof chip, receipt footer'],
    '07-2 §4 row DONE; 08-2 §5.8',
  ),
  T(
    'working',
    'finish_unverified',
    'done_unverified',
    'done_unverified',
    'done',
    'done_unverified',
    ['"Not checked live" on the proof line only'],
    '07-2 §4 row DONE (unverified); SM-A12',
  ),
  T('working', 'fail', 'failed', 'failed', null, 'failed', ['error card with one alternative'], '07-2 §4 row unrecoverable'),
  T(
    'working',
    'crash_recover',
    'needs_you',
    'waiting',
    'needs_you',
    'live',
    ['recovery card (error, variant recovery)'],
    '08-2 §5.9 step 3',
  ),
  T(
    'queued',
    'crash_recover',
    'needs_you',
    'waiting',
    'needs_you',
    'live',
    ['recovery card (error, variant recovery)'],
    '08-2 §5.9 step 3',
  ),
  T(
    'failed',
    'retry',
    null,
    null,
    null,
    null,
    ['a new job origin=retry, origin_ref = this job, title "Trying again: {title}"; this job never returns to WORKING'],
    '07-2 §4 rules; AT-120; CR-0008 G-M4-01',
  ),
  T(
    'cancelled',
    'retry',
    null,
    null,
    null,
    null,
    ['a new job origin=retry, origin_ref = this job, title "Trying again: {title}"'],
    '07-2 §4 rules; AT-120; CR-0008 G-M4-01',
  ),
];

const A = (
  from: SmApprovalState,
  event: string,
  to: SmApprovalState,
  card: string,
  effects: string[],
  source: string,
): SmApprovalTransition => ({ from, event, to, card, effects, source });

export const APPROVAL_TRANSITIONS: SmApprovalTransition[] = [
  A(
    'PENDING',
    'approve',
    'APPROVED',
    'cards.approval.body.approved ("Approved by you at {time}. Doing it now…", SM-A6 absolute time)',
    [
      'tap or keyboard on the card only (never typed words, a reaction or a notification; Ctrl+Enter never approves)',
      'approved_at, approved_via card|rule, scope (once unless use_app/calendar_write, else SCOPE_NOT_ALLOWED)',
      'a Draft card Send = approve once, approved_via card, undo_until = now + 5 s (X-65)',
      'big pay: Windows Hello or the typed amount first (SM-A9, M10)',
    ],
    '07-2 §5 Approve tap; SM-A6, SM-A8, SM-A9; 08-1 §3.2 card:approve, draft:send',
  ),
  A(
    'PENDING',
    'decline',
    'DECLINED',
    'cards.approval.body.declined ("You said no. Nothing was {sent|booked|…}.")',
    [
      'never auto-retried',
      'job → cancelled (stop_reason approval_declined), or working when another route exists',
      'reply "Okay, I won\'t. {next step}"',
    ],
    '07-2 §5 No / Not now; 08-2 §5.2; AT-110, AT-126',
  ),
  A(
    'PENDING',
    'expire',
    'EXPIRED',
    'cards.approval.body.expired ("This expired at {time}. Nothing was {sent|booked}.") + [ Ask me again ]',
    [
      'expires_at reached (1 s timer in main, runs with the window closed; or found expired at start, 08-2 §5.9 step 2)',
      'job: pay/buy/book → cancelled (stop_reason approval_expired); every other verb stays needs_you',
      'never auto-retried; Ask me again re-checks live terms first and builds a fresh card',
    ],
    '07-2 §5 timer ends; 08-2 §9.1, §5.9 step 2; AT-111, AT-121, AT-127',
  ),
  A(
    'PENDING',
    'terms_changed',
    'SUPERSEDED',
    'cards.approval.body.superseded ("The {price|time|recipient|fee} changed, so I stopped. See the new card below.") with the old value struck',
    ['new PENDING card in the same transaction (supersedes_id / superseded_by)', 'job stays needs_you'],
    '07-2 §5 terms changed before Approve; 08-2 §9.4.2; AT-124',
  ),
  A(
    'PENDING',
    'steer',
    'SUPERSEDED',
    'cards.approval.line.superseded_steer ("You changed something, so I stopped. See the new card below.")',
    ['superseded_by stays NULL until the new card exists', 'job → working'],
    '08-4 §26.5; AT-077b',
  ),
  A(
    'PENDING',
    'withdraw',
    'WITHDRAWN',
    'cards.approval.body.withdrawn ("No longer needed. The job was stopped.")',
    ['the job was cancelled elsewhere (Stop, Stop all, a deleted chat or helper)'],
    '07-2 §5 job cancelled elsewhere; AT-128',
  ),
  A(
    'HELD',
    'withdraw',
    'WITHDRAWN',
    'cards.approval.body.withdrawn ("No longer needed. The job was stopped.")',
    ['the job was cancelled while the held card waited on the user; nothing ran'],
    'CR-0009 G-M5-18 (a held card waits on the user like a pending one)',
  ),
  A(
    'APPROVED',
    'withdraw',
    'WITHDRAWN',
    'cards.approval.body.withdrawn ("No longer needed. The job was stopped.")',
    ['the job was stopped during the undo window, the second look or the fresh-terms check; nothing was submitted'],
    '08-2 §5.7 step 3 (open approvals of the job → WITHDRAWN); CR-0009 G-M5-18',
  ),
  A(
    'APPROVED',
    'second_look_held',
    'HELD',
    'cards.approval.held.mismatch | held.cannot_check | held.no_user_words (--warn-soft strip, Warning icon, word "Check", SM-A4)',
    [
      'second look found a mismatch, could not check (AI away, invalid twice, 20 s), or found no user words (08-4 §28.3)',
      'no main ack of the RUNNING write-ahead in 2 s → the engine treats the approval as HELD(cannot_check)',
      'approvals.second_look = SecondLookResult; nothing ran',
    ],
    '07-2 §5 second look fails; SM-A4; 08-2 §9.6; 08-4 §28.4, §29.1; AT-123',
  ),
  A(
    'HELD',
    'held_pick_action',
    'APPROVED',
    'cards.approval.body.approved',
    ["card:heldPick on the action's value; then second look and live terms again before RUNNING"],
    '07-2 §5 HELD → user picks → APPROVED; 08-1 §3.2 card:heldPick',
  ),
  A(
    'HELD',
    'held_pick_own',
    'DECLINED',
    'cards.approval.body.declined',
    ["card:heldPick on the user's own value; the job re-prepares and posts a fresh PENDING card"],
    '07-2 §5 HELD → user picks → DECLINED; CR-0009 G-M5-03 (08-2 §9.6 aligned); AT-123',
  ),
  A(
    'HELD',
    'expire',
    'EXPIRED',
    'cards.approval.body.expired',
    ['expires_at reached while held (or found expired at start); nothing executes (fail closed)'],
    '08-2 §5.9 step 2; CR-0009 G-M5-04',
  ),
  A(
    'APPROVED',
    'submit',
    'RUNNING',
    'buttons replaced by the spinner line (cards.approval.body.approved stays)',
    [
      'second look passed and live terms unchanged (X-125 order)',
      'write-ahead submitted_at via approval.transition before the one irreversible call; main acks',
    ],
    '07-2 §5 APPROVED → RUNNING; 08-2 §9.6, §10.4; 08-4 §29.1; X-125',
  ),
  A(
    'APPROVED',
    'terms_changed',
    'SUPERSEDED',
    'cards.approval.body.superseded',
    ['live terms re-read immediately before executing differ from fields → new PENDING card; nothing ran'],
    '08-2 §9.4.2 ("again immediately before executing"); X-125 (second look → liveTermsCheck → RUNNING)',
  ),
  A(
    'APPROVED',
    'draft_undo',
    'PENDING',
    'the Draft card is back to pending with "Not sent. The draft is still here."',
    [
      'draft:undo before undo_until and before submitted_at; same approvals row (approvals.card_id is UNIQUE)',
      'approved_at, approved_via and undo_until cleared; new card nonce; expires_at = now + 60 min',
      'after undo_until: TOO_LATE, no move',
    ],
    '05-2 §5.7 Undo tapped ("a fresh PENDING approval, expiry reset to 60 min"); 08-0 §G.7; CR-0009 G-M5-19',
  ),
  A(
    'RUNNING',
    'proof_ok',
    'COMPLETED',
    '"✓ {Sent|Booked|Deleted|Shared|Allowed} · {time}" + proof chip; --ok CheckmarkCircle + word (SM-A5)',
    ['completed_at, proof; activity row with approvedHow and proof_kind/ref'],
    '07-2 §5 proof ok; SM-A5',
  ),
  A(
    'RUNNING',
    'checkout_changed',
    'SUPERSEDED',
    'cards.approval.superseded.price_changed ("The price changed from {a} to {b} at checkout, so I stopped. Nothing was paid.")',
    ['new PENDING card; nothing was paid'],
    '07-2 §5 checkout total ≠ approved total; 08-2 §9.4.2',
  ),
  A(
    'RUNNING',
    'submit_failed',
    'FAILED',
    'FAILED copy (bank said no / "{Site} didn\'t accept it.") with 1.5px --bad edge + ErrorCircle (SM-A5) and one fix button',
    ['failure_kind'],
    '07-2 §5 declined by bank / site error; SM-A5',
  ),
  A(
    'RUNNING',
    'result_unknown',
    'CHECKING',
    '"Checking whether this went through… Don\'t tap again." --warn Clock + word (SM-A5)',
    ['never re-submits'],
    '07-2 §5 submit result unknown; SM-A5; 08-2 §10.5',
  ),
  A(
    'CHECKING',
    'proof_found',
    'COMPLETED',
    'COMPLETED copy',
    ['proof found within 15 min (pay) / the booking email look (10 min)'],
    '07-2 §5 CHECKING → COMPLETED; 08-2 §10.5',
  ),
  A(
    'CHECKING',
    'no_proof',
    'FAILED',
    '"I couldn\'t confirm it. Check your bank app before trying again." + [ It went through ] [ It didn\'t ]',
    ['outcome kept on the activity row only'],
    '07-2 §5 CHECKING → FAILED and rules',
  ),
];

export const APPROVAL_EVENT_NAMES = [...new Set(APPROVAL_TRANSITIONS.map((t) => t.event))];

export const APPROVAL_EXPIRY: Record<string, number> = {
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

function approvalForbidden(transitions: SmApprovalTransition[]): { from: SmApprovalState; to: SmApprovalState }[] {
  const allowed = new Set(transitions.map((t) => `${t.from}>${t.to}`));
  return APPROVAL_STATES.flatMap((from) => APPROVAL_STATES.filter((to) => !allowed.has(`${from}>${to}`)).map((to) => ({ from, to })));
}

/** The 07-2 §5 diagram edges, each with the words it is drawn with; checkApprovalAgainstSpec finds the words in §5. */
export const APPROVAL_DIAGRAM: { from: SmApprovalState; to: SmApprovalState; words: string }[] = [
  { from: 'PENDING', to: 'APPROVED', words: 'Approve tap' },
  { from: 'PENDING', to: 'WITHDRAWN', words: 'job cancelled elsewhere' },
  { from: 'PENDING', to: 'SUPERSEDED', words: 'terms changed before Approve' },
  { from: 'PENDING', to: 'DECLINED', words: 'No / Not now' },
  { from: 'PENDING', to: 'EXPIRED', words: 'timer ends' },
  { from: 'APPROVED', to: 'HELD', words: 'second look (G17) fails' },
  { from: 'HELD', to: 'APPROVED', words: 'user picks ──► APPROVED or DECLINED' },
  { from: 'HELD', to: 'DECLINED', words: 'user picks ──► APPROVED or DECLINED' },
  { from: 'RUNNING', to: 'SUPERSEDED', words: 'checkout total ≠ approved total' },
  { from: 'RUNNING', to: 'CHECKING', words: 'submit result unknown' },
  { from: 'CHECKING', to: 'COMPLETED', words: 'CHECKING ──► COMPLETED or FAILED' },
  { from: 'CHECKING', to: 'FAILED', words: 'CHECKING ──► COMPLETED or FAILED' },
  { from: 'RUNNING', to: 'FAILED', words: 'declined by bank / site error' },
  { from: 'RUNNING', to: 'COMPLETED', words: 'proof ok' },
];

export const JOB_EVENTS = [...new Set(JOB_TRANSITIONS.map((t) => t.event))];

export const BADGE_OF: Record<SmJobState, string> = {
  queued: 'seen',
  working: 'working',
  needs_you: 'waiting',
  waiting: 'working',
  done: 'done',
  done_unverified: 'done_unverified',
  failed: 'failed',
  cancelled: 'stopped',
};

export function forbiddenPairs(transitions: SmTransition[]): { from: SmJobState; to: SmJobState }[] {
  const allowed = new Set(transitions.filter((t) => t.to !== null).map((t) => `${t.from}>${t.to}`));
  return JOB_STATES.flatMap((from) => JOB_STATES.filter((to) => !allowed.has(`${from}>${to}`)).map((to) => ({ from, to })));
}

export function buildMachines(): StateMachines {
  return {
    version: 1,
    generatedBy: 'scripts/extract-sm.ts',
    sources: [
      '07-journeys-2 §4 (job machine and table)',
      '07-journeys-2 §7.4.3 SM-A1…A13',
      '08-0 §F, §G.2, §B.2',
      '08-2 §5.4–§5.9',
      '08-4 §26.10',
      '08-1 §2.3',
      'DECISIONS X-17, X-61, X-80, X-124',
      'CR-0008',
      '07-journeys-2 §5 (approval machine and state table), SM-A4…A9',
      '08-2 §9.1, §9.4.2, §9.6, §10.4–§10.5; 08-4 §26.5, §28.3–§28.4, §29.1; 08-0 §G.7',
      'DECISIONS X-65, X-125',
      'CR-0009',
    ],
    machines: {
      job: {
        states: JOB_STATES,
        initial: 'queued',
        terminal: TERMINAL,
        events: JOB_EVENTS,
        transitions: JOB_TRANSITIONS,
        forbidden: forbiddenPairs(JOB_TRANSITIONS),
        badgeOf: BADGE_OF,
        invariants: [
          'never working after done, done_unverified, failed or cancelled',
          'done only with a verified proof; done_unverified only with no proof or an unverified flag',
          "the bubble badge always equals badgeOf[the runner's state]",
          'only the job runner moves jobs.state (db.tx transition); AI text never does (ART-12a)',
          'at most 3 jobs working at once',
        ],
      },
      approval: {
        states: APPROVAL_STATES,
        initial: 'PENDING',
        terminal: APPROVAL_TERMINAL,
        events: APPROVAL_EVENT_NAMES,
        transitions: APPROVAL_TRANSITIONS,
        forbidden: approvalForbidden(APPROVAL_TRANSITIONS),
        expiryMinutes: APPROVAL_EXPIRY,
        invariants: [
          "only main's ApprovalGate writes approvals.state; any other move is APPROVAL_BAD_TRANSITION, logged (08-2 §9.1)",
          'no approval leaves PENDING without a tap or keyboard event on the card (Art. 3, 6; FID-17)',
          'at most one irreversible call per approval id: RUNNING is written ahead of it and never re-entered (FID-17)',
          'cards.state of an approval card equals approvals.state, written in the same transaction (08-1 §4.5.1)',
          'a final state is never left; EXPIRED and DECLINED never auto-retry',
        ],
      },
    },
  };
}

const STATE_WORDS: [RegExp, SmJobState][] = [
  [/DONE \(unverified\)/g, 'done_unverified'],
  [/NEEDS YOU/g, 'needs_you'],
  [/QUEUED/g, 'queued'],
  [/WORKING/g, 'working'],
  [/WAITING/g, 'waiting'],
  [/CANCELLED/g, 'cancelled'],
  [/FAILED/g, 'failed'],
  [/\bDONE\b/g, 'done'],
];

function statesIn(cell: string): SmJobState[] {
  let rest = cell;
  const out: SmJobState[] = [];
  for (const [re, s] of STATE_WORDS) {
    if (re.test(rest)) out.push(s);
    re.lastIndex = 0;
    rest = rest.replace(re, ' ');
  }
  return out;
}

/** The (from, to) pairs of the 07-2 §4 job table, with SM-A11 applied (the table's own Stop-on-stuck text already says CANCELLED). */
export function tablePairs(md: string): { from: SmJobState; to: SmJobState; row: string }[] {
  const start = md.indexOf('| From | Event | To | What the user sees |');
  if (start < 0) throw new Error('07-2 §4 job table not found');
  const end = md.indexOf('\nRules:', start);
  const rows = md
    .slice(start, end)
    .split('\n')
    .slice(2)
    .filter((l) => l.startsWith('|'));
  const out: { from: SmJobState; to: SmJobState; row: string }[] = [];
  for (const row of rows) {
    const [from = '', , to = ''] = row
      .split('|')
      .slice(1)
      .map((c) => c.trim());
    for (const f of statesIn(from)) for (const t of statesIn(to)) out.push({ from: f, to: t, row });
  }
  return out;
}

export function checkAgainstTable(md: string, machines: StateMachines): string[] {
  const allowed = new Set(machines.machines.job.transitions.map((t) => `${t.from}>${t.to}`));
  return tablePairs(md)
    .filter((p) => !allowed.has(`${p.from}>${p.to}`))
    .map((p) => `07-2 §4 names ${p.from} → ${p.to} (${p.row.slice(0, 60)}…), which the machine does not allow`);
}

/** The 07-2 §5 approval section: the states its table names and the diagram edges must all be in the approval machine. */
export function checkApprovalAgainstSpec(md: string, machines: StateMachines): string[] {
  const start = md.indexOf('### 5. State machine: an APPROVAL CARD');
  const end = md.indexOf('\n---', start);
  if (start < 0 || end < 0) return ['07-2 §5 approval section not found'];
  const section = md.slice(start, end);
  const m = machines.machines.approval;
  const problems: string[] = [];
  const tableStart = section.indexOf('| State | Card looks like | Copy |');
  for (const row of section.slice(tableStart).split('\n').slice(2)) {
    if (!row.startsWith('|')) break;
    const cell = row.split('|')[1]?.trim() ?? '';
    for (const word of cell.split(/[^A-Z]+/).filter(Boolean))
      if (!m.states.includes(word as SmApprovalState)) problems.push(`07-2 §5 table names ${word}, which the approval machine lacks`);
  }
  const allowed = new Set(m.transitions.map((t) => `${t.from}>${t.to}`));
  for (const e of APPROVAL_DIAGRAM) {
    if (!section.includes(e.words)) problems.push(`07-2 §5 no longer draws "${e.words}" (${e.from} → ${e.to})`);
    if (!allowed.has(`${e.from}>${e.to}`)) problems.push(`07-2 §5 draws ${e.from} → ${e.to}, which the approval machine lacks`);
  }
  return problems;
}

export const serialise = (m: StateMachines) => JSON.stringify(m, null, 2) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const machines = buildMachines();
  const md = readFileSync(JOURNEYS, 'utf8');
  const problems = [...checkAgainstTable(md, machines), ...checkApprovalAgainstSpec(md, machines)];
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (readFileSync(SM_PATH, 'utf8') !== serialise(machines)) {
      console.error(`${SM_PATH} is stale: run tsx scripts/extract-sm.ts (with a CR)`);
      process.exit(1);
    }
    console.log('state machines fresh');
  } else {
    writeFileSync(SM_PATH, serialise(machines));
    const { job, approval } = machines.machines;
    console.log(`${SM_PATH}: job machine ${job.transitions.length} transitions, approval machine ${approval.transitions.length}`);
  }
}
