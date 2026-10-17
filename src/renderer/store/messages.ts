// Spec: 08-5 §5 `messages.ts { byChat: { ids; byId; oldestSeq; hasMore; lastSeq } }`, rules 2 (rev), 3 (optimistic send
// re-keys in place), 5 (pagination: newest 50 from chat:open, then message:list before oldestSeq). The message column
// that reads this slice is built on top of it.
import type { MessageRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export type StoredMessage = MessageRow & { pending?: boolean; status?: MessageRow['status'] | 'sending' | 'failed' };

export interface ChatMessages {
  ids: string[];
  byId: Record<string, StoredMessage>;
  oldestSeq: number | null;
  hasMore: boolean;
  lastSeq: number;
}

export interface MessagesState {
  byChat: Record<string, ChatMessages>;
}

export const initialMessages = (): MessagesState => ({ byChat: {} });

const emptyChat = (): ChatMessages => ({ ids: [], byId: {}, oldestSeq: null, hasMore: false, lastSeq: 0 });

function sortIds(c: ChatMessages): void {
  c.ids.sort((a, b) => (c.byId[a]?.seq ?? 0) - (c.byId[b]?.seq ?? 0));
}

/** chat:open / bootstrap firstMessages: the newest page; `hasMore` when a full page came back. */
export function loadMessagesReducer(s: MessagesState, chatId: string, rows: MessageRow[], pageSize: number): void {
  const c = emptyChat();
  for (const m of rows) {
    c.byId[m.id] = m;
    c.ids.push(m.id);
  }
  sortIds(c);
  c.oldestSeq = rows.length ? Math.min(...rows.map((m) => m.seq)) : null;
  c.lastSeq = rows.length ? Math.max(...rows.map((m) => m.seq)) : 0;
  c.hasMore = rows.length >= pageSize;
  s.byChat[chatId] = c;
}

/** message:list (older page): prepends, keeps what is loaded. */
export function prependMessagesReducer(s: MessagesState, chatId: string, rows: MessageRow[], pageSize: number): void {
  const c = (s.byChat[chatId] ??= emptyChat());
  for (const m of rows) {
    if (c.byId[m.id]) continue;
    c.byId[m.id] = m;
    c.ids.push(m.id);
  }
  sortIds(c);
  if (rows.length) c.oldestSeq = Math.min(c.oldestSeq ?? Infinity, ...rows.map((m) => m.seq));
  c.hasMore = rows.length >= pageSize;
}

export function upsertMessageReducer(s: MessagesState, row: MessageRow): void {
  const c = (s.byChat[row.chatId] ??= emptyChat());
  const stored = c.byId[row.id];
  if (!acceptRev('message', row.id, stored, row)) return;
  c.byId[row.id] = row;
  if (!stored) {
    c.ids.push(row.id);
    if (row.seq < (c.byId[c.ids[c.ids.length - 2] ?? '']?.seq ?? -Infinity)) sortIds(c);
  }
  c.lastSeq = Math.max(c.lastSeq, row.seq);
  if (c.oldestSeq === null) c.oldestSeq = row.seq;
}

const NO_IDS: string[] = [];
export const selectMessageIds = (chatId: string) => (s: RootState) => s.messages.byChat[chatId]?.ids ?? NO_IDS;
export const selectMessage = (chatId: string, id: string) => (s: RootState) => s.messages.byChat[chatId]?.byId[id];
export const selectChatMessages = (chatId: string) => (s: RootState) => s.messages.byChat[chatId];
