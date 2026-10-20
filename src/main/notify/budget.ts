// Spec: 08-3 §15.2 step 5 (the interruption budget runs at message time, before anything is posted, for every item with
// `prompted=0`: today's delivered unprompted count ≥ `notifications.unpromptedPerDay`, or quiet hours and not urgent → the
// item is not posted and not toasted, it is written to `held_items` for the next brief), §15.5 (`budget.countToday` =
// COUNT(messages WHERE prompted = 0 AND deleted_at IS NULL AND local date = today); it counts messages posted, never
// toasts), §15.6 (held kinds; `held_items.payload` = HeldItemPayload, 08-5 §3.8; an urgent item is never held), 08-0 §A
// `notifications.quiet` (a window that crosses midnight belongs to the day it starts on). CR-0010 G-M6-12: M6 builds only
// countToday, hold and the quiet check here; M7 extends this file into the full §15.2 order. Art. 19, R-11.
import type { DbOp } from '../../engine/protocol';
import { newId } from '../../shared/ids';
import type { Settings } from '../../shared/settings';
import type { MessageWhy } from '../../shared/types';
import type { Db } from '../store/db';

/** 08-0 §G.17 `held_items.kind` (the CHECK list). */
export const HELD_ITEM_KINDS = [
  'routine_fire',
  'habit_offer',
  'helper_offer',
  'stale_routine',
  'away_notice',
  'memory_conflict',
  'cap_80',
  'brief_kind_stop',
  'suggestion',
] as const;
export type HeldItemKind = (typeof HELD_ITEM_KINDS)[number];

/** 08-5 §3.8 HeldItemPayload. */
export interface HeldItemPayload {
  text: string;
  why: MessageWhy;
  open: { kind: 'open_chat'; chatId: string; cardId?: string };
  ref: { routineId?: string; suggestionKey?: string; factIds?: string[] };
}

type Quiet = Settings['notifications']['quiet'];

function local(at: number, timeZone: string): { date: string; min: number; wd: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, min: Number(get('hour')) * 60 + Number(get('minute')), wd };
}

const hhmm = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/** The local calendar date `YYYY-MM-DD` of an instant (`settings.locale.timeZone`). */
export function localDate(at: number, timeZone: string): string {
  return local(at, timeZone).date;
}

/** §15.5 `budget.countToday`: unprompted messages posted today (local date), deleted ones not counted. */
export function countToday(db: Db, now: number, timeZone: string): number {
  const today = localDate(now, timeZone);
  // A day is at most 26 h from `now` in any zone; the exact date test runs on each candidate row.
  const rows = db
    .prepare('SELECT created_at FROM messages WHERE prompted = 0 AND deleted_at IS NULL AND created_at > ?')
    .all(now - 26 * 3_600_000) as { created_at: number }[];
  return rows.filter((r) => localDate(Number(r.created_at), timeZone) === today).length;
}

/** §15.2 step 4: true while quiet hours are on and `now` is inside them. */
export function isQuiet(quiet: Quiet, now: number, timeZone: string): boolean {
  if (!quiet.on) return false;
  const { min, wd } = local(now, timeZone);
  const from = hhmm(quiet.from);
  const to = hhmm(quiet.to);
  if (from === to) return false;
  if (from < to) return min >= from && min < to && quiet.days.includes(wd);
  if (min >= from) return quiet.days.includes(wd);
  return min < to && quiet.days.includes((wd + 6) % 7);
}

/** §15.6: the held kind of an unprompted message, from its `why` (the suggestion key's kind when it is a held kind). */
export function heldKindOf(why: MessageWhy): HeldItemKind {
  const keyKind = why.suggestionKey?.split(':')[0] ?? '';
  if ((HELD_ITEM_KINDS as readonly string[]).includes(keyKind)) return keyKind as HeldItemKind;
  if (why.source === 'routine_suggested' || why.source === 'routine_asked') return 'routine_fire';
  if (why.source === 'habit_offer') return 'habit_offer';
  if (why.source === 'cap_warning') return 'cap_80';
  return 'suggestion';
}

/** §15.5 `budget.hold`: the `held_items` insert for one item. */
export function holdOp(item: { kind: HeldItemKind; chatId: string; payload: HeldItemPayload; now: number }): DbOp {
  return {
    op: 'insert',
    table: 'held_items',
    row: {
      id: newId('hi', item.now),
      kind: item.kind,
      chat_id: item.chatId,
      payload: JSON.stringify({ ...item.payload, text: Array.from(item.payload.text).slice(0, 240).join('') }),
      created_at: item.now,
    },
  };
}

const parseWhy = (v: unknown): MessageWhy | null => {
  if (v === null || v === undefined) return null;
  try {
    const o = (typeof v === 'string' ? JSON.parse(v) : v) as MessageWhy;
    return o && typeof o.source === 'string' ? { ...o, vars: o.vars ?? {} } : null;
  } catch {
    return null;
  }
};

/**
 * §15.2 step 5 on one `db.tx`: every inserted message with `prompted` 0 is checked against today's count (rows already
 * posted plus the ones this tx posts) and quiet hours. A held message is not written, nor the card it carries; a
 * `held_items` row takes its place. Returns the ops to apply and the held ids. Prompted messages pass untouched.
 */
export function gateUnprompted(db: Db, s: Settings, now: number, ops: readonly DbOp[]): { ops: DbOp[]; held: string[] } {
  const unprompted = (o: DbOp): o is Extract<DbOp, { op: 'insert' }> =>
    o.op === 'insert' && o.table === 'messages' && (o.row.prompted === 0 || o.row.prompted === false);
  if (!ops.some(unprompted)) return { ops: [...ops], held: [] };
  const tz = s.locale.timeZone;
  const quiet = isQuiet(s.notifications.quiet, now, tz);
  let count = countToday(db, now, tz);
  const heldMessages = new Map<string, DbOp>();
  for (const o of ops) {
    if (!unprompted(o)) continue;
    if (!quiet && count < s.notifications.unpromptedPerDay) {
      count += 1;
      continue;
    }
    const why = parseWhy(o.row.why) ?? { source: 'suggestion', vars: {} };
    const messageId = String(o.row.id);
    const card = ops.find((c) => c.op === 'insert' && c.table === 'cards' && c.row.message_id === messageId) as
      Extract<DbOp, { op: 'insert' }> | undefined;
    const cardPayload = (card ? (typeof card.row.payload === 'string' ? JSON.parse(card.row.payload) : card.row.payload) : {}) as {
      question?: unknown;
      factIds?: unknown;
    };
    const text = String(o.row.text ?? '').trim() || String(cardPayload.question ?? '');
    const factIds = Array.isArray(cardPayload.factIds) ? cardPayload.factIds.map(String) : undefined;
    const chatId = String(o.row.chat_id);
    heldMessages.set(
      messageId,
      holdOp({
        kind: heldKindOf(why),
        chatId,
        now,
        payload: {
          text,
          why,
          open: { kind: 'open_chat', chatId },
          ref: {
            ...(why.routineId ? { routineId: why.routineId } : {}),
            ...(why.suggestionKey ? { suggestionKey: why.suggestionKey } : {}),
            ...(factIds ? { factIds } : {}),
          },
        },
      }),
    );
  }
  if (heldMessages.size === 0) return { ops: [...ops], held: [] };
  const out: DbOp[] = [];
  const held: string[] = [];
  for (const o of ops) {
    if (o.op === 'insert' && o.table === 'cards' && heldMessages.has(String(o.row.message_id))) continue;
    const h = o.op === 'insert' && o.table === 'messages' ? heldMessages.get(String(o.row.id)) : undefined;
    if (h && h.op === 'insert') {
      out.push(h);
      held.push(String(h.row.id));
    } else out.push(o);
  }
  return { ops: out, held };
}
