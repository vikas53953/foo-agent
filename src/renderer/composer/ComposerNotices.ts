// Spec: 04-2 §23.2a (X-149: chat-specific errors post a notice in a stack above the composer: a message not sent, a job
// that failed; the same sentence as the in-chat error; newest on top; 3 shown, then "+{n} more"; "Copy code" copies
// `{ErrorKind}-{6-char id}`; Dismiss / Clear all remove the notice only, never undo, retry or delete; notices clear when the
// user leaves the chat for 24 h), 10-1 AT-282, CR-0008 G-M4-12 (M4 builds both sources). The list is derived from the
// rows (messages, jobs, cards), so a notice can never disagree with the chat; only the per-chat view state (what was
// dismissed, when the user left) lives here, renderer-only.
import { create } from 'zustand';
import { t } from '../../shared/copy/t';
import type { CardRow, ErrorKind, JobRow, MessageRow } from '../../shared/types';

export const NOTICE_MAX = 3;
export const AWAY_CLEAR_MS = 24 * 3_600_000;

export interface ErrorNotice {
  /** The source row: a message id (also `local:{clientId}` while unsent) or a job id. `data-row-id`. */
  rowId: string;
  source: 'message' | 'job';
  kind: ErrorKind;
  text: string;
  at: number;
  code: string;
}

export interface NoticeSources {
  chatId: string;
  messages: readonly MessageRow[];
  jobs: readonly JobRow[];
  cards: Readonly<Record<string, CardRow>>;
  /** The ErrorKind message:send returned, by message row id (unknown kinds show as UNKNOWN). */
  sendErrors: Readonly<Record<string, ErrorKind>>;
}

export interface ChatNoticeView {
  /** Failures at or before this time are not notices (first open: 24 h ago; back after 24 h away: the return). */
  clearedBefore: number;
  dismissed: readonly string[];
  leftAt: number | null;
}

/** `{ErrorKind}-{6-char id}`: the last 6 letters or digits of the source row id, upper case (implementation-notes M4 T6). */
export function noticeCode(kind: ErrorKind, rowId: string): string {
  return `${kind}-${rowId
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .toUpperCase()}`;
}

function jobErrorCard(job: JobRow, cards: Readonly<Record<string, CardRow>>): CardRow | undefined {
  let newest: CardRow | undefined;
  for (const c of Object.values(cards))
    if (c.type === 'error' && c.jobId === job.id && (!newest || c.createdAt >= newest.createdAt)) newest = c;
  return newest;
}

/** The chat's notices, newest first, without the dismissed and the cleared ones. Reads rows only; never changes them. */
export function chatNotices(src: NoticeSources, view: ChatNoticeView): ErrorNotice[] {
  const out: ErrorNotice[] = [];
  for (const m of src.messages) {
    if (m.chatId !== src.chatId || m.authorKind !== 'user' || m.status !== 'failed' || m.deletedAt !== null) continue;
    const kind = src.sendErrors[m.id] ?? 'UNKNOWN';
    out.push({ rowId: m.id, source: 'message', kind, text: t('bubble.not_sent.text'), at: m.createdAt, code: noticeCode(kind, m.id) });
  }
  for (const j of src.jobs) {
    if (j.chatId !== src.chatId || j.state !== 'failed') continue;
    const p = jobErrorCard(j, src.cards)?.payload as { kind?: ErrorKind; whatHappened?: string } | undefined;
    // 08-3 §21.2: SITE_HANDBACK is "step handed back", not a failure; its card in the chat is the whole surface (CR-0030).
    if (p?.kind === 'SITE_HANDBACK') continue;
    const kind = p?.kind ?? 'UNKNOWN';
    const text = p?.whatHappened ?? t('errors.unknown.what_happened');
    out.push({ rowId: j.id, source: 'job', kind, text, at: j.finishedAt ?? j.createdAt, code: noticeCode(kind, j.id) });
  }
  const dismissed = new Set(view.dismissed);
  return out.filter((n) => n.at > view.clearedBefore && !dismissed.has(n.rowId)).sort((a, b) => b.at - a.at);
}

/** Max 3 shown, then "+{n} more" (which expands the list in place). */
export function stackView(list: ErrorNotice[], expanded: boolean): { shown: ErrorNotice[]; more: number } {
  if (expanded || list.length <= NOTICE_MAX) return { shown: list, more: 0 };
  return { shown: list.slice(0, NOTICE_MAX), more: list.length - NOTICE_MAX };
}

/** Opening a chat: the first time this session only the last 24 h count; back after ≥ 24 h away, everything clears. */
export function enterChat(view: ChatNoticeView | undefined, now: number): ChatNoticeView {
  if (!view) return { clearedBefore: now - AWAY_CLEAR_MS, dismissed: [], leftAt: null };
  if (view.leftAt !== null && now - view.leftAt >= AWAY_CLEAR_MS) return { clearedBefore: now, dismissed: [], leftAt: null };
  return { ...view, leftAt: null };
}

export function leaveChat(view: ChatNoticeView, now: number): ChatNoticeView {
  return { ...view, leftAt: now };
}

export function dismissNotices(view: ChatNoticeView, rowIds: readonly string[]): ChatNoticeView {
  return { ...view, dismissed: [...new Set([...view.dismissed, ...rowIds])] };
}

// ---------------------------------------------------------------- view state (renderer-only, this session)

interface NoticeStore {
  views: Record<string, ChatNoticeView>;
  expanded: Record<string, boolean>;
  sendErrors: Record<string, ErrorKind>;
}

export const useNoticeStore = create<NoticeStore>()(() => ({ views: {}, expanded: {}, sendErrors: {} }));

const setView = (chatId: string, fn: (v: ChatNoticeView | undefined) => ChatNoticeView) =>
  useNoticeStore.setState((s) => ({ views: { ...s.views, [chatId]: fn(s.views[chatId]) } }));

export const noticesEnter = (chatId: string, now: number) => setView(chatId, (v) => enterChat(v, now));
export const noticesLeave = (chatId: string, now: number) => setView(chatId, (v) => leaveChat(v ?? enterChat(undefined, now), now));
export const noticesDismiss = (chatId: string, rowIds: readonly string[], now: number) =>
  setView(chatId, (v) => dismissNotices(v ?? enterChat(undefined, now), rowIds));
export const noticesExpand = (chatId: string, on: boolean) =>
  useNoticeStore.setState((s) => ({ expanded: { ...s.expanded, [chatId]: on } }));
/** Records the ErrorKind message:send returned for a row, so its notice's code names it. */
export const noteSendError = (rowId: string, kind: ErrorKind) =>
  useNoticeStore.setState((s) => ({ sendErrors: { ...s.sendErrors, [rowId]: kind } }));
