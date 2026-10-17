// Spec: 03-shell-1 §3.4.3 (search: name and last-message text, case- and accent-insensitive), §3.4.4 (chip membership
// and counts), §3.4.5 (one pill; "Done" fades after 24 h; mirrors never show one), §3.4.7 (folded rule, X-153),
// §3.4.8 (order rules: Needs you › pinned › everything else; private chat under foo; mirrors in block 3 only).
// Pure functions over ChatRow; unit-tested in test/unit/chatlist-rules.test.ts.
import type { ChatFilter, ChatPill, ChatRow } from '../../shared/types';

export const DAY_MS = 86_400_000;
export const DONE_CHIP_MS = 7 * DAY_MS;
export const FOLD_AFTER_MS = DAY_MS;
export const MAX_USER_PINS = 3;

/** The pill the row shows now: "Done" disappears at pillUntil; WhatsApp mirrors never show a pill. */
export function effectivePill(row: Pick<ChatRow, 'kind' | 'pill' | 'pillUntil'>, now: number): ChatPill | null {
  if (row.kind === 'wa_mirror') return null;
  if (row.pill === 'done' && (row.pillUntil === null || row.pillUntil <= now)) return null;
  return row.pill;
}

export const isFooChat = (r: Pick<ChatRow, 'kind' | 'private'>) => r.kind === 'foo' && !r.private;

/** foo's chat is always pinned; user pins are helpers and groups (never mirrors or the private chat). */
export const isUserPinned = (r: ChatRow) => r.pinned && r.kind !== 'foo' && r.kind !== 'wa_mirror' && !r.private;

export function searchKey(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-IN');
}

export function matchesQuery(row: ChatRow, query: string): boolean {
  const key = searchKey(query.trim());
  return !key || row.list.searchText.includes(key) || searchKey(row.title).includes(key);
}

export function inFilter(row: ChatRow, filter: ChatFilter, now: number): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'needs_you':
      return effectivePill(row, now) === 'needs_you';
    case 'working':
      return row.kind !== 'wa_mirror' && row.list.running;
    case 'done':
      return row.list.latestDoneAt !== null && now - row.list.latestDoneAt < DONE_CHIP_MS;
  }
}

export interface ChipCounts {
  needs_you: number;
  working: number;
}

export function chipCounts(rows: ChatRow[], now: number): ChipCounts {
  let needs = 0;
  let working = 0;
  for (const r of rows) {
    if (inFilter(r, 'needs_you', now)) needs++;
    if (inFilter(r, 'working', now)) working++;
  }
  return { needs_you: needs, working };
}

/** X-153: a helper chat folds to one line when nothing is going on in it and its last job ended DONE over 24 h ago. */
export function isFolded(row: ChatRow, now: number, markedUnread = false): boolean {
  return (
    row.kind === 'helper' &&
    !row.list.active &&
    row.unreadCount === 0 &&
    !markedUnread &&
    row.list.lastEndedDoneAt !== null &&
    now - row.list.lastEndedDoneAt > FOLD_AFTER_MS &&
    !row.pinned
  );
}

function needsYouOrder(a: ChatRow, b: ChatRow): number {
  const ea = a.list.needsYou?.expiresAt ?? Infinity;
  const eb = b.list.needsYou?.expiresAt ?? Infinity;
  if (ea !== eb) return ea - eb;
  return (a.list.needsYou?.since ?? Infinity) - (b.list.needsYou?.since ?? Infinity);
}

/** §3.4.8: block 1 Needs you (soonest expiry, then longest waiting), block 2 foo then ≤ 3 pins in pin order, block 3 newest first. */
export function orderChats(rows: ChatRow[], now: number): ChatRow[] {
  const needs = rows.filter((r) => r.kind !== 'wa_mirror' && !r.private && effectivePill(r, now) === 'needs_you').sort(needsYouOrder);
  const inNeeds = new Set(needs.map((r) => r.id));
  const rest = rows.filter((r) => !inNeeds.has(r.id));
  const foo = rest.filter(isFooChat);
  const pins = rest
    .filter(isUserPinned)
    .sort((a, b) => (a.list.pinnedAt ?? 0) - (b.list.pinnedAt ?? 0))
    .slice(0, MAX_USER_PINS);
  const block2 = new Set([...foo, ...pins].map((r) => r.id));
  const block3 = rest
    .filter((r) => !block2.has(r.id) && !r.private)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.id.localeCompare(b.id));
  const out = [...needs, ...foo, ...pins, ...block3];
  // 3.4.8.4: the private chat sits directly under foo's row, wherever foo's row is.
  const priv = rows.find((r) => r.private);
  if (priv) {
    const at = out.findIndex(isFooChat);
    out.splice(at >= 0 ? at + 1 : 0, 0, priv);
  }
  return out;
}

/** The visible list: ordered, then filtered by chip and query ("Done" lists newest finish first). */
export function visibleChats(rows: ChatRow[], filter: ChatFilter, query: string, now: number): ChatRow[] {
  const ordered = orderChats(rows, now).filter((r) => inFilter(r, filter, now) && matchesQuery(r, query));
  if (filter === 'done') return ordered.sort((a, b) => (b.list.latestDoneAt ?? 0) - (a.list.latestDoneAt ?? 0));
  return ordered;
}

/** "99+" above 99 (§3.4.5 unread badge). */
export function unreadText(n: number, overflow: string): string {
  return n > 99 ? overflow : String(n);
}
