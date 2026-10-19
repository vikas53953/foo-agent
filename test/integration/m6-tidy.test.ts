// AT-219 (10-acceptance-1 §B; 08-3 §12.7; CR-0010 G-M6-02, G-M6-09): the nightly tidy against main's real handlers — the
// budget gate on db.tx (08-3 §15.2 step 5), the named queries, file writes — over a temp {DATA} and the real schema. The
// tidy turn is the fake AI's act. Seam: `MemoryTidy.run()` → card / held item / file lines; the card's answer through main's
// `answerCard` → `card.answered` → the engine's edit + forget.
import { describe, expect, it } from 'vitest';
import type { DbOp, MainLink, NamedQuery } from '../../src/engine/protocol';
import { MemoryTidy, catchUpDue, type TidyAct, type TidyTurn } from '../../src/engine/memory/tidy';
import type { LearnOp } from '../../src/engine/memory/MemoryService';
import { answerCard } from '../../src/main/cards/answerCard';
import { applyDbOps, runNamedQuery, writeDataFile } from '../../src/main/engine-supervisor/engineHost';
import { gateUnprompted } from '../../src/main/notify/budget';
import { newNonce } from '../../src/shared/canon';
import type { Result } from '../../src/shared/errors';
import { newId } from '../../src/shared/ids';
import type { Settings } from '../../src/shared/settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { CardRow } from '../../src/shared/types';
import { DAY, storeHarness, type StoreHarness } from './m6-store-harness';

const FOO = 'c_foo';
const IST: Settings = { ...settingsDefaults, locale: { ...settingsDefaults.locale, timeZone: 'Asia/Kolkata' } };
const QUESTION = 'Do you live in Pune now, or Mumbai?';

const said = (text: string, extra: Partial<LearnOp> = {}): LearnOp => ({
  text,
  provenance: 'said',
  originKind: 'chat',
  origin: `chat:${FOO}/m_1`,
  category: 'places',
  kind: 'fact',
  scope: 'global',
  private: false,
  ...extra,
});

interface World {
  h: StoreHarness;
  tidy: MemoryTidy;
  settings: Settings;
  turns: number;
  learn(op: LearnOp): Promise<string>;
  cards(): CardRow[];
  held(): Record<string, unknown>[];
  answer(cardId: string, optionId: 'o1' | 'o2'): Promise<void>;
}

function world(act: (ids: Record<string, string>) => TidyAct | null, s: Settings = IST): World {
  const h = storeHarness();
  h.db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES (?, 'foo', 'foo', ?, ?)").run(FOO, 0, 0);
  const byText: Record<string, string> = {};
  // The engine's side of the port, with main's db.tx exactly as EngineBridge runs it (budget gate first).
  const link: MainLink = {
    request<T>(kind: string, payload: unknown): Promise<Result<T>> {
      const now = h.clock.now();
      if (kind === 'db.tx') {
        const { ops } = gateUnprompted(h.db, w.settings, now, (payload as { ops: DbOp[] }).ops);
        return Promise.resolve(applyDbOps(h.db, ops, { now, dataDir: h.dataDir }).result as Result<T>);
      }
      if (kind === 'db.query') {
        const p = payload as { q: NamedQuery; args: unknown[] };
        return Promise.resolve(runNamedQuery(h.db, p.q, p.args, now) as Result<T>);
      }
      if (kind === 'file.write') {
        const p = payload as { relPath: string; text: string };
        return Promise.resolve(writeDataFile(h.dataDir, p.relPath, p.text) as Result<T>);
      }
      throw new Error(`unexpected request ${kind}`);
    },
    send() {},
  };
  const turn: TidyTurn = () => {
    w.turns += 1;
    return Promise.resolve(act(byText));
  };
  const tidy = new MemoryTidy({
    link,
    clock: h.clock,
    dataDir: h.dataDir,
    memory: h.svc,
    settings: () => w.settings,
    newId: (p) => newId(p, h.clock.now()),
    newNonce,
    turn,
    log: () => {},
  });
  const w: World = {
    h,
    tidy,
    settings: s,
    turns: 0,
    async learn(op) {
      const r = await h.svc.learn(op);
      if (!r.ok || !('factId' in r.value)) throw new Error('not learned');
      byText[op.text] = r.value.factId;
      return r.value.factId;
    },
    cards: () =>
      (h.db.prepare("SELECT * FROM cards WHERE chat_id = ? AND type = 'choice'").all(FOO) as Record<string, unknown>[]).map(
        (r) => ({ ...r, payload: JSON.parse(String(r.payload)) }) as unknown as CardRow,
      ),
    held: () => h.db.prepare('SELECT * FROM held_items').all() as Record<string, unknown>[],
    async answer(cardId, optionId) {
      const told: Promise<boolean>[] = [];
      const r = answerCard(
        {
          db: h.db,
          now: () => h.clock.now(),
          engine: {
            send: (kind, payload) => {
              if (kind === 'card.answered') told.push(tidy.onCardAnswered(payload as { cardId: string; choice?: string }));
              return true;
            },
          },
          emitCard: () => {},
          emitMessage: () => {},
          emitChat: () => {},
        },
        { cardId, answer: { optionId }, resolvedBy: 'tap' },
      );
      expect(r.ok).toBe(true);
      await Promise.all(told);
    },
  };
  return w;
}

const askPuneMumbai = (ids: Record<string, string>): TidyAct => ({
  conflicts: [
    {
      factIds: [ids['Lives in Mumbai']!, ids['Lives in Pune']!],
      entity: 'lives in',
      ask: { question: QUESTION, options: ['Pune', 'Mumbai'] },
    },
  ],
});

async function mumbaiThenPune(w: World): Promise<{ mumbai: string; pune: string }> {
  const mumbai = await w.learn(said('Lives in Mumbai'));
  w.h.clock.advance(30 * DAY);
  const pune = await w.learn(said('Lives in Pune'));
  return { mumbai, pune };
}

describe('AT-219 nightly tidy: conflicts, asked once, within the budget', () => {
  it('AT-219: Mumbai and a newer Pune (both You said) → one conflict Choice card in foo’s chat with the why footer, counted in the budget', async () => {
    const w = world(askPuneMumbai);
    const { mumbai, pune } = await mumbaiThenPune(w);
    const r = await w.tidy.run();
    expect(r).toMatchObject({ ok: true, value: { asked: 1, merged: 0, dropped: 0 } });

    const cards = w.cards();
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.state).toBe('asking');
    expect(card.payload).toMatchObject({
      purpose: 'conflict',
      question: QUESTION,
      options: [
        { id: 'o1', label: 'Pune' },
        { id: 'o2', label: 'Mumbai' },
      ],
      reversible: false,
      factIds: [pune, mumbai],
    });
    // Unprompted (counts toward notifications.unpromptedPerDay) with the "Why am I getting this?" source.
    const msg = w.h.db.prepare('SELECT * FROM messages WHERE card_id = ?').get(card.id) as Record<string, unknown>;
    expect(msg).toMatchObject({ chat_id: FOO, author_kind: 'foo', kind: 'card', prompted: 0 });
    expect(JSON.parse(String(msg.why))).toMatchObject({
      source: 'housekeeping',
      suggestionKey: `memory_conflict:${[mumbai, pune].sort().join('-')}`,
    });
    // Both facts stay until the user answers.
    expect(w.h.rows().map((x) => x.text)).toEqual(['Lives in Mumbai', 'Lives in Pune']);
  });

  it('AT-219: asked at most once: the next night’s tidy asks nothing for the same pair', async () => {
    const w = world(askPuneMumbai);
    await mumbaiThenPune(w);
    await w.tidy.run();
    w.h.clock.advance(DAY);
    const again = await w.tidy.run();
    expect(again).toMatchObject({ ok: true, value: { asked: 0 } });
    expect(w.cards()).toHaveLength(1);
  });

  it('AT-219: the answer Pune keeps Pune as “you said · today” and forgets Mumbai with a tombstone', async () => {
    const w = world(askPuneMumbai);
    const { mumbai, pune } = await mumbaiThenPune(w);
    await w.tidy.run();
    w.h.clock.advance(DAY);
    await w.answer(w.cards()[0]!.id, 'o1');
    expect(w.h.rows()).toMatchObject([{ id: pune, text: 'Lives in Pune', provenance: 'said' }]);
    expect(w.h.read('memory/about-you.md')).toContain('Lives in Pune  {you said · 2026-11-16 · chat ·');
    expect(w.h.read('memory/about-you.md')).not.toContain('Mumbai');
    expect(w.h.tombstones()).toHaveLength(1);
    expect(w.cards()[0]!.state).toBe('answered');
    void mumbai;
  });

  it('AT-219: over the daily budget the question is held for the brief (held_items), not posted', async () => {
    const w = world(askPuneMumbai);
    await mumbaiThenPune(w);
    const now = w.h.clock.now();
    for (let i = 0; i < 3; i++)
      w.h.db
        .prepare(
          "INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, prompted, created_at) VALUES (?, ?, ?, 'foo', 'text', 'x', 'complete', 0, ?)",
        )
        .run(`m_un${i}`, FOO, 100 + i, now - 60_000);
    expect(await w.tidy.run()).toMatchObject({ ok: true, value: { asked: 1 } });
    expect(w.cards()).toHaveLength(0);
    const held = w.held();
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ kind: 'memory_conflict', chat_id: FOO });
    expect(JSON.parse(String(held[0]!.payload))).toMatchObject({
      text: QUESTION,
      why: { source: 'housekeeping' },
      open: { kind: 'open_chat', chatId: FOO },
    });
  });

  it('AT-219: inside quiet hours the question is held, not posted', async () => {
    const w = world(askPuneMumbai);
    await mumbaiThenPune(w);
    w.h.clock.advance(14 * 3_600_000); // 9:00 AM IST + 14 h = 11:00 PM (quiet 22:00–07:00 by default)
    await w.tidy.run();
    expect(w.cards()).toHaveLength(0);
    expect(w.held()).toHaveLength(1);
  });
});

describe('08-3 §12.7 tidy steps 1, 3, 4 and the idle catch-up', () => {
  it('step 1: near-duplicates in the same file merge, keeping the newest You said', async () => {
    const w = world(() => ({ conflicts: [] }));
    await w.learn(
      said('Vegetarian on Tuesdays', { provenance: 'guessed', reason: 'from 2 orders', originKind: 'gmail', origin: 'gmail:x' }),
    );
    w.h.clock.advance(DAY);
    const keep = await w.learn(said('Vegetarian on Tuesdays.'));
    w.h.clock.advance(DAY);
    await w.learn(said('Vegetarian on tuesday'));
    const r = await w.tidy.run();
    expect(r).toMatchObject({ ok: true, value: { merged: 2 } });
    // 'Vegetarian on tuesday' is the newest said; the guess and the older said line go.
    expect(w.h.rows().map((x) => x.text)).toEqual(['Vegetarian on tuesday']);
    void keep;
  });

  it('step 1 is skipped while memory is off (G-M6-06); old guesses still go (step 3)', async () => {
    const w = world(askPuneMumbai, { ...IST, privacy: { ...IST.privacy, rememberOn: false } });
    await mumbaiThenPune(w);
    await w.learn(said('Lives in Pune'));
    expect(await w.tidy.run()).toMatchObject({ ok: true, value: { merged: 0, asked: 0 } });
    expect(w.turns).toBe(0);
  });

  it('step 3: a guess unused for 180 days is dropped; one used in that time stays', async () => {
    const w = world(() => ({ conflicts: [] }));
    const g = {
      provenance: 'guessed' as const,
      reason: 'from 4 bookings',
      originKind: 'gmail' as const,
      origin: 'gmail:x',
      category: 'travel' as const,
    };
    await w.learn(said('Prefers window seats', g));
    const used = await w.learn(said('Flies IndiGo', g));
    w.h.clock.advance(100 * DAY);
    w.h.db.prepare('UPDATE memory_index SET last_used_at = ? WHERE id = ?').run(w.h.clock.now(), used);
    w.h.clock.advance(80 * DAY);
    expect(await w.tidy.run()).toMatchObject({ ok: true, value: { dropped: 1 } });
    expect(w.h.rows().map((x) => x.text)).toEqual(['Flies IndiGo']);
  });

  it('step 2: a conflict without a question keeps the newest You said and drops the other', async () => {
    const w = world((ids) => ({ conflicts: [{ factIds: [ids['Lives in Mumbai']!, ids['Lives in Pune']!], entity: 'lives in' }] }));
    await mumbaiThenPune(w);
    expect(await w.tidy.run()).toMatchObject({ ok: true, value: { settled: 1, asked: 0 } });
    expect(w.h.rows().map((x) => x.text)).toEqual(['Lives in Pune']);
  });

  it('step 4: each run appends one line to memory/.tidy-log.md; step 5 counts facts learned this week', async () => {
    const w = world(askPuneMumbai);
    await mumbaiThenPune(w);
    const r = await w.tidy.run();
    expect(r).toMatchObject({ ok: true, value: { weekCount: 1 } });
    await w.tidy.run();
    expect(w.h.read('memory/.tidy-log.md')).toBe(
      '2026-11-15 · Merged 0 duplicates · Settled 0 conflicts · Dropped 0 old guesses · Asked about 1 conflict\n' +
        '2026-11-15 · Merged 0 duplicates · Settled 0 conflicts · Dropped 0 old guesses · Asked about 0 conflicts\n',
    );
  });

  it('missed 03:00 → runs once after 10 minutes of idle (fake clock, fake power idle time)', () => {
    const tz = 'Asia/Kolkata';
    const nineAm = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST
    const lastNight = Date.UTC(2026, 9, 15, 21, 30); // 03:00 IST on the 16th
    // Ran at 03:00 today: nothing to catch up, however idle.
    expect(catchUpDue({ lastRunAt: lastNight, now: nineAm, timeZone: tz, idleSec: 900 })).toBe(false);
    // The PC slept through 03:00: due once the user is idle 600 s, not before.
    const yesterday = lastNight - DAY;
    expect(catchUpDue({ lastRunAt: yesterday, now: nineAm, timeZone: tz, idleSec: 599 })).toBe(false);
    expect(catchUpDue({ lastRunAt: yesterday, now: nineAm, timeZone: tz, idleSec: 600 })).toBe(true);
    // Before 03:00 the slot to compare is yesterday's.
    const twoAm = Date.UTC(2026, 9, 15, 20, 30);
    expect(catchUpDue({ lastRunAt: lastNight - DAY + 60_000, now: twoAm, timeZone: tz, idleSec: 600 })).toBe(false);
  });
});
