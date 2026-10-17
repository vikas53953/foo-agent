// Spec: 03-shell-2 §3.6.5 (one date separator before the first message of each calendar day; copy "Today, Fri 16 Oct" /
// "Yesterday, Thu 15 Oct" / "Wed 14 Oct" / "Tue 14 Oct 2025"; unread divider before the first unread), §3.6.7 + 04 §19.5
// (start-of-chat line first, 24 above the first separator), 02-2 §F13.3 (per-kind height estimates). Pure.
import { formatDate } from '../../shared/format';
import { t } from '../../shared/copy/t';
import type { MessageRow } from '../_m1b-stubs';

export type VRow =
  | { kind: 'start'; key: string; label: string; messageId?: string }
  | { kind: 'date'; key: string; label: string; dayKey: string }
  | { kind: 'unread'; key: string; label: string }
  | { kind: 'message'; key: string; message: MessageRow };

export interface DateOpts {
  now: number;
  timeZone: string;
}

const DAY = 24 * 3_600_000;

export function dayKey(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

export function dateLabel(at: number, o: DateOpts): string {
  const date = formatDate(at, 'date', o);
  const k = dayKey(at, o.timeZone);
  if (k === dayKey(o.now, o.timeZone)) return t('thread.date.today', { date });
  if (k === dayKey(o.now - DAY, o.timeZone)) return t('thread.date.yesterday', { date });
  return date;
}

/** The earliest of the last `unreadCount` messages not written by the user (the count comes from main, X-117). */
export function firstUnreadId(messages: MessageRow[], unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  const others = messages.filter((m) => m.authorKind !== 'user' && m.kind !== 'marker');
  return others[Math.max(0, others.length - unreadCount)]?.id ?? null;
}

export interface BuildOpts extends DateOpts {
  hasMore: boolean;
  unreadFromId: string | null;
  unreadCount: number;
  chatTitle: string;
  chatCreatedAt: number;
  isFoo: boolean;
  agentName: string;
}

export function startLabel(o: Pick<BuildOpts, 'chatTitle' | 'chatCreatedAt' | 'isFoo' | 'agentName' | 'timeZone'>): string {
  if (o.isFoo) return t('thread.marker.start_of_chat_foo', { agentName: o.agentName });
  // "made {Fri 16 Oct 2026}": the date with its year, always (04 §19.5).
  const date = formatDate(o.chatCreatedAt, 'date', { timeZone: o.timeZone, now: o.chatCreatedAt + 400 * DAY });
  return t('thread.marker.start_of_chat', { name: o.chatTitle, date });
}

export function buildRows(messages: MessageRow[], o: BuildOpts): VRow[] {
  const rows: VRow[] = [];
  const startMarker = messages.find((m) => m.kind === 'marker' && m.markerKind === 'start_of_chat');
  if (!o.hasMore) rows.push({ kind: 'start', key: startMarker ? startMarker.id : 'start', label: startLabel(o), messageId: startMarker?.id });
  let lastDay = '';
  for (const m of messages) {
    if (m === startMarker) continue;
    const k = dayKey(m.createdAt, o.timeZone);
    if (k !== lastDay) {
      rows.push({ kind: 'date', key: `date-${k}`, label: dateLabel(m.createdAt, o), dayKey: k });
      lastDay = k;
    }
    if (m.id === o.unreadFromId) rows.push({ kind: 'unread', key: 'unread', label: t('thread.unread_divider.text', { count: o.unreadCount }) });
    rows.push({ kind: 'message', key: m.id, message: m });
  }
  return rows;
}

/** 02-2 §F13.3 estimates: bubble 56, card by type, marker 40, date separator 56. */
export function estimateRow(r: VRow, cardType: (cardId: string) => string | undefined, cardEstimate: Record<string, number>): number {
  switch (r.kind) {
    case 'date':
      return 56;
    case 'start':
    case 'unread':
      return 40;
    case 'message': {
      if (r.message.kind === 'marker') return 40;
      if (r.message.kind === 'card' && r.message.cardId) return cardEstimate[cardType(r.message.cardId) ?? ''] ?? 160;
      return 56;
    }
  }
}
