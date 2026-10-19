// Spec: 08-2 §5.10 item 4 ("At ≥ 80 % (once per month) → amber state + one line in foo's chat (J19.3 step 1)"), 05-3 §5.21
// trigger (at 80 % of the AI cap foo posts one plain line, not a card, no toast: "You've used ₹{800} of your ₹{1,000} AI cap
// this month."), 08-0 §G.17 (`messages.why` source `cap_warning`, the "Why am I getting this?" footer), 08-0 §A
// `money.warnAt80`. The amber state is the meter's own (03-shell-2 §3.7.3.4, 80–99 % --warn). M5 T10, CR-0008 (j) row 2.
// The daily budget and quiet hours of unprompted lines (07-2 R-11) arrive with held items in M11; until then the line posts
// when the turn that crosses 80 % is written.
import { t } from '../../shared/copy/t';
import { formatInr, monthKey } from '../../shared/format';
import { newId } from '../../shared/ids';
import type { Settings } from '../../shared/settings';
import type { MessageWhy, SpendSummary } from '../../shared/types';
import type { Db } from '../store/db';
import { applyDbOps } from '../engine-supervisor/engineHost';
import { fooChatId } from '../store/queries';

const DAY = 86_400_000;
/** 08-2 §5.10 item 4: the warning line from 80 % of the cap. */
export const WARN_AT = 0.8;

/** True when this month's key spend is at 80 % or more of the cap and still under it (at the cap the Spend-cap card speaks). */
export function crossedWarnLine(summary: SpendSummary, s: Settings): boolean {
  if (summary.aiBilling !== 'key' || !s.money.warnAt80 || summary.aiSpentPaise === null) return false;
  return summary.aiSpentPaise >= WARN_AT * summary.aiCapPaise && summary.aiSpentPaise < summary.aiCapPaise;
}

function warnedThisMonth(db: Db, chatId: string, now: number, timeZone: string): boolean {
  const month = monthKey(now, timeZone);
  const rows = db
    .prepare(`SELECT created_at FROM messages WHERE chat_id = ? AND json_extract(why, '$.source') = 'cap_warning' AND created_at >= ?`)
    .all(chatId, now - 32 * DAY) as { created_at: number }[];
  return rows.some((r) => monthKey(Number(r.created_at), timeZone) === month);
}

/** Posts the 80 % line in foo's chat once per month: the new message and its chat (for the upserts), or null. */
export function postCapWarning(
  db: Db,
  s: Settings,
  summary: SpendSummary,
  now: number,
  dataDir?: string,
): { messageId: string; chatId: string } | null {
  if (!crossedWarnLine(summary, s)) return null;
  const chatId = fooChatId(db);
  if (!chatId || warnedThisMonth(db, chatId, now, s.locale.timeZone)) return null;
  const id = newId('m', now);
  const r = applyDbOps(
    db,
    [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id,
          chat_id: chatId,
          author_kind: 'foo',
          author_id: null,
          kind: 'text',
          text: t('thread.cap_warning.line', { spent: formatInr(summary.aiSpentPaise ?? 0), cap: formatInr(summary.aiCapPaise) }),
          status: 'complete',
          why: JSON.stringify({ source: 'cap_warning', vars: {} } satisfies MessageWhy),
          created_at: now,
        },
      },
    ],
    { now, ...(dataDir ? { dataDir } : {}) },
  ).result;
  return r.ok ? { messageId: id, chatId } : null;
}
