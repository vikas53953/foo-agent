// M4 T5 job IPC (CR-0008): 08-1 §3.2 rows `job:stop | stopAll | retry`, `plan:go | change`, `stuck:choose`,
// `recovery:choose`, and G-M4-09 `error:fix`. X-124: every invoke sends exactly one MainToEngine message; main checks the
// card (type, open, nonce) first and sends nothing when the check fails. `job:retry` allocates the new job id (G-M4-01).
// The stop report is built only from activity rows (08-2 §5.7 step 4: done rows of kinds sent, paid, booked, deleted).
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { mainToEngineSchema, type DbOp } from '../../src/engine/protocol';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { jobIpc, type JobIpcDeps } from '../../src/main/jobs/jobIpc';
import { migrate, type Db } from '../../src/main/store/db';
import { ok } from '../../src/shared/errors';
import { INVOKE_CHANNELS } from '../../src/shared/ipc';

const NOW = 1_760_000_000_000;

let db: Db;
let sent: { kind: string; payload: unknown }[];
let live: boolean;
let fallback: string[];
let h: ReturnType<typeof jobIpc>;

const tx = (ops: DbOp[]) => {
  const r = applyDbOps(db, ops, { now: NOW, dataDir: mkdtempSync(join(tmpdir(), 'foo-t5-')) }).result;
  if (!r.ok) throw new Error(r.error.kind);
};
const job = (id: string, state: string, extra: Record<string, unknown> = {}): DbOp => ({
  op: 'insert',
  table: 'jobs',
  row: {
    id,
    chat_id: 'c_1',
    origin_chat_id: 'c_1',
    owner_kind: 'foo',
    title: 'Goa stay',
    origin: 'user',
    intent: 'do',
    state,
    created_at: NOW,
    ...extra,
  },
});
const card = (id: string, type: string, state: string, payload: Record<string, unknown>, jobId: string | null = 'j_1'): DbOp[] => [
  {
    op: 'insert',
    table: 'messages',
    row: { id: `m_${id}`, chat_id: 'c_1', author_kind: 'foo', kind: 'card', card_id: id, status: 'complete', created_at: NOW },
  },
  {
    op: 'insert',
    table: 'cards',
    row: { id, chat_id: 'c_1', message_id: `m_${id}`, job_id: jobId, type, state, payload, nonce: 'n1', created_at: NOW },
  },
];
const EVENT: Record<string, string> = {
  sent: 'sent_email',
  paid: 'paid',
  booked: 'booked',
  deleted: 'deleted_email',
  changed: 'cap_changed',
};
/** Activity rows are written by the runner's `activity` op; the test writes them directly to know their ids. */
const activity = (id: string, kind: string, outcome: string) =>
  db
    .prepare(
      `INSERT INTO activity (id, at, kind, event, actor, chat_id, job_id, summary, outcome) VALUES (?, ?, ?, ?, 'foo', 'c_1', 'j_1', ?, ?)`,
    )
    .run(id, NOW, kind, EVENT[kind], `Did ${id}`, outcome);

const PLAN = { title: 'Goa stay', steps: ['Check Booking.com'], minutes: 6, costLine: '₹4', big: false };
const STUCK = {
  whatsWrong: 'MakeMyTrip keeps sending me back',
  spentLine: 'about ₹6 of your AI · 9 minutes',
  suggestion: 'try Booking.com instead',
  allowOtherWay: true,
};
const errorPayload = (variant: 'error' | 'recovery', button: Record<string, unknown>, secondary?: Record<string, unknown>) => ({
  variant,
  kind: variant === 'recovery' ? 'CRASH_RECOVERY' : 'AI_SERVICE_DOWN',
  whatHappened: 'Claude isn’t answering right now.',
  whatIsSafe: 'Your Goa job is saved at step 3. Nothing was booked or paid.',
  button: { label: 'Try again', action: button },
  ...(secondary ? { secondary: { label: 'Use ChatGPT instead', action: secondary } } : {}),
  jobId: 'j_1',
});

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', ?, ?)").run(NOW, NOW);
  sent = [];
  live = true;
  fallback = [];
  const deps: JobIpcDeps = {
    db,
    engine: {
      get live() {
        return live;
      },
      send: (kind, payload) => {
        if (!live) return false;
        sent.push({ kind, payload });
        return true;
      },
    },
    now: () => NOW,
    newJobId: () => 'j_new',
    stopWithoutEngine: (jobId) => {
      fallback.push(jobId);
      return ok({ jobId, done: [], nothingDone: true });
    },
  };
  h = jobIpc(deps);
});

/** Every message main sent must be a valid MainToEngine row (08-1 §2.4: zod-checked on receipt). */
function expectOneValidSend(kind: string, payload: unknown) {
  expect(sent).toEqual([{ kind, payload }]);
  expect(mainToEngineSchema.safeParse({ id: 'me1', kind, payload }).success).toBe(true);
}

describe('job:stop, job:stopAll (08-1 §3.2, J18; X-124)', () => {
  it('sends one job.stop by the user button and reports what was done from activity rows only', () => {
    tx([job('j_1', 'working')]);
    activity('a1', 'sent', 'done');
    activity('a2', 'paid', 'failed');
    activity('a3', 'changed', 'done');
    const r = h['job:stop']({ jobId: 'j_1' });
    expectOneValidSend('job.stop', { jobId: 'j_1', by: 'user', reason: 'user_button' });
    expect(r.ok && r.value.jobId).toBe('j_1');
    expect(r.ok && r.value.nothingDone).toBe(false);
    expect(r.ok && (r.value.done as { id: string }[]).map((a) => a.id)).toEqual(['a1']);
  });

  it('says nothing was done when no sent, paid, booked or deleted row is done', () => {
    tx([job('j_1', 'needs_you')]);
    activity('a2', 'booked', 'failed');
    const r = h['job:stop']({ jobId: 'j_1' });
    expect(r).toEqual({ ok: true, value: { jobId: 'j_1', done: [], nothingDone: true } });
    expect(sent).toHaveLength(1);
  });

  it('answers JOB_GONE for an unknown or finished job and sends nothing', () => {
    tx([job('j_1', 'done')]);
    expect(h['job:stop']({ jobId: 'j_1' })).toEqual({ ok: false, error: { kind: 'JOB_GONE' } });
    expect(h['job:stop']({ jobId: 'j_x' })).toEqual({ ok: false, error: { kind: 'JOB_GONE' } });
    expect(sent).toEqual([]);
  });

  it('without a running engine keeps the M1 stop (row cancelled by main), never a lost message', () => {
    tx([job('j_1', 'working')]);
    live = false;
    expect(h['job:stop']({ jobId: 'j_1' }).ok).toBe(true);
    expect(fallback).toEqual(['j_1']);
    expect(sent).toEqual([]);
  });

  it('job:stopAll sends one job.stopAll and returns one report per live job', () => {
    tx([job('j_1', 'working'), job('j_2', 'queued'), job('j_3', 'done')]);
    activity('a1', 'deleted', 'done');
    const r = h['job:stopAll']({ confirm: true });
    expectOneValidSend('job.stopAll', { by: 'user' });
    expect(r.ok && r.value.map((s) => [s.jobId, s.nothingDone])).toEqual([
      ['j_1', false],
      ['j_2', true],
    ]);
  });
});

describe('job:retry (08-1 §3.2, X-124, G-M4-01)', () => {
  it('main allocates the new job id and sends one job.retry; the old job is untouched', () => {
    tx([job('j_1', 'failed')]);
    expect(h['job:retry']({ jobId: 'j_1' })).toEqual({ ok: true, value: { newJobId: 'j_new' } });
    expectOneValidSend('job.retry', { jobId: 'j_1', newJobId: 'j_new' });
    expect((db.prepare("SELECT state FROM jobs WHERE id = 'j_1'").get() as { state: string }).state).toBe('failed');
  });

  it('works for a cancelled job and for “Check for real” on a done-unverified one; refuses a running job; JOB_GONE for an unknown one', () => {
    tx([job('j_1', 'cancelled', { stop_reason: 'user_button' }), job('j_2', 'working'), job('j_3', 'done_unverified')]);
    expect(h['job:retry']({ jobId: 'j_1' }).ok).toBe(true);
    expect(h['job:retry']({ jobId: 'j_3' }).ok).toBe(true);
    sent.pop();
    expect(h['job:retry']({ jobId: 'j_2' })).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    expect(h['job:retry']({ jobId: 'j_x' })).toEqual({ ok: false, error: { kind: 'JOB_GONE' } });
    expect(sent).toHaveLength(1);
  });
});

describe('plan:go, plan:change (05-3 §5.12, 08-1 §3.2)', () => {
  beforeEach(() => tx([job('j_1', 'queued'), ...card('k_plan', 'plan', 'pending', PLAN)]));

  it('Go sends one card.answered with choice go and returns the card', () => {
    const r = h['plan:go']({ cardId: 'k_plan', nonce: 'n1', resolvedBy: 'tap' });
    expectOneValidSend('card.answered', { cardId: 'k_plan', choice: 'go', resolvedBy: 'tap' });
    expect(r.ok && r.value.id).toBe('k_plan');
  });

  it('Change plan carries the typed text', () => {
    h['plan:change']({ cardId: 'k_plan', nonce: 'n1', text: 'cheaper please', resolvedBy: 'keyboard' });
    expectOneValidSend('card.answered', { cardId: 'k_plan', choice: 'change', text: 'cheaper please', resolvedBy: 'keyboard' });
  });

  it('a wrong nonce or an answered card is CARD_STALE; a missing card NOT_FOUND; another type VALIDATION; nothing sent', () => {
    expect(h['plan:go']({ cardId: 'k_plan', nonce: 'other', resolvedBy: 'tap' })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    expect(h['plan:go']({ cardId: 'k_none', nonce: 'n1', resolvedBy: 'tap' })).toEqual({ ok: false, error: { kind: 'NOT_FOUND' } });
    tx([...card('k_stuck', 'stuck', 'asking', STUCK)]);
    expect(h['plan:go']({ cardId: 'k_stuck', nonce: 'n1', resolvedBy: 'tap' })).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    tx([{ op: 'transition', table: 'cards', id: 'k_plan', from: ['pending'], to: 'go' }]);
    expect(h['plan:go']({ cardId: 'k_plan', nonce: 'n1', resolvedBy: 'tap' })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    expect(sent).toEqual([]);
  });

  it('with no engine running the answer is refused, not dropped', () => {
    live = false;
    expect(h['plan:go']({ cardId: 'k_plan', nonce: 'n1', resolvedBy: 'tap' }).ok).toBe(false);
  });
});

describe('stuck:choose (05-3 §5.19, X-80)', () => {
  it('sends the choice; Stop is one card.answered (the runner cancels with stuck_stop)', () => {
    tx([job('j_1', 'needs_you', { uses_browser: 1 }), ...card('k_s', 'stuck', 'asking', STUCK)]);
    h['stuck:choose']({ cardId: 'k_s', nonce: 'n1', choice: 'stop', resolvedBy: 'tap' });
    expectOneValidSend('card.answered', { cardId: 'k_s', choice: 'stop', resolvedBy: 'tap' });
  });

  it('refuses a button the card does not show: Try another way when the runner disallowed it, Take over without the browser', () => {
    tx([job('j_1', 'needs_you'), ...card('k_s', 'stuck', 'asking', { ...STUCK, allowOtherWay: false })]);
    expect(h['stuck:choose']({ cardId: 'k_s', nonce: 'n1', choice: 'other_way', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(h['stuck:choose']({ cardId: 'k_s', nonce: 'n1', choice: 'take_over', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(sent).toEqual([]);
  });
});

describe('recovery:choose (05-3 §5.20 crash recovery, J19.5)', () => {
  it('resume or stop on a recovery error card sends one card.answered', () => {
    tx([job('j_1', 'needs_you'), ...card('k_r', 'error', 'asking', errorPayload('recovery', { kind: 'resume_job' }, { kind: 'stop' }))]);
    h['recovery:choose']({ cardId: 'k_r', nonce: 'n1', choice: 'resume', resolvedBy: 'tap' });
    expectOneValidSend('card.answered', { cardId: 'k_r', choice: 'resume', resolvedBy: 'tap' });
  });

  it('an ordinary error card is not a recovery card', () => {
    tx([job('j_1', 'waiting'), ...card('k_e', 'error', 'asking', errorPayload('error', { kind: 'retry' }))]);
    expect(h['recovery:choose']({ cardId: 'k_e', nonce: 'n1', choice: 'resume', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
  });
});

describe('error:fix (G-M4-09, CR-0008)', () => {
  beforeEach(() =>
    tx([job('j_1', 'waiting'), ...card('k_e', 'error', 'asking', errorPayload('error', { kind: 'retry' }, { kind: 'use_backup' }))]),
  );

  it('sends the action the card carries (its button or its link) as one card.answered', () => {
    h['error:fix']({ cardId: 'k_e', nonce: 'n1', action: { kind: 'use_backup' }, resolvedBy: 'tap' });
    expectOneValidSend('card.answered', { cardId: 'k_e', choice: 'use_backup', resolvedBy: 'tap' });
  });

  it('refuses an action the card does not carry', () => {
    expect(h['error:fix']({ cardId: 'k_e', nonce: 'n1', action: { kind: 'dismiss' }, resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(h['error:fix']({ cardId: 'k_e', nonce: 'n1', action: { kind: 'remind_at', at: NOW }, resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(sent).toEqual([]);
  });

  it('the Spend-cap card’s “Wait until” is a dismiss on the same channel (05-3 §5.21 state dismissed)', () => {
    tx([...card('k_cap', 'spend_cap', 'shown', { which: 'ai', capPaise: 100_000, spentPaise: 100_000 }, null)]);
    h['error:fix']({ cardId: 'k_cap', nonce: 'n1', action: { kind: 'dismiss' }, resolvedBy: 'tap' });
    expectOneValidSend('card.answered', { cardId: 'k_cap', choice: 'dismiss', resolvedBy: 'tap' });
  });
});

describe('the channels are registered in the shared contract (08-1 §3.1.0)', () => {
  it('lists every T5 channel', () => {
    for (const c of ['job:stopAll', 'job:retry', 'plan:go', 'plan:change', 'stuck:choose', 'recovery:choose', 'error:fix'] as const)
      expect(INVOKE_CHANNELS).toContain(c);
    expect(Object.keys(h).sort()).toEqual(
      ['error:fix', 'job:retry', 'job:stop', 'job:stopAll', 'plan:change', 'plan:go', 'recovery:choose', 'stuck:choose'].sort(),
    );
  });
});
