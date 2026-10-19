// M4 T1 contracts (CR-0008): 08-1 §2.4.1 db.tx (one transaction; transition → DB_BAD_TRANSITION; stale expectRev →
// DB_STALE_REV; jobs.state only by transition), §4.5.1 (card states validated → VALIDATION), §4.6 rules 2 and 7 (redaction;
// chats.pill re-derived in the same transaction), §4.1.2 (mirrors temp + replace), §3.3 (job:upsert, card:upsert), the
// NamedQuery names of 08-1 §2.4.1, the M4 MainToEngine / EngineToMain rows, and the 08-4 §26.1 phrase catalogue.
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { engineToMainSchema, mainToEngineSchema, NAMED_QUERY_NAMES, type DbOp } from '../../src/engine/protocol';
import { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { NAMED_QUERIES } from '../../src/main/db/queries';
import { migrate, type Db } from '../../src/main/store/db';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { PHRASES, phraseCopyKey, phraseText, resolvePhrase, RUNNER_ONLY } from '../../src/shared/phrases';
import { TID } from '../../src/shared/testids';
import copy from '../../src/shared/copy/en-IN.json';

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;

let db: Db;
let dataDir: string;
const tx = (ops: DbOp[], now = NOW) => applyDbOps(db, ops, { now, dataDir });
const job = (id: string) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown>;
const pill = () =>
  db.prepare("SELECT pill, pill_until FROM chats WHERE id = 'c_1'").get() as { pill: string | null; pill_until: number | null };

const jobRow = (id: string, state = 'queued'): DbOp => ({
  op: 'insert',
  table: 'jobs',
  row: {
    id,
    chat_id: 'c_1',
    origin_chat_id: 'c_1',
    owner_kind: 'foo',
    title: 'Finding bills',
    origin: 'user',
    intent: 'read_only',
    state,
    created_at: NOW,
  },
});
const cardOps = (id: string, type: string, state: string, payload: Record<string, unknown> = {}): DbOp[] => [
  {
    op: 'insert',
    table: 'messages',
    row: { id: `m_${id}`, chat_id: 'c_1', author_kind: 'foo', kind: 'card', card_id: id, status: 'complete', created_at: NOW },
  },
  {
    op: 'insert',
    table: 'cards',
    row: { id, chat_id: 'c_1', message_id: `m_${id}`, type, state, payload, nonce: 'n1', created_at: NOW },
  },
];
const move = (id: string, from: string[], to: string, set?: Record<string, unknown>): DbOp => ({
  op: 'transition',
  table: 'jobs',
  id,
  from,
  to,
  set,
});

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', ?, ?)").run(NOW, NOW);
  dataDir = mkdtempSync(join(tmpdir(), 'foo-m4-'));
});

describe('db.tx transition (08-1 §2.4.1, 07-2 §4)', () => {
  it('moves a job queued → working → done and re-derives the chat pill in the same transaction', () => {
    expect(tx([jobRow('j_1')]).result).toEqual({ ok: true, value: { ids: ['j_1'], revs: [1] } });
    expect(pill()).toEqual({ pill: 'working', pill_until: null });
    expect(tx([move('j_1', ['queued'], 'working', { started_at: NOW })]).result).toEqual({ ok: true, value: { ids: ['j_1'], revs: [2] } });
    expect(job('j_1')).toMatchObject({ state: 'working', started_at: NOW, rev: 2 });
    const done = tx([move('j_1', ['working'], 'done', { finished_at: NOW + 5 })], NOW + 5);
    expect(done.result.ok).toBe(true);
    expect(done.effects.jobIds).toEqual(new Set(['j_1']));
    expect(job('j_1').state).toBe('done');
    expect(pill()).toEqual({ pill: 'done', pill_until: NOW + 5 + DAY });
  });

  it('refuses done → working with DB_BAD_TRANSITION and rolls back every op of the transaction', () => {
    tx([jobRow('j_1', 'done')]);
    const r = tx([jobRow('j_2'), move('j_1', ['done'], 'working')]);
    expect(r.result).toMatchObject({ ok: false, error: { kind: 'DB_BAD_TRANSITION' } });
    expect(job('j_1').state).toBe('done');
    expect(job('j_2')).toBeUndefined();
    expect(r.effects.jobIds.size).toBe(0);
  });

  it('refuses a move whose current state is not in `from`, and every move out of a final state', () => {
    tx([jobRow('j_1', 'working')]);
    expect(tx([move('j_1', ['queued'], 'working')]).result).toMatchObject({ ok: false, error: { kind: 'DB_BAD_TRANSITION' } });
    for (const final of ['done', 'done_unverified', 'failed', 'cancelled']) {
      tx([jobRow(`j_${final}`, final)]);
      for (const to of ['queued', 'working', 'needs_you', 'waiting', 'done', 'failed', 'cancelled'])
        expect(tx([move(`j_${final}`, [final], to)]).result.ok).toBe(false);
    }
  });

  it('jobs.state moves only by transition: an update naming it is DB_NOT_WRITABLE', () => {
    tx([jobRow('j_1')]);
    expect(tx([{ op: 'update', table: 'jobs', id: 'j_1', set: { state: 'working' } }]).result).toMatchObject({
      ok: false,
      error: { kind: 'DB_NOT_WRITABLE' },
    });
    expect(tx([move('j_1', ['queued'], 'working', { state: 'done' })]).result).toMatchObject({
      ok: false,
      error: { kind: 'DB_NOT_WRITABLE' },
    });
  });

  it('an update with a stale expectRev is DB_STALE_REV; a fresh one bumps rev', () => {
    tx([jobRow('j_1')]);
    expect(tx([{ op: 'update', table: 'jobs', id: 'j_1', set: { fail_streak: 1 }, expectRev: 1 }]).result).toEqual({
      ok: true,
      value: { ids: ['j_1'], revs: [2] },
    });
    expect(tx([{ op: 'update', table: 'jobs', id: 'j_1', set: { fail_streak: 2 }, expectRev: 1 }]).result).toMatchObject({
      ok: false,
      error: { kind: 'DB_STALE_REV' },
    });
    expect(job('j_1').fail_streak).toBe(1);
  });

  it('steps and tool calls are writable, with tool call args and results stored redacted (§4.6 rule 2)', () => {
    const key = 'sk-proj-abcdefghij1234567890ABCDEFGHIJ';
    const r = tx([
      jobRow('j_1', 'working'),
      {
        op: 'insert',
        table: 'steps',
        row: { id: 's_1', job_id: 'j_1', idx: 0, phrase_key: 'read_email', state: 'running', route: 'email' },
      },
      {
        op: 'insert',
        table: 'tool_calls',
        row: {
          id: 'tc_1',
          job_id: 'j_1',
          step_id: 's_1',
          tool: 'gmail.search',
          action_class: 'read',
          side_effect: 0,
          args: { q: key },
          gate: 'auto',
          started_at: NOW,
        },
      },
      { op: 'transition', table: 'steps', id: 's_1', from: ['running'], to: 'done', set: { finished_at: NOW } },
    ]);
    expect(r.result.ok).toBe(true);
    expect(String((db.prepare("SELECT args FROM tool_calls WHERE id = 'tc_1'").get() as { args: string }).args)).not.toContain(key);
    expect(db.prepare("SELECT state, rev FROM steps WHERE id = 's_1'").get()).toEqual({ state: 'done', rev: 2 });
    expect(r.effects.jobIds).toEqual(new Set(['j_1']));
  });
});

describe('cards (08-1 §4.5.1, 08-0 §G.2)', () => {
  it('validates the state against the card type on insert, update and transition', () => {
    expect(tx(cardOps('k_1', 'checklist', 'asking', { jobId: 'j_1' })).result).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
    expect(tx(cardOps('k_1', 'stuck', 'asking')).result.ok).toBe(true);
    expect(tx([{ op: 'update', table: 'cards', id: 'k_1', set: { state: 'live' } }]).result).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(tx([{ op: 'transition', table: 'cards', id: 'k_1', from: ['asking'], to: 'done' }]).result).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    const r = tx(
      [{ op: 'transition', table: 'cards', id: 'k_1', from: ['asking'], to: 'stopped', set: { resolved_by: 'tap', resolved_at: NOW + 1 } }],
      NOW + 1,
    );
    expect(r.result).toEqual({ ok: true, value: { ids: ['k_1'], revs: [2] } });
    expect(db.prepare("SELECT state, updated_at, resolved_by FROM cards WHERE id = 'k_1'").get()).toEqual({
      state: 'stopped',
      updated_at: NOW + 1,
      resolved_by: 'tap',
    });
  });

  it('a card waiting on the user sets the Needs you pill; resolving it clears it (§4.6 rule 7)', () => {
    tx(cardOps('k_1', 'stuck', 'asking'));
    expect(pill().pill).toBe('needs_you');
    tx([{ op: 'transition', table: 'cards', id: 'k_1', from: ['asking'], to: 'other_way' }]);
    expect(pill().pill).toBeNull();
  });

  it('the job moving to needs_you sets the pill, waiting sets Paused', () => {
    tx([jobRow('j_1', 'working')]);
    tx([move('j_1', ['working'], 'needs_you')]);
    expect(pill().pill).toBe('needs_you');
    tx([move('j_1', ['needs_you'], 'working')]);
    tx([move('j_1', ['working'], 'waiting', { waiting_reason: 'ai_down' })]);
    expect(pill().pill).toBe('paused');
  });

  it('stores the payload redacted', () => {
    tx(cardOps('k_1', 'error', 'asking', { whatHappened: 'key sk-proj-abcdefghij1234567890ABCDEFGHIJ' }));
    const payload = JSON.parse((db.prepare("SELECT payload FROM cards WHERE id = 'k_1'").get() as { payload: string }).payload);
    expect(payload.whatHappened).toBe('key ••••');
  });

  // M5 T10: an id that passes P17's entropy line stays whole in a card payload; text next to it is still redacted.
  it('keeps the ids foo made whole in a card payload', () => {
    const id = 'j_9fQ2xLmZ7aKd3RtV8bNw1cYe5HuJ0pGs';
    tx(cardOps('k_1', 'error', 'asking', { jobId: id, jobIds: [id], whatHappened: id }));
    const payload = JSON.parse((db.prepare("SELECT payload FROM cards WHERE id = 'k_1'").get() as { payload: string }).payload);
    expect(payload).toMatchObject({ jobId: id, jobIds: [id], whatHappened: '••••' });
  });
});

describe('mirror and activity ops (08-1 §4.1.2, §2.4.1)', () => {
  const state = JSON.stringify({ schemaVersion: 1, job: { id: 'j_1' }, steps: [], steerQueue: [] }, null, 2);

  it('writes {DATA}/jobs/{id}/state.json and plan.md by temp + rename, leaving no temp file', () => {
    tx([jobRow('j_1')]);
    const r = tx([
      { op: 'mirror', kind: 'job_state', id: 'j_1', text: state },
      { op: 'mirror', kind: 'plan_md', id: 'j_1', text: '# Finding bills\n\nAsked: bills\n' },
    ]);
    expect(r.result.ok).toBe(true);
    const dir = join(dataDir, 'jobs', 'j_1');
    expect(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).schemaVersion).toBe(1);
    expect(readFileSync(join(dir, 'plan.md'), 'utf8')).toBe('# Finding bills\n\nAsked: bills\n');
    expect(readdirSync(dir).sort()).toEqual(['plan.md', 'state.json']);
  });

  it('a failing op after a mirror leaves the old mirror and no temp file', () => {
    tx([jobRow('j_1'), { op: 'mirror', kind: 'plan_md', id: 'j_1', text: 'old\n' }]);
    const r = tx([{ op: 'mirror', kind: 'plan_md', id: 'j_1', text: 'new\n' }, move('j_1', ['done'], 'working')]);
    expect(r.result.ok).toBe(false);
    const dir = join(dataDir, 'jobs', 'j_1');
    expect(readFileSync(join(dir, 'plan.md'), 'utf8')).toBe('old\n');
    expect(readdirSync(dir)).toEqual(['plan.md']);
  });

  it('refuses a mirror with no data folder, a bad id, a missing job or a state.json that is not schemaVersion 1', () => {
    tx([jobRow('j_1')]);
    expect(applyDbOps(db, [{ op: 'mirror', kind: 'plan_md', id: 'j_1', text: 'x' }], { now: NOW }).result).toMatchObject({
      ok: false,
      error: { kind: 'DB_NOT_WRITABLE' },
    });
    expect(tx([{ op: 'mirror', kind: 'plan_md', id: '../x', text: 'x' }]).result.ok).toBe(false);
    expect(tx([{ op: 'mirror', kind: 'plan_md', id: 'j_9', text: 'x' }]).result.ok).toBe(false);
    expect(tx([{ op: 'mirror', kind: 'job_state', id: 'j_1', text: '{"schemaVersion":2}' }]).result).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(existsSync(join(dataDir, 'jobs', 'j_9'))).toBe(false);
  });

  it('an activity op writes the row (id and at by main, summary redacted) and appends activity.jsonl', () => {
    tx([jobRow('j_1')]);
    const r = tx([
      {
        op: 'activity',
        row: {
          kind: 'stopped',
          event: 'stopped_job',
          actor: 'user',
          chatId: 'c_1',
          chatTitle: 'foo',
          jobId: 'j_1',
          approvalId: null,
          paymentId: null,
          routineId: null,
          summary: 'Stopped Finding bills sk-proj-abcdefghij1234567890ABCDEFGHIJ',
          toLabel: null,
          fromLabel: null,
          amountPaise: null,
          approvedHow: 'user',
          ruleText: null,
          proofKind: null,
          proofRef: null,
          outcome: 'done',
        },
      },
    ]);
    expect(r.result.ok).toBe(true);
    const rows = NAMED_QUERIES.activityForJob({ db, now: NOW }, 'j_1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'stopped', event: 'stopped_job', at: NOW, summary: 'Stopped Finding bills ••••' });
    const line = JSON.parse(readFileSync(join(dataDir, 'activity.jsonl'), 'utf8').trim());
    expect(line).toMatchObject({ id: rows[0]!.id, event: 'stopped_job', jobId: 'j_1' });
  });
});

describe('EngineBridge (08-1 §2.4, §3.3)', () => {
  function bridge() {
    const events: { event: string; payload: unknown }[] = [];
    const awake: [boolean, number][] = [];
    let settings = structuredClone(settingsDefaults);
    const b = new EngineBridge({
      db,
      settings: { get: () => settings, update: (fn) => (settings = fn(settings)) },
      emit: (event, payload) => events.push({ event, payload }),
      emitMessage: () => undefined,
      emitChat: (id) => events.push({ event: 'chat', payload: id }),
      dataDir,
      now: () => NOW,
      keepAwake: (on, n) => awake.push([on, n]),
    });
    return { b, events, awake };
  }

  it('emits job:upsert and card:upsert for the rows a db.tx wrote, and the chat once', () => {
    const { b, events } = bridge();
    const reply = b.receive({
      id: 'e1',
      kind: 'db.tx',
      payload: { ops: [jobRow('j_1'), ...cardOps('k_1', 'checklist', 'live', { jobId: 'j_1' })] },
    });
    expect(reply?.result.ok).toBe(true);
    expect(events.filter((e) => e.event === 'job:upsert').map((e) => (e.payload as { id: string; state: string }).state)).toEqual([
      'queued',
    ]);
    expect(events.filter((e) => e.event === 'card:upsert').map((e) => (e.payload as { id: string }).id)).toEqual(['k_1']);
    expect(events.filter((e) => e.event === 'chat')).toHaveLength(1);
  });

  it('answers the new named queries and passes power.keepAwake to main', () => {
    const { b, awake } = bridge();
    b.receive({ id: 'e1', kind: 'db.tx', payload: { ops: [jobRow('j_1'), jobRow('j_2', 'working')] } });
    const r = b.receive({ id: 'e2', kind: 'db.query', payload: { q: 'jobsByState', args: [['queued', 'working']] } });
    expect((r?.result as { ok: true; value: { id: string }[] }).value.map((j) => j.id)).toEqual(['j_1', 'j_2']);
    const live = b.receive({ id: 'e3', kind: 'db.query', payload: { q: 'jobs.liveForChat', args: ['c_1'] } });
    expect((live?.result as { ok: true; value: unknown[] }).value).toHaveLength(2);
    expect(b.receive({ id: 'e4', kind: 'power.keepAwake', payload: { on: true, jobCount: 1 } })).toBeNull();
    expect(awake).toEqual([[true, 1]]);
  });
});

describe('protocol rows (08-1 §2.4, §2.4.1; CR-0008)', () => {
  it('NamedQuery names are exactly the exported keys of src/main/db/queries.ts', () => {
    expect([...NAMED_QUERY_NAMES].sort()).toEqual(Object.keys(NAMED_QUERIES).sort());
    for (const q of [
      'jobById',
      'jobsByState',
      'stepsForJob',
      'toolCallsForJob',
      'toolCallsUnknown',
      'activityForJob',
      'cardsOpenForChat',
      'cardById',
      'approvalsOpenForJob',
      'monthAiSpend',
      'jobs.liveForChat',
      'cards.openForChat',
    ])
      expect(NAMED_QUERY_NAMES).toContain(q);
  });

  it('accepts the M4 main → engine messages and rejects a bad stop reason', () => {
    const ok = [
      { kind: 'card.answered', payload: { cardId: 'k_1', choice: 'go', resolvedBy: 'tap' } },
      { kind: 'card.answered', payload: { cardId: 'k_1', answer: { optionId: 'o1' }, resolvedBy: 'keyboard' } },
      { kind: 'job.stop', payload: { jobId: 'j_1', by: 'user', reason: 'user_button' } },
      { kind: 'job.stopAll', payload: { by: 'user' } },
      { kind: 'job.retry', payload: { jobId: 'j_1', newJobId: 'j_2' } },
      { kind: 'power', payload: { event: 'suspend' } },
      { kind: 'jobs.pauseAll', payload: { reason: 'app_quit' } },
    ];
    for (const m of ok) expect(mainToEngineSchema.safeParse({ id: 'x', ...m }).success).toBe(true);
    expect(mainToEngineSchema.safeParse({ id: 'x', kind: 'job.stop', payload: { jobId: 'j', by: 'user', reason: 'bored' } }).success).toBe(
      false,
    );
    expect(
      engineToMainSchema.safeParse({
        id: 'x',
        kind: 'notify',
        payload: { kind: 'stuck', chatId: 'c_1', title: 't', body: 'b', prompted: false },
      }).success,
    ).toBe(true);
  });

  it('registers the M4 test ids', () => {
    for (const id of [
      'card-checklist-step',
      'card-plan-go',
      'card-stuck-stop',
      'card-error-fix',
      'card-spend-cap-raise',
      'card-job-link',
      'thread-proof-chip',
      'composer-errors-clear',
      'dialog-c-21',
    ])
      expect(Object.values(TID)).toContain(id);
  });
});

describe('step phrase catalogue (08-4 §26.1)', () => {
  const md = readFileSync('spec/constitution/08-functions-and-engine-4.md', 'utf8');
  const table = md.slice(md.indexOf('| key {slots} | next | running | done |'), md.indexOf('Keys with "—" are runner-only'));
  const rows = table
    .split('\n')
    .slice(2)
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .split('|')
        .slice(1, 5)
        .map((c) => c.trim()),
    );

  it('is the spec table word for word, and en-IN.json holds the same texts under cards.checklist.{key}.{form}', () => {
    expect(Object.keys(PHRASES)).toEqual(rows.map((r) => /`(\w+)`/.exec(r[0]!)![1]));
    for (const [head, ...forms] of rows) {
      const key = /`(\w+)`/.exec(head!)![1] as keyof typeof PHRASES;
      expect([...PHRASES[key].slots]).toEqual([...head!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
      (['next', 'running', 'done'] as const).forEach((form, i) => {
        const want = forms[i] === '—' ? null : forms[i]!.slice(1, -1);
        expect(PHRASES[key][form]).toBe(want);
        const ck = phraseCopyKey(key, form);
        if (want === null) expect(ck).toBeNull();
        else expect((copy as Record<string, string>)[ck!]).toBe(want.replace(/'/g, '’'));
      });
    }
    expect(RUNNER_ONLY).toEqual(['blocked_try_next', 'took_over', 'stopped']);
  });

  it('falls back to generic_working for an unknown key, a runner-only key in a plan, or a bad slot', () => {
    expect(resolvePhrase('check_site', { site: 'MakeMyTrip' })).toEqual({ key: 'check_site', slots: { site: 'MakeMyTrip' } });
    expect(resolvePhrase('shortlist', { n: 3, what: 'stays', rule: '₹8,000 a night' }).slots.n).toBe('3');
    expect(resolvePhrase('open_terminal').key).toBe('generic_working');
    expect(resolvePhrase('stopped', {}, { inPlan: true }).key).toBe('generic_working');
    expect(resolvePhrase('check_site', {}).key).toBe('generic_working');
    expect(resolvePhrase('check_site', { site: 'a'.repeat(41) }).key).toBe('generic_working');
    expect(resolvePhrase('check_site', { site: 'x; rm -rf' }).key).toBe('generic_working');
    expect(resolvePhrase('check_site', { site: 'Bad' }, { isBanned: (s) => s === 'Bad' }).key).toBe('generic_working');
    expect(phraseText('check_site', 'done', { site: 'IRCTC' })).toBe('Checked IRCTC');
  });
});
