// Spec: 08-1 §3.2 job rows (`job:stop` → StopReport, `job:stopAll { confirm: true }`, `job:retry` → `{ newJobId }`,
// `plan:go | plan:change`, `stuck:choose`, `recovery:choose`, each `{ cardId; nonce; …; resolvedBy }` → CardRow), X-124 (an
// invoke that drives the engine sends exactly one MainToEngine message), 08-1 §2.4 (`job.stop`, `job.stopAll`, `job.retry`,
// `card.answered`), 08-2 §5.7 step 4 (the stop report is built only from activity rows: done rows of kinds sent, paid,
// booked, deleted), G-M4-01 (retry = a new linked job; main allocates its id, the old job never moves; 05-3 §5.16 "Check
// for real" is the same linked job from done_unverified), G-M4-09 / CR-0008
// (`error:fix`: main checks the action against the card's payload), 05-3 §5.19 (Take over only when the job uses the
// browser), §5.21 (the Spend-cap card's "Wait until" ends it as dismissed). Main only checks and forwards: every state change
// is the runner's (Art. 12), written back through db.tx and seen as card:upsert / job:upsert.
import { fail, ok, type Result } from '../../shared/errors';
import type { CardAnswerReq, InvokeIn, InvokeOut } from '../../shared/ipc';
import { TERMINAL } from '../../shared/jobMachine';
import type { ActivityRow, CardRow, CardType, ErrorPayload, FixAction, JobState, StopReport, StuckPayload } from '../../shared/types';
import { NAMED_QUERIES } from '../db/queries';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import { cardRow, type DbRow } from '../db/rows';
import type { Db } from '../store/db';

export const JOB_CHANNELS = [
  'job:stop',
  'job:stopAll',
  'job:retry',
  'plan:go',
  'plan:change',
  'stuck:choose',
  'recovery:choose',
  'error:fix',
] as const;
/** 08-5 §3.7 FixAction kinds (the `error:fix` payload is checked against the card, so the IPC schema needs only the kind). */
export const FIX_ACTION_KINDS = [
  'retry',
  'sign_in_ai',
  'remind_at',
  'replace_key',
  'use_backup',
  'raise_cap',
  'try_other_way',
  'take_over',
  'stop',
  'resume_job',
  'start_normally',
  'reconnect',
  'link_whatsapp',
  'allow_scope',
  'open_url',
  'open_settings',
  'open_chat',
  'repair_app',
  'try_another_card',
  'pay_with_upi',
  'checked_try_again',
  'dismiss',
] as const satisfies readonly FixAction['kind'][];
export type JobChannel = (typeof JOB_CHANNELS)[number];
export type JobHandlers = { [C in JobChannel]: (req: InvokeIn[C]) => Result<InvokeOut[C]> };

export interface JobIpcDeps {
  db: Db;
  /** EngineBridge (send is a no-op returning false while no engine is connected). */
  engine: Pick<EngineBridge, 'live' | 'send'> | undefined;
  now(): number;
  /** G-M4-01: the retry job's id, allocated by main. */
  newJobId(): string;
  /** No engine connected (FOO_TEST without the fake AI, or M1-style runs): main cancels the row itself, as M1 did. */
  stopWithoutEngine(jobId: string): Result<StopReport>;
}

/** 08-2 §5.7 step 4: the actions a stop report lists. */
const REPORTED: readonly ActivityRow['kind'][] = ['sent', 'paid', 'booked', 'deleted'];
/** 05-1 §0.5: a card is open until it is resolved; these are the open states of the M4 cards main answers for. */
const OPEN: Partial<Record<CardType, readonly string[]>> = {
  plan: ['pending'],
  stuck: ['asking'],
  error: ['shown', 'asking'],
  spend_cap: ['shown'],
};

const sameAction = (a: FixAction, b: FixAction | undefined) => !!b && JSON.stringify(a) === JSON.stringify(b);

/** How long a sent job.retry blocks a second one for the same job (the runner writes the new row well within it). */
export const RETRY_IN_FLIGHT_MS = 30_000;

export function jobIpc(d: JobIpcDeps): JobHandlers {
  const { db } = d;
  const retrying = new Map<string, number>();

  const jobState = (jobId: string) =>
    db.prepare('SELECT state, uses_browser FROM jobs WHERE id = ?').get(jobId) as { state: JobState; uses_browser: number } | undefined;

  const report = (jobId: string): StopReport => {
    const done = NAMED_QUERIES.activityForJob({ db, now: d.now() }, jobId).filter((a) => a.outcome === 'done' && REPORTED.includes(a.kind));
    return { jobId, done, nothingDone: done.length === 0 };
  };

  /** The open card of `types`, with the nonce the renderer holds; nothing is sent when this fails. */
  const openCard = (req: CardAnswerReq, types: readonly CardType[]): Result<CardRow> => {
    const r = db.prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(req.cardId) as DbRow | undefined;
    if (!r) return fail('NOT_FOUND');
    const card = cardRow(r);
    if (!types.includes(card.type)) return fail('VALIDATION');
    if (card.nonce !== req.nonce || card.resolvedAt !== null || !OPEN[card.type]?.includes(card.state)) return fail('CARD_STALE');
    return ok(card);
  };

  const answer = (card: CardRow, req: CardAnswerReq, choice: string, text?: string): Result<CardRow> => {
    const sent = d.engine?.send('card.answered', {
      cardId: card.id,
      choice,
      ...(text !== undefined ? { text } : {}),
      resolvedBy: req.resolvedBy,
    });
    return sent ? ok(card) : fail('UNKNOWN', 'engine not running');
  };

  const plan =
    (choice: 'go' | 'change') =>
    (req: CardAnswerReq & { text?: string }): Result<CardRow> => {
      const c = openCard(req, ['plan']);
      return c.ok ? answer(c.value, req, choice, req.text) : c;
    };

  return {
    'job:stop': ({ jobId }) => {
      const j = jobState(jobId);
      if (!j || TERMINAL.has(j.state)) return fail('JOB_GONE');
      if (!d.engine?.live) return d.stopWithoutEngine(jobId);
      if (!d.engine.send('job.stop', { jobId, by: 'user', reason: 'user_button' })) return fail('UNKNOWN', 'engine not running');
      return ok(report(jobId));
    },
    'job:stopAll': () => {
      const ids = (db.prepare('SELECT id, state FROM jobs ORDER BY created_at, id').all() as { id: string; state: JobState }[])
        .filter((j) => !TERMINAL.has(j.state))
        .map((j) => j.id);
      if (!d.engine?.send('job.stopAll', { by: 'user' })) return fail('UNKNOWN', 'engine not running');
      return ok(ids.map(report));
    },
    'job:retry': ({ jobId }) => {
      const j = jobState(jobId);
      if (!j) return fail('JOB_GONE');
      // G-M4-01: Try again on a failed or stopped job; 05-3 §5.16 "Check for real" on a done-but-unverified one (a new linked job).
      if (j.state !== 'failed' && j.state !== 'cancelled' && j.state !== 'done_unverified') return fail('VALIDATION');
      // One retry per old job, as the runner keeps it (the new job is the one to retry): refuse here so the button never spins.
      if (d.db.prepare("SELECT 1 FROM jobs WHERE origin = 'retry' AND origin_ref = ?").get(jobId)) return fail('VALIDATION');
      // A double tap before the engine writes the new row: one job.retry per old job while it is in flight (T5-12: the
      // mark lapses after RETRY_IN_FLIGHT_MS, when the runner has written the row or refused the retry).
      const sentAt = retrying.get(jobId);
      if (sentAt !== undefined && d.now() - sentAt < RETRY_IN_FLIGHT_MS) return fail('VALIDATION');
      const newJobId = d.newJobId();
      if (!d.engine?.send('job.retry', { jobId, newJobId })) return fail('UNKNOWN', 'engine not running');
      retrying.set(jobId, d.now());
      return ok({ newJobId });
    },
    'plan:go': plan('go'),
    'plan:change': plan('change'),
    'stuck:choose': (req) => {
      const c = openCard(req, ['stuck']);
      if (!c.ok) return c;
      const p = c.value.payload as unknown as StuckPayload;
      if (req.choice === 'other_way' && !p.allowOtherWay) return fail('VALIDATION');
      if (req.choice === 'take_over' && !(c.value.jobId && jobState(c.value.jobId)?.uses_browser)) return fail('VALIDATION');
      return answer(c.value, req, req.choice);
    },
    'recovery:choose': (req) => {
      const c = openCard(req, ['error']);
      if (!c.ok) return c;
      if ((c.value.payload as unknown as ErrorPayload).variant !== 'recovery') return fail('VALIDATION');
      return answer(c.value, req, req.choice);
    },
    'error:fix': (req) => {
      const c = openCard(req, ['error', 'spend_cap']);
      if (!c.ok) return c;
      if (c.value.type === 'spend_cap') return req.action.kind === 'dismiss' ? answer(c.value, req, 'dismiss') : fail('VALIDATION');
      const p = c.value.payload as unknown as ErrorPayload;
      if (!sameAction(req.action, p.button?.action) && !sameAction(req.action, p.secondary?.action)) return fail('VALIDATION');
      return answer(c.value, req, req.action.kind);
    },
  };
}
