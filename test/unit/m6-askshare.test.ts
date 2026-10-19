// 08-3 §12.5.1 `memory.askShare` (M6 T7): the Choice card in the helper's 1:1 chat, Yes → a 24 h grant, No → never asked
// again (suggestion key dismissed), a sensitive or private fact → PRIVATE_BLOCKED with "That one stays between us." and no
// card. Real schema and main's handlers; seam: `MemoryShare.ask` / `.onCardAnswered`.
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MemoryShare, SHARE_GRANT_MS } from '../../src/engine/memory/askShare';
import type { DbOp, MainLink, NamedQuery } from '../../src/engine/protocol';
import { applyDbOps, runNamedQuery } from '../../src/main/engine-supervisor/engineHost';
import { migrate } from '../../src/main/store/db';
import { newNonce } from '../../src/shared/canon';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import type { Result } from '../../src/shared/errors';
import { newId } from '../../src/shared/ids';

const FACT = 'f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61';
const HEALTH = 'f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e62';

function world() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const clock = new FakeClock(TEST_EPOCH_MS);
  const now = clock.now();
  db.pragma('foreign_keys = OFF');
  db.prepare(
    "INSERT INTO helpers (id, name, job_text, face_ref, color_token, allowed_apps, chat_id, created_at) VALUES ('h_trips', 'Trips', 'Plans trips', 'face:default', '--h-teal', '{}', 'c_h', ?)",
  ).run(now);
  db.prepare(
    "INSERT INTO chats (id, kind, helper_id, title, last_activity_at, created_at) VALUES ('c_h', 'helper', 'h_trips', 'Trips', ?, ?)",
  ).run(now, now);
  db.pragma('foreign_keys = ON');
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_g', 'group', 'Goa trip', ?, ?)").run(now, now);
  const fact = db.prepare(
    `INSERT INTO memory_index (id, file, line_no, scope, text, provenance, origin, origin_kind, category, kind, sensitive, private, learned_at, hash)
     VALUES (?, 'memory/about-you.md', ?, 'global', ?, 'said', 'manual', 'manual', ?, 'fact', ?, ?, ?, 'h')`,
  );
  fact.run(FACT, 2, 'Vegetarian on Tuesdays', 'food', 0, 0, now);
  fact.run(HEALTH, 3, 'Allergic to peanuts', 'health', 1, 1, now);
  const link: MainLink = {
    request<T>(kind: string, payload: unknown): Promise<Result<T>> {
      if (kind === 'db.tx')
        return Promise.resolve(applyDbOps(db, (payload as { ops: DbOp[] }).ops, { now: clock.now() }).result as Result<T>);
      const p = payload as { q: NamedQuery; args: unknown[] };
      return Promise.resolve(runNamedQuery(db, p.q, p.args, clock.now()) as Result<T>);
    },
    send() {},
  };
  const share = new MemoryShare({ link, clock, newId: (p) => newId(p, clock.now()), newNonce });
  const ask = (factId = FACT) => share.ask({ factId, groupChatId: 'c_g', why: 'Planning dinner', helperId: 'h_trips' });
  // Main hands a memory_confirm answer to the engine as it is (answerCard RUNNER_PURPOSES); the engine moves the card.
  const answer = (cardId: string, choice: 'o1' | 'o2') => share.onCardAnswered({ cardId, answer: { optionId: choice }, resolvedBy: 'tap' });
  const suggestion = () => db.prepare('SELECT key, kind, state FROM suggestions').all();
  return { db, clock, share, ask, answer, suggestion };
}

describe('08-3 §12.5.1 memory.askShare', () => {
  it('posts the question in the helper’s own 1:1 chat as a prompted memory_confirm Choice card; the group sees nothing', async () => {
    const w = world();
    const r = await w.ask();
    expect(r).toMatchObject({ ok: true, value: { asked: true } });
    const card = w.db.prepare('SELECT * FROM cards').get() as Record<string, unknown>;
    expect(card).toMatchObject({ chat_id: 'c_h', type: 'choice', state: 'asking' });
    expect(JSON.parse(String(card.payload))).toMatchObject({
      purpose: 'memory_confirm',
      question: 'Okay to tell the Goa trip group Vegetarian on Tuesdays?',
      options: [
        { id: 'o1', label: 'Yes' },
        { id: 'o2', label: 'No' },
      ],
      reversible: false,
      share: { factId: FACT, groupChatId: 'c_g' },
    });
    expect(w.db.prepare("SELECT prompted, author_kind, author_id FROM messages WHERE chat_id = 'c_h'").get()).toEqual({
      prompted: 1,
      author_kind: 'helper',
      author_id: 'h_trips',
    });
    expect(w.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = 'c_g'").get()).toEqual({ n: 0 });
  });

  it('Yes → a grant for that group until now + 24 h', async () => {
    const w = world();
    const r = await w.ask();
    const cardId = (r as { value: { cardId: string } }).value.cardId;
    w.clock.advance(60_000);
    expect(await w.answer(cardId, 'o1')).toBe(true);
    expect(w.db.prepare('SELECT * FROM memory_group_grants').all()).toEqual([
      { fact_id: FACT, chat_id: 'c_g', until: w.clock.now() + SHARE_GRANT_MS },
    ]);
    expect(SHARE_GRANT_MS).toBe(24 * 60 * 60 * 1000);
    expect(w.db.prepare('SELECT state, resolved_by FROM cards WHERE id = ?').get(cardId)).toEqual({
      state: 'answered',
      resolved_by: 'tap',
    });
  });

  it('a second answer to the same card writes nothing more (CR-0010 G-M6-21)', async () => {
    const w = world();
    const cardId = ((await w.ask()) as { value: { cardId: string } }).value.cardId;
    await w.answer(cardId, 'o1');
    const before = w.db.prepare('SELECT rev FROM cards WHERE id = ?').get(cardId) as { rev: number };
    expect(await w.answer(cardId, 'o2')).toBe(true);
    expect(w.db.prepare('SELECT rev, state FROM cards WHERE id = ?').get(cardId)).toEqual({ rev: before.rev, state: 'answered' });
    expect(w.suggestion()).toEqual([{ key: `memory_share:${FACT}:c_g`, kind: 'memory_share', state: 'accepted' }]);
  });

  it('No → the key memory_share:{factId}:{groupChatId} is dismissed and the question is never asked again', async () => {
    const w = world();
    const r = await w.ask();
    await w.answer((r as { value: { cardId: string } }).value.cardId, 'o2');
    expect(w.suggestion()).toEqual([{ key: `memory_share:${FACT}:c_g`, kind: 'memory_share', state: 'dismissed' }]);
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM memory_group_grants').get()).toEqual({ n: 0 });
    expect(await w.ask()).toEqual({ ok: true, value: { asked: false, reason: 'dismissed' } });
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM cards').get()).toEqual({ n: 1 });
  });

  it('a sensitive fact → PRIVATE_BLOCKED and the helper’s line “That one stays between us.”; no card, no grant', async () => {
    const w = world();
    expect(await w.ask(HEALTH)).toEqual({ ok: false, error: { kind: 'PRIVATE_BLOCKED', message: 'That one stays between us.' } });
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM cards').get()).toEqual({ n: 0 });
  });

  it('a fact that became sensitive before Yes is still never granted (X-112)', async () => {
    const w = world();
    const r = await w.ask();
    w.db.prepare("UPDATE memory_index SET text = 'Vegetarian on Tuesdays for vrat' WHERE id = ?").run(FACT);
    await w.answer((r as { value: { cardId: string } }).value.cardId, 'o1');
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM memory_group_grants').get()).toEqual({ n: 0 });
  });
});
