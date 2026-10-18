// M4 T6 shell wiring on runner-written rows: G-M4-07 (`slow` = no step finished for 60 s, derived from the running step's
// started_at / the last steps.finished_at; 08-2 §5.6), AT-281 (Doing now tabs on rows the runner moved), AT-286 (folded
// helper row 24 h after its last job ended DONE, X-153), AT-287 ("Working on {job}…" / "Waiting to start {job}…", X-154),
// 08-5 §5 rule 2 (job:upsert rev rule) and spend:update (Spent this month reads the newest summary).
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbOp } from '../../src/engine/protocol';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { stepProgressAt } from '../../src/main/db/rows';
import { migrate, type Db } from '../../src/main/store/db';
import { chatRowById, jobRows } from '../../src/main/store/queries';
import { isFolded } from '../../src/renderer/chatlist/rules';
import { previewParts } from '../../src/renderer/chatlist/preview';
import { doingRows, doneRows } from '../../src/renderer/shell/doingNowRows';
import { initialChats, upsertChatReducer } from '../../src/renderer/store/chats';
import { initialJobs, upsertJobReducer } from '../../src/renderer/store/jobs';
import { initialSpend, updateSpendReducer } from '../../src/renderer/store/spend';
import type { SpendSummary } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST
const S = 1_000;
const H = 3_600_000;
const TZ = 'Asia/Kolkata';
const PV = { typing: false, isOpen: false, setupComplete: true };
const ctx = (now: number) => ({ now, agentName: 'foo', draftPrefix: 'Draft:' });

let db: Db;
let dataDir: string;
const tx = (ops: DbOp[], now = NOW) => {
  const r = applyDbOps(db, ops, { now, dataDir });
  if (!r.result.ok) throw new Error(JSON.stringify(r.result));
  return r;
};
const job = (id: string, title: string, state = 'queued', over: Record<string, unknown> = {}): DbOp => ({
  op: 'insert',
  table: 'jobs',
  row: {
    id,
    chat_id: 'c_h',
    origin_chat_id: 'c_h',
    owner_kind: 'helper',
    owner_id: 'h_1',
    title,
    origin: 'user',
    intent: 'read_only',
    state,
    created_at: NOW,
    ...over,
  },
});
const move = (id: string, from: string[], to: string, set?: Record<string, unknown>): DbOp => ({
  op: 'transition',
  table: 'jobs',
  id,
  from,
  to,
  ...(set ? { set } : {}),
});
const step = (id: string, jobId: string, idx: number, state: string, over: Record<string, unknown> = {}): DbOp => ({
  op: 'insert',
  table: 'steps',
  row: { id, job_id: jobId, idx, phrase_key: 'searching', slots: { site: 'irctc.co.in' }, state, ...over },
});
const one = (id: string, now: number) => jobRows(db, 'id = ?', [id], now)[0]!;
const chat = (now: number) => chatRowById(db, ctx(now), 'c_h')!;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  db.transaction(() => {
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_foo', 'foo', 'foo', ?, ?)").run(NOW, NOW);
    db.prepare(
      "INSERT INTO chats (id, kind, helper_id, title, last_activity_at, created_at) VALUES ('c_h', 'helper', 'h_1', 'Trips', ?, ?)",
    ).run(NOW - 48 * H, NOW - 48 * H);
    db.prepare(
      `INSERT INTO helpers (id, name, job_text, face_ref, color_token, allowed_apps, chat_id, created_at)
       VALUES ('h_1', 'Trips', 'Plans trips', 'face:1', '--h-teal', '{}', 'c_h', ?)`,
    ).run(NOW - 48 * H);
  })();
  dataDir = mkdtempSync(join(tmpdir(), 'foo-m4-t6-'));
});

describe('G-M4-07: slow = no step finished for 60 s (derived, no column)', () => {
  it('stepProgressAt is the later of the running step start and the last finished step', () => {
    expect(
      stepProgressAt([
        { state: 'done', started_at: 1, finished_at: 5 },
        { state: 'running', started_at: 7, finished_at: null },
      ]),
    ).toBe(7);
    expect(
      stepProgressAt([
        { state: 'done', started_at: 1, finished_at: 9 },
        { state: 'running', started_at: 7, finished_at: null },
      ]),
    ).toBe(9);
    expect(stepProgressAt([{ state: 'pending', started_at: null, finished_at: null }])).toBeNull();
  });

  it('tool progress (last_progress_at) does not hide a step that has run 60 s without finishing', () => {
    tx([job('j_1', 'Train to Pune', 'queued')]);
    tx([move('j_1', ['queued'], 'working', { started_at: NOW, step_count: 2, current_step_idx: 1 })]);
    tx([
      step('s_0', 'j_1', 0, 'done', { started_at: NOW, finished_at: NOW + 5 * S }),
      step('s_1', 'j_1', 1, 'running', { started_at: NOW + 5 * S }),
    ]);
    // the runner moves last_progress_at on every tool result; the old rule read only that column
    tx([{ op: 'update', table: 'jobs', id: 'j_1', set: { last_progress_at: NOW + 60 * S } }]);
    expect(one('j_1', NOW + 64 * S).slow).toBe(false);
    expect(one('j_1', NOW + 65 * S).slow).toBe(true);
  });

  it('a step finishing resets the 60 s; only WORKING jobs are slow; no steps yet counts from started_at', () => {
    tx([job('j_1', 'Train to Pune', 'queued')]);
    tx([move('j_1', ['queued'], 'working', { started_at: NOW })]);
    expect(one('j_1', NOW + 59 * S).slow).toBe(false);
    expect(one('j_1', NOW + 60 * S).slow).toBe(true);
    tx([step('s_0', 'j_1', 0, 'done', { started_at: NOW, finished_at: NOW + 50 * S })]);
    expect(one('j_1', NOW + 100 * S).slow).toBe(false);
    tx([move('j_1', ['working'], 'needs_you')]);
    expect(one('j_1', NOW + 500 * S).slow).toBe(false);
  });
});

describe('list preview follows the runner (X-154)', () => {
  it('QUEUED "Waiting to start", WORKING "Working on", back to the normal preview when the job ends', () => {
    tx([job('j_1', 'Flights for 12 Dec', 'queued')]);
    expect(previewParts(chat(NOW), PV)).toMatchObject({ rule: 'queued', text: 'Waiting to start Flights for 12 Dec…' });
    tx([move('j_1', ['queued'], 'working', { started_at: NOW })]);
    expect(previewParts(chat(NOW), PV)).toMatchObject({ rule: 'working', text: 'Working on Flights for 12 Dec…' });
    tx([move('j_1', ['working'], 'done', { finished_at: NOW + H })]);
    expect(previewParts(chat(NOW + H), PV).rule).not.toMatch(/working|queued/);
  });
});

describe('chat:upsert after a job write carries a new rev (08-5 §5 rule 2)', () => {
  it('QUEUED → WORKING keeps the pill but changes the preview, so the renderer must take the row', () => {
    tx([job('j_1', 'Flights for 12 Dec', 'queued')]);
    const s = initialChats();
    upsertChatReducer(s, chat(NOW));
    tx([move('j_1', ['queued'], 'working', { started_at: NOW })]);
    upsertChatReducer(s, chat(NOW));
    expect(s.byId.c_h!.list.preview).toEqual({ rule: 'working', jobTitle: 'Flights for 12 Dec' });
  });
});

describe('folded helper row on runner rows (X-153)', () => {
  it('folds 24 h after the last job ended DONE: 25 h folded, 23 h not; a new job unfolds it', () => {
    tx([job('j_1', 'Flights for 12 Dec', 'queued')]);
    tx([move('j_1', ['queued'], 'working', { started_at: NOW })]);
    tx([move('j_1', ['working'], 'done', { finished_at: NOW })]);
    expect(isFolded(chat(NOW + 23 * H), NOW + 23 * H)).toBe(false);
    expect(isFolded(chat(NOW + 25 * H), NOW + 25 * H)).toBe(true);
    tx([job('j_2', 'Hotel in Goa', 'queued')], NOW + 25 * H);
    expect(isFolded(chat(NOW + 25 * H), NOW + 25 * H)).toBe(false);
  });

  it('a job that ended FAILED does not fold the row', () => {
    tx([job('j_1', 'Flights for 12 Dec', 'queued')]);
    tx([move('j_1', ['queued'], 'working', { started_at: NOW })]);
    tx([move('j_1', ['working'], 'failed', { finished_at: NOW })]);
    expect(isFolded(chat(NOW + 25 * H), NOW + 25 * H)).toBe(false);
  });
});

describe('Doing now tabs on runner rows (X-148)', () => {
  it('In progress shows the live jobs; Done shows the last 7 days newest first, not the 8-day-old one', () => {
    tx([job('j_old', 'Old trip', 'queued', { created_at: NOW - 9 * 24 * H })], NOW - 9 * 24 * H);
    tx([move('j_old', ['queued'], 'working')], NOW - 8 * 24 * H);
    tx([move('j_old', ['working'], 'done', { finished_at: NOW - 8 * 24 * H })], NOW - 8 * 24 * H);
    for (const [id, ago] of [
      ['j_a', 3],
      ['j_b', 2],
      ['j_c', 1],
    ] as const) {
      tx([job(id, `Done ${id}`, 'queued')], NOW - ago * 24 * H);
      tx([move(id, ['queued'], 'working')], NOW - ago * 24 * H);
      tx([move(id, ['working'], id === 'j_b' ? 'failed' : 'done', { finished_at: NOW - ago * 24 * H })], NOW - ago * 24 * H);
    }
    tx([job('j_w1', 'Working one', 'queued'), job('j_w2', 'Working two', 'queued')]);
    tx([move('j_w1', ['queued'], 'working', { started_at: NOW }), move('j_w2', ['queued'], 'working', { started_at: NOW + 1 })]);

    const jobs = jobRows(db, "chat_id = 'c_h'", [], NOW);
    expect(doingRows(jobs, NOW, TZ).rows.map((j) => j.id)).toEqual(['j_w2', 'j_w1']);
    expect(doneRows(jobs, NOW).rows.map((j) => j.id)).toEqual(['j_c', 'j_b', 'j_a']);
  });

  it('the jobs slice takes a newer rev and ignores a stale one (08-5 §5 rule 2)', () => {
    tx([job('j_1', 'Flights for 12 Dec', 'queued')]);
    const queued = one('j_1', NOW);
    tx([move('j_1', ['queued'], 'working', { started_at: NOW })]);
    const working = one('j_1', NOW);
    const s = initialJobs();
    upsertJobReducer(s, working);
    upsertJobReducer(s, queued);
    expect(s.byId.j_1!.state).toBe('working');
    expect(s.byChat.c_h).toEqual(['j_1']);
  });
});

describe('spend:update (03-shell-2 §3.7.3.4)', () => {
  const summary = (month: string, aiSpentPaise: number): SpendSummary => ({
    month,
    aiSpentPaise,
    aiCapPaise: 100_000,
    aiBilling: 'key',
    purchasesPaise: 0,
    purchaseCapPaise: 2_500_000,
    purchaseCount: 0,
    byChat: [],
    byRoutine: [],
    purchases: [],
    earliestMonth: '2026-09',
  });
  it('a summary for this month replaces the last one; a late one for an older month is ignored', () => {
    const s = initialSpend();
    updateSpendReducer(s, summary('2026-10', 21_200));
    updateSpendReducer(s, summary('2026-10', 22_000));
    expect(s.summary?.aiSpentPaise).toBe(22_000);
    updateSpendReducer(s, summary('2026-09', 90_000));
    expect(s.summary).toMatchObject({ month: '2026-10', aiSpentPaise: 22_000 });
    updateSpendReducer(s, summary('2026-11', 0));
    expect(s.summary?.month).toBe('2026-11');
  });
});
