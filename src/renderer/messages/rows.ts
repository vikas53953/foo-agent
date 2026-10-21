// Spec: 03-shell-2 §3.6.5 (one date separator before the first message of each calendar day; copy "Today, Fri 16 Oct" /
// "Yesterday, Thu 15 Oct" / "Wed 14 Oct" / "Tue 14 Oct 2025"; unread divider before the first unread), §3.6.7 + 04 §19.5
// (start-of-chat line first, 24 above the first separator), 02-2 §F13.3 (per-kind height estimates); 04 §14.2 / §14.3 (the
// status line or the Thinking row sits where foo's next bubble will appear), §10.11 (a WhatsApp mirror shows the retention
// line and its mirrored rows), §12.3 (one message is one row: a reply is never split into several bubbles, CR-0024 F2). Pure.
import { formatDate } from '../../shared/format';
import { t } from '../../shared/copy/t';
import type { MessageRow, WaMessageRow } from '../../shared/types';

export type VRow =
  | { kind: 'start'; key: string; label: string; messageId?: string }
  | { kind: 'date'; key: string; label: string; dayKey: string }
  | { kind: 'unread'; key: string; label: string }
  | { kind: 'message'; key: string; message: MessageRow }
  | { kind: 'status'; key: string; text: string }
  | { kind: 'thinking'; key: string; helperId: string | null }
  | { kind: 'retention'; key: string }
  | { kind: 'wa'; key: string; wa: WaMessageRow }
  // M8 T7: 04 §10.11 "Draft ready in {agentName}'s chat." under the mirror's messages.
  | { kind: 'wa_draft'; key: string; draftCardId: string; fooChatId: string };

export interface DateOpts {
  now: number;
  timeZone: string;
}

const DAY = 24 * 3_600_000;

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** "2026-10-16" in `timeZone`. One formatter per zone: building an Intl.DateTimeFormat costs far more than using it, and
 *  buildRows calls this for every loaded message each time a page of history arrives (PERF-04). */
export function dayKey(at: number, timeZone: string): string {
  let f = dayFormats.get(timeZone);
  if (!f) dayFormats.set(timeZone, (f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })));
  // The same instants come back on every page of history: each is formatted once per zone (the newest DAY_KEYS_MAX).
  const memo = `${timeZone}|${at}`;
  const hit = dayKeys.get(memo);
  if (hit !== undefined) return hit;
  const k = f.format(at);
  if (dayKeys.size >= DAY_KEYS_MAX) dayKeys.delete(dayKeys.keys().next().value as string);
  dayKeys.set(memo, k);
  return k;
}
const DAY_KEYS_MAX = 20_000;
const dayKeys = new Map<string, string>();

/** A message's day key, kept on the message object (buildRows runs over every loaded message on each page of history). */
const messageDays = new WeakMap<MessageRow, { timeZone: string; key: string }>();
function messageDay(m: MessageRow, timeZone: string): string {
  const hit = messageDays.get(m);
  if (hit?.timeZone === timeZone) return hit.key;
  const key = dayKey(m.createdAt, timeZone);
  messageDays.set(m, { timeZone, key });
  return key;
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
  if (!o.hasMore)
    rows.push({ kind: 'start', key: startMarker ? startMarker.id : 'start', label: startLabel(o), messageId: startMarker?.id });
  let lastDay = '';
  for (const m of messages) {
    if (m === startMarker) continue;
    const k = messageDay(m, o.timeZone);
    if (k !== lastDay) {
      rows.push({ kind: 'date', key: `date-${k}`, label: dateLabel(m.createdAt, o), dayKey: k });
      lastDay = k;
    }
    if (m.id === o.unreadFromId)
      rows.push({ kind: 'unread', key: 'unread', label: t('thread.unread_divider.text', { count: o.unreadCount }) });
    rows.push({ kind: 'message', key: m.id, message: m });
  }
  return rows;
}

/** 04 §10.11: the mirror's rows: the retention line, date separators, then the mirrored messages (oldest first). */
export function buildWaRows(
  rows: WaMessageRow[],
  o: DateOpts,
  drafts: readonly { draftCardId: string; fooChatId: string; at: number }[] = [],
): VRow[] {
  const out: VRow[] = [{ kind: 'retention', key: 'retention' }];
  let lastDay = '';
  // M8 T7: each draft marker sits after the mirrored messages that came before it.
  let d = 0;
  const marks = (until: number) => {
    for (; d < drafts.length && drafts[d]!.at <= until; d++)
      out.push({
        kind: 'wa_draft',
        key: `wa-draft-${drafts[d]!.draftCardId}`,
        draftCardId: drafts[d]!.draftCardId,
        fooChatId: drafts[d]!.fooChatId,
      });
  };
  for (const w of rows) {
    marks(w.at - 1);
    const k = dayKey(w.at, o.timeZone);
    if (k !== lastDay) {
      out.push({ kind: 'date', key: `date-${k}`, label: dateLabel(w.at, o), dayKey: k });
      lastDay = k;
    }
    out.push({ kind: 'wa', key: w.id, wa: w });
  }
  marks(Infinity);
  return out;
}

const CHARS_PER_LINE = 60;
const LINE = 22;

/** A text bubble's estimate: 56 for one or two lines, then 22 per line (rich answers and long texts measure later anyway). */
export function estimateText(text: string, attachments: number): number {
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / CHARS_PER_LINE)), 0);
  return 56 + Math.max(0, lines - 1) * LINE + (attachments ? 204 : 0);
}

/** Kept per message object (immutable): the virtualiser re-reads every row's estimate whenever the row count changes,
 *  which is every page of history (PERF-04). */
const textEstimates = new WeakMap<MessageRow, number>();
function textEstimate(m: MessageRow): number {
  let e = textEstimates.get(m);
  if (e === undefined) textEstimates.set(m, (e = estimateText(m.text, m.attachments?.length ?? 0)));
  return e;
}

/** 02-2 §F13.3 estimates: bubble 56 (longer text grows), card by type, marker 40, date separator 56, voice 88. */
export function estimateRow(r: VRow, cardType: (cardId: string) => string | undefined, cardEstimate: Record<string, number>): number {
  switch (r.kind) {
    case 'date':
      return 56;
    case 'start':
    case 'unread':
    case 'retention':
    case 'wa_draft': // M8 T7
    case 'status':
      return 40;
    case 'thinking':
      return 46;
    case 'wa':
      return estimateText(r.wa.text, 0) + (r.wa.fromMe ? 0 : 18);
    case 'message': {
      const m = r.message;
      if (m.kind === 'marker') return 40;
      if (m.kind === 'card' && m.cardId) return cardEstimate[cardType(m.cardId) ?? ''] ?? 160;
      if (m.kind === 'voice') return 88;
      if (m.deletedAt !== null) return 56;
      return textEstimate(m);
    }
  }
}
