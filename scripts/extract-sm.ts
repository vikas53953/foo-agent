// Spec: 11-fidelity §11.5 (FID-16/17: `scripts/extract-sm.ts` turns the job machine of 07-journeys-2 §4 with SM-A1…A13 into
// `spec/state-machines.json`: states, events, allowed transitions, side effects, forbidden transitions); 07-2 §4 (table and
// rules), §7.4.3 (SM-A amendments win over the table), 08-0 §F (badge values), §G.2 (checklist card states), §B.2
// (StopReason, WaitingReason), 08-2 §5.4.1 (slots, opens_at), §5.9 (recovery), 08-4 §26.10 (resume after a clean quit),
// 08-1 §2.3 (pauseAll), DECISIONS X-17/X-61 (badge set), X-80 (Stop on a stuck card = CANCELLED). CR-0008 (G-M4-06, G-M4-16,
// G-M4-17). The approval machine (07-2 §5) is added by M5.
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
  };
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

export const serialise = (m: StateMachines) => JSON.stringify(m, null, 2) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const machines = buildMachines();
  const problems = checkAgainstTable(readFileSync(JOURNEYS, 'utf8'), machines);
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
    console.log(`${SM_PATH}: job machine, ${machines.machines.job.transitions.length} transitions`);
  }
}
