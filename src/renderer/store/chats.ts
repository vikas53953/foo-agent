// Spec: 08-5 §5 `chats.ts { byId; order; selectedId }`, rule 2 (a patch applies only when patch.rev > stored.rev; a gap
// is applied and logged once per chat per session), 03-shell-1 §3.4.4 (chip counts), §3.4.8 (order), 08-1 §3.3
// (chat:upsert, chat:removed). Selectors return stable values; list selectors return id arrays for useShallow.
import type { ChatRow } from '../../shared/types';
import { chipCounts, isFolded, visibleChats, type ChipCounts } from '../chatlist/rules';
import type { RootState } from './index';

export interface ChatsState {
  byId: Record<string, ChatRow>;
  /** Ids as main sent them (newest activity first); the list order is derived by selectVisibleChatIds. */
  order: string[];
  selectedId: string | null;
}

export const initialChats = (): ChatsState => ({ byId: {}, order: [], selectedId: null });

const revGapLogged = new Set<string>();

/** 08-0 §B.1 rev rule, shared by every row slice. Returns true when the patch should be applied. */
export function acceptRev(kind: string, id: string, stored: { rev: number } | undefined, patch: { rev: number }): boolean {
  if (!stored) return true;
  if (patch.rev <= stored.rev) return false;
  if (patch.rev > stored.rev + 1 && !revGapLogged.has(`${kind}:${id}`)) {
    revGapLogged.add(`${kind}:${id}`);
    console.warn(`rev gap ${kind} ${id}: ${stored.rev} → ${patch.rev}`);
  }
  return true;
}

export function loadChatsReducer(s: ChatsState, rows: ChatRow[]): void {
  s.byId = {};
  for (const r of rows) s.byId[r.id] = r;
  s.order = rows.map((r) => r.id);
}

export function upsertChatReducer(s: ChatsState, row: ChatRow): void {
  if (!acceptRev('chat', row.id, s.byId[row.id], row)) return;
  if (!s.byId[row.id]) s.order.unshift(row.id);
  s.byId[row.id] = row;
}

export function removeChatReducer(s: ChatsState, chatId: string): void {
  delete s.byId[chatId];
  s.order = s.order.filter((id) => id !== chatId);
  if (s.selectedId === chatId) s.selectedId = null;
}

export const selectChat = (chatId: string | null) => (s: RootState) => (chatId ? s.chats.byId[chatId] : undefined);
export const selectSelectedChatId = (s: RootState) => s.chats.selectedId;

const rowsOf = (s: RootState) => s.chats.order.map((id) => s.chats.byId[id]).filter((r): r is ChatRow => !!r);

/** The ids the list shows, in §3.4.8 order, filtered by the chip and the search text. Use with useShallow. */
export const selectVisibleChatIds = (s: RootState): string[] =>
  visibleChats(rowsOf(s), s.ui.chatFilter, s.ui.chatQuery, s.live.now).map((r) => r.id);

/** Every chat in §3.4.8 order, ignoring chip and search (Ctrl+1…9, Alt+↓, "next that needs you"). */
export const selectOrderedChatIds = (s: RootState): string[] => visibleChats(rowsOf(s), 'all', '', s.live.now).map((r) => r.id);

/** Chip counts (§3.4.4). Returns a new object; read the two numbers separately or use useShallow. */
export const selectChipCounts = (s: RootState): ChipCounts => chipCounts(rowsOf(s), s.live.now);

export const selectFooChatId = (s: RootState): string | null =>
  s.chats.order.find((id) => s.chats.byId[id]?.kind === 'foo' && !s.chats.byId[id]?.private) ?? null;

export const selectIsFolded = (chatId: string) => (s: RootState) => {
  const row = s.chats.byId[chatId];
  return !!row && isFolded(row, s.live.now, s.live.markedUnread[chatId] === true);
};

export const selectIsMuted = (chatId: string) => (s: RootState) => {
  const until = s.settings.value?.notifications.mutedChats[chatId];
  return until !== undefined && (until === 'forever' || until > s.live.now);
};
