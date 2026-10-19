// 11-fidelity §11.5 FID-16 (table test): for the job machine every (state × event) pair is checked — allowed → the expected
// next state and side effects; not allowed → the state is unchanged and the move is refused (DB_BAD_TRANSITION) — the full
// cross product, not a sample. Sources: spec/state-machines.json (scripts/extract-sm.ts, 07-2 §4 + SM-A1…A13, CR-0008), the
// runner/main table src/shared/jobMachine.ts and main's db.tx guard (08-1 §2.4.1). The approval half arrives with M5.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMachines, checkAgainstTable, serialise, SM_PATH, type StateMachines } from '../../../scripts/extract-sm';
import { applyDbOps } from '../../../src/main/engine-supervisor/engineHost';
import { migrate } from '../../../src/main/store/db';
import { BADGE_OF_STATE, canTransition, JOB_EVENTS, JOB_STATES, nextState, TERMINAL, type JobEvent } from '../../../src/shared/jobMachine';
import type { JobState } from '../../../src/shared/types';

const sm = JSON.parse(readFileSync(SM_PATH, 'utf8')) as StateMachines;
const machine = sm.machines.job;

describe('FID-16 job state machine', () => {
  it('FID-16 state-machines.json is fresh and covers every From → To pair of the 07-2 §4 table', () => {
    expect(readFileSync(SM_PATH, 'utf8')).toBe(serialise(buildMachines()));
    expect(checkAgainstTable(readFileSync('spec/constitution/07-journeys-2.md', 'utf8'), sm)).toEqual([]);
  });

  it('FID-16 the app table has the same states, final states, events and badges as the spec file', () => {
    expect([...JOB_STATES]).toEqual(machine.states);
    expect([...TERMINAL].sort()).toEqual([...machine.terminal].sort());
    expect(Object.keys(JOB_EVENTS).sort()).toEqual([...machine.events].sort());
    expect(BADGE_OF_STATE).toEqual(machine.badgeOf);
  });

  it('FID-16 every state × event pair: allowed → the spec next state, otherwise not allowed', () => {
    let cells = 0;
    for (const from of machine.states)
      for (const event of machine.events) {
        const row = machine.transitions.find((t) => t.from === from && t.event === event);
        expect(nextState(from as JobState, event as JobEvent), `${from} × ${event}`).toBe(row ? row.to : undefined);
        cells++;
      }
    expect(cells).toBe(machine.states.length * machine.events.length);
  });

  it('FID-16 every (from, to) pair: canTransition matches the spec, and nothing leaves a final state', () => {
    const forbidden = new Set(machine.forbidden.map((f) => `${f.from}>${f.to}`));
    for (const from of machine.states)
      for (const to of machine.states) expect(canTransition(from, to), `${from} → ${to}`).toBe(!forbidden.has(`${from}>${to}`));
    for (const from of machine.terminal) for (const to of machine.states) expect(canTransition(from, to)).toBe(false);
  });

  it('FID-16 side effects per transition: the badge is the target state’s badge, and only Stop rows say "Stopped by you"', () => {
    for (const t of machine.transitions) {
      if (t.to === null) continue;
      if (t.badge !== null) expect(t.badge, `${t.from} × ${t.event}`).toBe(machine.badgeOf[t.to]);
      if (t.to === 'cancelled') expect(t.checklist).toBe('stopped');
      if (t.to === 'done') expect(t.checklist).toBe('done');
      if (t.to === 'done_unverified') expect(t.checklist).toBe('done_unverified');
      if (t.to === 'failed') expect(t.checklist).toBe('failed');
      if (t.to === 'needs_you') expect(t.pill).toBe('needs_you');
      if (t.to === 'waiting') expect(t.pill).toBe('paused');
    }
    // X-80 / SM-A11: Stop on a stuck card ends CANCELLED; 15 min without an answer ends FAILED.
    expect(nextState('needs_you', 'stuck_stop')).toBe('cancelled');
    expect(nextState('needs_you', 'stuck_timeout')).toBe('failed');
    // AT-120 / G-M4-01: retry never moves the old job.
    expect(nextState('failed', 'retry')).toBeNull();
    expect(nextState('cancelled', 'retry')).toBeNull();
  });

  it('FID-16 main enforces the table: db.tx transition for every state × event, refused moves leave the row as it was', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db, 'src/main/store/migrations');
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', 1, 1)").run();
    const insert = db.prepare(
      "INSERT INTO jobs (id, chat_id, origin_chat_id, owner_kind, title, origin, intent, state, created_at) VALUES (?, 'c_1', 'c_1', 'foo', 'T', 'user', 'read_only', ?, 1)",
    );
    let n = 0;
    for (const from of machine.states)
      for (const to of machine.states) {
        const id = `j_${++n}`;
        insert.run(id, from);
        const r = applyDbOps(db, [{ op: 'transition', table: 'jobs', id, from: [from], to }], { now: 2 });
        const state = db.prepare('SELECT state, rev FROM jobs WHERE id = ?').get(id) as { state: string; rev: number };
        if (canTransition(from, to)) {
          expect(r.result.ok, `${from} → ${to}`).toBe(true);
          expect(state).toEqual({ state: to, rev: 2 });
        } else {
          expect(r.result, `${from} → ${to}`).toMatchObject({ ok: false, error: { kind: 'DB_BAD_TRANSITION' } });
          expect(state).toEqual({ state: from, rev: 1 });
        }
      }
  });
});
