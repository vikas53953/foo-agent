// Spec: 03-shell-1 §3.4.9 context menu actions (pin with the 3-pin limit and its 4 s status line; mark read / unread;
// mute 8 hours / 1 week / always / unmute into settings.notifications.mutedChats; profile; find; clear C-1; delete C-5 /
// C-6 / C-7), 03-shell-2 §3.9.6 (pages and dialogs go through navigate / ui.dialog). Main answers chat:pin with the row.
import type { ChatRow, View } from '../../shared/types';
import { invoke } from '../ipc/client';
import { navigate, openDialog, setFindOpen, update, useStore } from '../store/index';
import { openChat } from '../shell/actions';
import { isUserPinned, MAX_USER_PINS } from './rules';

export const PIN_STATUS_MS = 4000;
export const MUTE_8H_MS = 8 * 3_600_000;
export const MUTE_1W_MS = 7 * 86_400_000;

type StatusListener = (key: 'pin_limit' | null) => void;
const statusListeners = new Set<StatusListener>();

export function onListStatus(l: StatusListener): () => void {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
}

function showStatus(key: 'pin_limit'): void {
  statusListeners.forEach((l) => l(key));
}

export async function togglePin(row: ChatRow): Promise<void> {
  const on = !row.pinned;
  if (on) {
    const s = useStore.getState();
    const pins = s.chats.order.map((id) => s.chats.byId[id]).filter((r): r is ChatRow => !!r && isUserPinned(r)).length;
    if (pins >= MAX_USER_PINS) {
      showStatus('pin_limit');
      return;
    }
  }
  const r = await invoke('chat:pin', { chatId: row.id, on });
  if (!r.ok) {
    if (r.error.message === 'limit') showStatus('pin_limit');
    return;
  }
  update((s) => {
    const stored = s.chats.byId[row.id];
    if (!stored || r.value.rev > stored.rev) s.chats.byId[row.id] = r.value;
  });
}

export function isUnread(row: ChatRow, markedUnread: boolean): boolean {
  return row.unreadCount > 0 || markedUnread;
}

/** "Mark as read" sends chat:markRead up to the newest message; "Mark as unread" shows the dot (session only in M1). */
export function toggleUnread(row: ChatRow, markedUnread: boolean): void {
  if (isUnread(row, markedUnread)) {
    update((s) => {
      delete s.live.markedUnread[row.id];
    });
    if (row.unreadCount > 0) void invoke('chat:markRead', { chatId: row.id, upToSeq: Math.max(0, row.nextSeq - 1) }).catch(() => undefined);
  } else {
    update((s) => {
      s.live.markedUnread[row.id] = true;
    });
  }
}

export function mute(chatId: string, until: number | 'forever' | null): void {
  update((s) => {
    const m = s.settings.value?.notifications.mutedChats;
    if (!m) return;
    if (until === null) delete m[chatId];
    else m[chatId] = until;
  });
  void invoke('chat:mute', { chatId, until }).catch(() => undefined);
}

export function profileView(row: ChatRow): View {
  if (row.kind === 'foo') return { kind: 'screen', id: 'foo-profile' };
  if (row.kind === 'group') return { kind: 'screen', id: 'group-profile', params: { chatId: row.id } };
  return { kind: 'screen', id: 'helper-profile', params: { helperId: row.helperId ?? '', chatId: row.id } };
}

export function openProfile(row: ChatRow): void {
  navigate(profileView(row));
}

export function searchInChat(row: ChatRow): void {
  openChat(row.id);
  setFindOpen(true);
}

export function clearMessages(row: ChatRow): void {
  update((s) => {
    s.ui.dialogTarget = row.id;
  });
  openDialog('c-01');
}

/** C-5 delete helper (C-6 when it has a job queued, working, waiting or needing you), C-7 delete group. */
export function deleteChat(row: ChatRow): void {
  update((s) => {
    s.ui.dialogTarget = row.id;
  });
  if (row.kind === 'group') openDialog('c-07');
  else openDialog(row.list.active ? 'c-06' : 'c-05');
}
