// 08-3 §15.2 step 5, §15.5 `budget.countToday`, §15.6 held items (M6 T7, CR-0010 G-M6-12): the unprompted budget against
// the real schema. Seam: `countToday(db, now, tz)`, `isQuiet`, `gateUnprompted(db, settings, now, ops)` (EngineBridge's db.tx).
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DbOp } from '../../src/engine/protocol';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { countToday, gateUnprompted, isQuiet } from '../../src/main/notify/budget';
import { migrate } from '../../src/main/store/db';
import { TEST_EPOCH_MS } from '../../src/shared/clock';
import type { Settings } from '../../src/shared/settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';

const TZ = 'Asia/Kolkata';
const NOW = TEST_EPOCH_MS; // Fri 16 Oct 2026, 9:00 AM IST
const HOUR = 3_600_000;
const S: Settings = { ...settingsDefaults, locale: { ...settingsDefaults.locale, timeZone: TZ } };

function db() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  migrate(d);
  d.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', 0, 0)").run();
  return d;
}
let seq = 1;
function msg(d: Database.Database, o: { prompted: 0 | 1; at: number; deleted?: boolean }) {
  d.prepare(
    "INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, prompted, created_at, deleted_at) VALUES (?, 'c_1', ?, 'foo', 'text', 'x', 'complete', ?, ?, ?)",
  ).run(`m_${seq}`, seq++, o.prompted, o.at, o.deleted ? o.at : null);
}

const unpromptedCard = (n: number): DbOp[] => [
  {
    op: 'insert',
    table: 'messages',
    row: {
      id: `m_c${n}`,
      chat_id: 'c_1',
      author_kind: 'foo',
      kind: 'card',
      card_id: `k_${n}`,
      status: 'complete',
      prompted: 0,
      why: JSON.stringify({ source: 'housekeeping', suggestionKey: 'memory_conflict:f_a-f_b', vars: {} }),
      created_at: NOW,
    },
  },
  {
    op: 'insert',
    table: 'cards',
    row: {
      id: `k_${n}`,
      chat_id: 'c_1',
      message_id: `m_c${n}`,
      type: 'choice',
      state: 'asking',
      payload: { purpose: 'conflict', question: 'Do you live in Pune now, or Mumbai?', options: [], factIds: ['f_b', 'f_a'] },
      nonce: '0'.repeat(32),
      created_at: NOW,
    },
  },
];

describe('budget.countToday (08-3 §15.5)', () => {
  it('counts unprompted messages posted today in the user’s zone, not prompted, deleted or yesterday’s', () => {
    const d = db();
    msg(d, { prompted: 0, at: NOW - HOUR });
    msg(d, { prompted: 0, at: NOW - 8 * HOUR }); // 1:00 AM IST today
    msg(d, { prompted: 1, at: NOW - HOUR });
    msg(d, { prompted: 0, at: NOW - HOUR, deleted: true });
    msg(d, { prompted: 0, at: NOW - 10 * HOUR }); // 11:00 PM IST yesterday
    expect(countToday(d, NOW, TZ)).toBe(2);
  });
});

describe('quiet hours (08-0 §A notifications.quiet)', () => {
  const q = { on: true, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] };
  it('a window across midnight is quiet from 22:00 to 07:00', () => {
    expect(isQuiet(q, NOW, TZ)).toBe(false); // 9:00 AM
    expect(isQuiet(q, NOW + 13 * HOUR, TZ)).toBe(true); // 10:00 PM
    expect(isQuiet(q, NOW + 21 * HOUR, TZ)).toBe(true); // 6:00 AM next day
    expect(isQuiet(q, NOW + 22 * HOUR, TZ)).toBe(false); // 7:00 AM
    expect(isQuiet({ ...q, on: false }, NOW + 13 * HOUR, TZ)).toBe(false);
  });
  it('the window belongs to the day it starts on (Friday only: Saturday 6:00 AM is quiet, Saturday 10 PM is not)', () => {
    const fri = { ...q, days: [5] };
    expect(isQuiet(fri, NOW + 21 * HOUR, TZ)).toBe(true);
    expect(isQuiet(fri, NOW + 37 * HOUR, TZ)).toBe(false);
  });
});

describe('the unprompted budget on db.tx (08-3 §15.2 step 5)', () => {
  it('under the budget (unpromptedPerDay 3) the card is posted as written', () => {
    const d = db();
    msg(d, { prompted: 0, at: NOW - HOUR });
    msg(d, { prompted: 0, at: NOW - HOUR });
    const g = gateUnprompted(d, S, NOW, unpromptedCard(1));
    expect(g.held).toEqual([]);
    expect(g.ops).toEqual(unpromptedCard(1));
  });

  it('at the budget the item is not posted: a held_items row (kind from the suggestion key) takes its place', () => {
    const d = db();
    for (let i = 0; i < 3; i++) msg(d, { prompted: 0, at: NOW - HOUR });
    const g = gateUnprompted(d, S, NOW, unpromptedCard(1));
    expect(g.held).toHaveLength(1);
    expect(applyDbOps(d, g.ops, { now: NOW }).result.ok).toBe(true);
    expect(d.prepare("SELECT COUNT(*) AS n FROM cards WHERE id = 'k_1'").get()).toEqual({ n: 0 });
    expect(d.prepare("SELECT COUNT(*) AS n FROM messages WHERE id = 'm_c1'").get()).toEqual({ n: 0 });
    const held = d.prepare('SELECT * FROM held_items').get() as Record<string, unknown>;
    expect(held).toMatchObject({ kind: 'memory_conflict', chat_id: 'c_1', delivered_in_brief_id: null });
    expect(JSON.parse(String(held.payload))).toEqual({
      text: 'Do you live in Pune now, or Mumbai?',
      why: { source: 'housekeeping', suggestionKey: 'memory_conflict:f_a-f_b', vars: {} },
      open: { kind: 'open_chat', chatId: 'c_1' },
      ref: { suggestionKey: 'memory_conflict:f_a-f_b', factIds: ['f_b', 'f_a'] },
    });
  });

  it('counts this tx’s own posts: with 2 today, the first of two items posts and the second is held', () => {
    const d = db();
    msg(d, { prompted: 0, at: NOW - HOUR });
    msg(d, { prompted: 0, at: NOW - HOUR });
    const g = gateUnprompted(d, S, NOW, [...unpromptedCard(1), ...unpromptedCard(2)]);
    expect(g.held).toHaveLength(1);
    expect(g.ops.map((o) => (o.op === 'insert' ? o.table : o.op))).toEqual(['messages', 'cards', 'held_items']);
  });

  it('a budget of 0 holds every unprompted item; prompted messages are never held', () => {
    const d = db();
    const zero: Settings = { ...S, notifications: { ...S.notifications, unpromptedPerDay: 0 } };
    expect(gateUnprompted(d, zero, NOW, unpromptedCard(1)).held).toHaveLength(1);
    const prompted = unpromptedCard(2).map((o) =>
      o.op === 'insert' && o.table === 'messages' ? { ...o, row: { ...o.row, prompted: 1 } } : o,
    );
    expect(gateUnprompted(d, zero, NOW, prompted).ops).toEqual(prompted);
  });

  it('inside quiet hours the item is held even under the budget', () => {
    const d = db();
    expect(gateUnprompted(d, S, NOW + 13 * HOUR, unpromptedCard(1)).held).toHaveLength(1);
  });
});
