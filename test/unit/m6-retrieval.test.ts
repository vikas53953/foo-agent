// M6 T4: memory in replies. 08-4 §24.16 (identity rows outside the 4,000-char cap; pinned set `use_count DESC, learned_at
// DESC`; turn set ≤ 8 FTS rows not already pinned, `bm25 ASC, use_count DESC, learned_at DESC`; the query build; Art. 14
// group exclusion; line format; uses), §24.1 (intake gets part 5 in the system and 5b in the prompt), 08-3 §12.5.
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbOp } from '../../src/engine/protocol';
import { buildMemoryParts, ftsMatch, type MemoryQuery } from '../../src/engine/memory/retrieval';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { NAMED_QUERIES } from '../../src/main/db/queries';
import { migrate, type Db } from '../../src/main/store/db';
import { intake, makeHarness, verified, VERIFY_LINE, type Harness } from './m3-engine-helpers';

const TZ = 'Asia/Kolkata';
const NOW = Date.parse('2026-10-16T09:41:00+05:30'); // Fri 16 Oct 2026
const SAT_3_OCT = Date.parse('2026-10-03T21:04:00+05:30');
const DAY = 86_400_000;

let db: Db;
let seq = 0;
const tx = (ops: DbOp[]) => applyDbOps(db, ops, { now: NOW });
const q: MemoryQuery = (name, ...args) =>
  Promise.resolve(
    (NAMED_QUERIES as Record<string, (ctx: { db: Db; now: number }, ...a: unknown[]) => unknown>)[name]!(
      { db, now: NOW },
      ...args,
    ) as never,
  );
function fact(id: string, text: string, extra: Record<string, unknown> = {}): DbOp {
  seq += 1;
  return {
    op: 'insert',
    table: 'memory_index',
    row: {
      id,
      file: 'memory/about-you.md',
      line_no: seq,
      scope: 'global',
      text,
      provenance: 'said',
      origin: 'manual',
      origin_kind: 'manual',
      kind: 'fact',
      learned_at: SAT_3_OCT,
      hash: `h_${id}`,
      ...extra,
    },
  };
}
const parts = (chatId: string, text: string) => buildMemoryParts(q, { chatId, text, timeZone: TZ, now: NOW });

beforeEach(() => {
  seq = 0;
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  const chat = db.prepare('INSERT INTO chats (id, kind, title, helper_id, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    db.prepare(
      `INSERT INTO helpers (id, name, job_text, face_ref, color_token, allowed_apps, chat_id, created_at)
       VALUES ('h_trips', 'Trips', 'Plans trips', 'face:1', 'teal', '{}', 'c_trips', ?)`,
    ).run(NOW);
    chat.run('c_1', 'foo', 'foo', null, NOW, NOW);
    chat.run('c_g', 'group', 'Family', null, NOW, NOW);
    chat.run('c_trips', 'helper', 'Trips', 'h_trips', NOW, NOW);
  })();
});

describe('turn-fact query build (08-4 §24.16 item 3)', () => {
  it('keeps tokens of 2+ graphemes, quoted, joined with OR', () => {
    expect(ftsMatch("Where's my brother's flat?")).toBe('"Where" OR "my" OR "brother" OR "flat"');
  });
  it('drops duplicates and splits on every non-letter, non-mark, non-number', () => {
    expect(ftsMatch('Pune, Pune! seats/Pune 2026')).toBe('"Pune" OR "seats" OR "2026"');
  });
  it('keeps Devanagari and Gurmukhi words whole (marks belong to the word); one grapheme is too short', () => {
    // "है" is one grapheme cluster (ह + ै), so it is dropped like "a".
    expect(ftsMatch('मेरी बहन कहाँ है')).toBe('"मेरी" OR "बहन" OR "कहाँ"');
    expect(ftsMatch('ਮੇਰੀ ਭੈਣ')).toBe('"ਮੇਰੀ" OR "ਭੈਣ"');
  });
  it('no tokens → no turn set', () => {
    expect(ftsMatch('?? ! a b')).toBeNull();
    expect(ftsMatch('')).toBeNull();
  });
});

describe('part 5: identity and pinned facts (08-4 §24.16 items 1, 2, 5)', () => {
  it('writes each fact as `[{factId}] {text} ({You said|I guessed}, {Sat 12 Dec})`', async () => {
    tx([fact('f_1', 'Sister Meera lives in Pune'), fact('f_2', 'Likes filter coffee', { provenance: 'guessed' })]);
    const p = await parts('c_1', 'hello');
    expect(p.part5.map((l) => l.line)).toEqual([
      '[f_1] Sister Meera lives in Pune (You said, Sat 3 Oct)',
      '[f_2] Likes filter coffee (I guessed, Sat 3 Oct)',
    ]);
  });
  it('orders pinned facts use_count DESC, learned_at DESC', async () => {
    tx([
      fact('f_old', 'Old fact', { learned_at: SAT_3_OCT - DAY }),
      fact('f_new', 'New fact', { learned_at: SAT_3_OCT }),
      fact('f_used', 'Used fact', { use_count: 3, learned_at: SAT_3_OCT - 5 * DAY }),
    ]);
    expect((await parts('c_1', 'x')).part5.map((l) => l.id)).toEqual(['f_used', 'f_new', 'f_old']);
  });
  it('identity rows are always in part 5, outside the 4,000-char cap; pinned lines stop at 4,000 chars', async () => {
    const long = (i: number) => `Long fact ${String(i).padStart(2, '0')} ${'x'.repeat(100)}`;
    tx([
      fact('f_id', 'Your name is Asha', { file: 'memory/identity.md' }),
      ...Array.from({ length: 60 }, (_, i) => fact(`f_${String(i).padStart(2, '0')}`, long(i), { use_count: 60 - i })),
    ]);
    const p = await parts('c_1', 'x');
    expect(p.part5[0]).toMatchObject({ id: 'f_id', identity: true });
    const pinned = p.part5.filter((l) => !l.identity);
    const size = pinned.map((l) => l.line).join('\n').length;
    expect(size).toBeLessThanOrEqual(4_000);
    // One more line would cross the cap.
    expect(size + 1 + `[f_99] ${long(99)} (You said, Sat 3 Oct)`.length).toBeGreaterThan(4_000);
    expect(pinned.map((l) => l.id)).toEqual(pinned.map((_, i) => `f_${String(i).padStart(2, '0')}`));
  });
  it('a helper chat pins its own notes; another chat never sees them', async () => {
    tx([fact('f_note', 'Books IndiGo when it can', { file: 'helpers/h_trips/notes.md', scope: 'helper' })]);
    expect((await parts('c_trips', 'x')).part5.map((l) => l.id)).toEqual(['f_note']);
    expect((await parts('c_1', 'x')).part5).toEqual([]);
  });
  it('a chat-scope fact is pinned only in its own chat', async () => {
    tx([fact('f_chat', 'Planning a surprise party', { scope: 'chat', chat_id: 'c_trips' })]);
    expect((await parts('c_trips', 'x')).part5.map((l) => l.id)).toEqual(['f_chat']);
    expect((await parts('c_1', 'x')).part5).toEqual([]);
  });
});

describe('part 5b: turn facts (08-4 §24.16 item 3)', () => {
  // 30 filler facts fill the 4,000-char pinned set, so the brother facts (used less) are not pinned.
  const filler = () =>
    Array.from({ length: 30 }, (_, i) =>
      fact(`f_fill${String(i).padStart(2, '0')}`, `Filler ${String(i).padStart(2, '0')} ${'y'.repeat(120)}`, { use_count: 50 }),
    );
  it('up to 8 FTS rows that are not pinned, bm25 then use_count DESC then learned_at DESC', async () => {
    const wives = Array.from({ length: 10 }, (_, i) =>
      fact(`f_b${i}`, `Brother note n${i} here`, { use_count: i % 5, learned_at: SAT_3_OCT + i * 60_000 }),
    );
    tx([...filler(), ...wives]);
    const p = await parts('c_1', 'where does my brother live?');
    expect(p.part5.some((l) => l.id.startsWith('f_b'))).toBe(false);
    // Same bm25 for every brother note (same length, one hit): use_count 4,4,3,3,2,2,1,1 then learned_at newest first.
    expect(p.part5b.map((l) => l.id)).toEqual(['f_b9', 'f_b4', 'f_b8', 'f_b3', 'f_b7', 'f_b2', 'f_b6', 'f_b1']);
    expect(p.part5b[0]!.line).toBe('[f_b9] Brother note n9 here (You said, Sat 3 Oct)');
  });
  it('a better bm25 match comes first whatever its use_count', async () => {
    tx([
      ...filler(),
      fact('f_a', 'brother brother brother'),
      fact('f_b', 'my brother and a long list of other unrelated words here', { use_count: 9 }),
    ]);
    expect((await parts('c_1', 'brother')).part5b.map((l) => l.id)).toEqual(['f_a', 'f_b']);
  });
  it('a pinned fact is never repeated in 5b', async () => {
    tx([fact('f_1', 'Brother Rohit lives in Pune')]);
    const p = await parts('c_1', 'where does my brother live?');
    expect(p.part5.map((l) => l.id)).toEqual(['f_1']);
    expect(p.part5b).toEqual([]);
  });
  it('no tokens → no turn set', async () => {
    tx([...filler(), fact('f_b', 'Brother Rohit lives in Pune')]);
    expect((await parts('c_1', '?!')).part5b).toEqual([]);
  });
});

describe('ART-14 (memory part) · groups never see private, about-you or ungranted chat-scope facts (Art. 14)', () => {
  beforeEach(() => {
    tx([
      fact('f_about', 'Lives in Pune'),
      fact('f_pref', 'Prefers window seats', { file: 'memory/preferences/travel.md', kind: 'preference', category: 'travel' }),
      fact('f_priv', 'Vegetarian on Tuesdays', { file: 'memory/preferences/food.md', private: 1 }),
      fact('f_chat', 'Planning a surprise party in Pune', { scope: 'chat', chat_id: 'c_g' }),
      fact('f_id', 'Your name is Asha', { file: 'memory/identity.md' }),
    ]);
  });
  it('ART-14 · a group turn gets neither the private fact, the about-you fact nor the chat-scope fact', async () => {
    const p = await parts('c_g', 'Pune party Tuesdays window seats');
    const ids = [...p.part5, ...p.part5b].map((l) => l.id);
    expect(ids.sort()).toEqual(['f_id', 'f_pref']);
  });
  it('ART-14 · a live grant re-admits that one fact; an expired grant does not; private never', async () => {
    tx([
      { op: 'insert', table: 'memory_group_grants', row: { fact_id: 'f_chat', chat_id: 'c_g', until: NOW + DAY } },
      { op: 'insert', table: 'memory_group_grants', row: { fact_id: 'f_about', chat_id: 'c_g', until: NOW - 1 } },
      { op: 'insert', table: 'memory_group_grants', row: { fact_id: 'f_priv', chat_id: 'c_g', until: NOW + DAY } },
    ]);
    const p = await parts('c_g', 'Pune Tuesdays');
    expect([...p.part5, ...p.part5b].map((l) => l.id).sort()).toEqual(['f_chat', 'f_id', 'f_pref']);
  });
  it('the 1:1 chat gets every global fact, private ones included', async () => {
    const p = await parts('c_1', 'x');
    expect(p.part5.map((l) => l.id).sort()).toEqual(['f_about', 'f_id', 'f_pref', 'f_priv']);
  });
});

describe('a reply turn (08-4 §24.1 intake, §24.16 item 6)', () => {
  let h: Harness | null = null;
  afterEach(() => {
    h?.close();
    h = null;
  });
  const seedFact = (x: Harness, id: string, text: string, useCount = 0) =>
    x.db
      .prepare(
        `INSERT INTO memory_index (id, file, line_no, scope, text, provenance, origin, origin_kind, kind, learned_at, use_count, hash)
         VALUES (?, 'memory/about-you.md', 1, 'global', ?, 'said', 'manual', 'manual', 'fact', ?, ?, ?)`,
      )
      .run(id, text, x.clock.now() - DAY, useCount, `h_${id}`);
  const replyUsing = (say: string, used: string[]) =>
    `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: used })}</act>`;

  it('puts the pinned facts in the system text and the turn facts in the prompt', async () => {
    h = makeHarness({ script: [VERIFY_LINE, intake(replyUsing('He lives in Pune.', []))], settings: verified() });
    seedFact(h, 'f_bro', 'Brother Rohit lives in Pune');
    h.userSays('Where does my brother live?');
    await h.idle();
    const turn = h.turnsJsonl().find((t) => t.purpose === 'intake')!;
    expect(String(turn.system)).toContain('What you know about');
    expect(String(turn.system)).toMatch(/\[f_bro\] Brother Rohit lives in Pune \(You said, \w{3} \d{1,2} \w{3}\)/);
    expect(String(turn.prompt)).not.toContain('[f_bro]');
  });
  it('records a use for every offered id the AI names, and ignores ids it was not offered', async () => {
    h = makeHarness({
      script: [VERIFY_LINE, intake(replyUsing('He lives in Pune.', ['f_bro', 'f_bro', 'f_nope']))],
      settings: verified(),
    });
    seedFact(h, 'f_bro', 'Brother Rohit lives in Pune', 2);
    seedFact(h, 'f_other', 'Likes filter coffee');
    h.userSays('Where does my brother live?');
    await h.idle();
    const uses = h.db.prepare('SELECT fact_id, chat_id, job_id, at FROM memory_uses').all() as Record<string, unknown>[];
    expect(uses).toEqual([{ fact_id: 'f_bro', chat_id: h.chatId, job_id: null, at: expect.any(Number) }]);
    const row = h.db.prepare("SELECT use_count, last_used_at FROM memory_index WHERE id = 'f_bro'").get() as Record<string, number>;
    expect(row.use_count).toBe(3);
    expect(row.last_used_at).toBe(uses[0]!.at);
    const other = h.db.prepare("SELECT use_count, last_used_at FROM memory_index WHERE id = 'f_other'").get() as Record<string, unknown>;
    expect(other).toEqual({ use_count: 0, last_used_at: null });
  });
});
