// Spec: 03-shell-1 §3.4.9 row context menu (only the items that apply: no pin for foo's chat, mirrors or the private
// chat; no mute for the private chat; profile label per kind; delete for helpers and groups only; mute submenu 8 hours /
// 1 week / Always, or Unmute; shortcut hints Ctrl+Shift+P / U / M), 03-shell-2 §3.9.3 (type a letter: the next chat
// whose name starts with it). Pure; unit-tested.
import { t } from '../../shared/copy/t';
import type { ChatRow as Row } from '../../shared/types';
import { KEY_HINT } from '../shell/keys';
import type { MenuEntry } from '../ui/menuTypes';
import {
  clearMessages,
  deleteChat,
  isUnread,
  mute,
  MUTE_1W_MS,
  MUTE_8H_MS,
  openProfile,
  searchInChat,
  togglePin,
  toggleUnread,
} from './actions';
import { searchKey } from './rules';

/** The §3.4.9 items that apply to a row, in order. */
export function rowMenuEntries(row: Row, ctx: { agentName: string; muted: boolean; markedUnread: boolean; now: number }): MenuEntry[] {
  const out: MenuEntry[] = [];
  const pinnable = row.kind !== 'foo' && row.kind !== 'wa_mirror' && !row.private;
  if (pinnable)
    out.push({
      kind: 'item',
      id: 'pin',
      label: row.pinned ? t('chatlist.menu.unpin') : t('chatlist.menu.pin'),
      tid: 'chatlistMenuPin',
      shortcut: KEY_HINT.pin,
      onSelect: () => void togglePin(row),
    });
  out.push({
    kind: 'item',
    id: 'unread',
    label: isUnread(row, ctx.markedUnread) ? t('chatlist.menu.mark_read') : t('chatlist.menu.mark_unread'),
    tid: 'chatlistMenuUnread',
    shortcut: KEY_HINT.unread,
    onSelect: () => toggleUnread(row, ctx.markedUnread),
  });
  if (!row.private)
    out.push(
      ctx.muted
        ? {
            kind: 'item',
            id: 'mute',
            label: t('chatlist.menu.unmute'),
            tid: 'chatlistMenuMute',
            shortcut: KEY_HINT.mute,
            onSelect: () => mute(row.id, null),
          }
        : {
            kind: 'item',
            id: 'mute',
            label: t('chatlist.menu.mute'),
            tid: 'chatlistMenuMute',
            shortcut: KEY_HINT.mute,
            submenu: [
              {
                kind: 'item',
                id: 'mute-8h',
                label: t('chatlist.menu.mute_8h'),
                tid: 'chatlistMenuMute8h',
                onSelect: () => mute(row.id, ctx.now + MUTE_8H_MS),
              },
              {
                kind: 'item',
                id: 'mute-1w',
                label: t('chatlist.menu.mute_1w'),
                tid: 'chatlistMenuMute1w',
                onSelect: () => mute(row.id, ctx.now + MUTE_1W_MS),
              },
              {
                kind: 'item',
                id: 'mute-always',
                label: t('chatlist.menu.mute_always'),
                tid: 'chatlistMenuMuteAlways',
                onSelect: () => mute(row.id, 'forever'),
              },
            ],
          },
    );
  if (row.kind !== 'wa_mirror') {
    const label =
      row.kind === 'foo'
        ? t('chatlist.menu.profile.foo', { agentName: ctx.agentName })
        : row.kind === 'group'
          ? t('chatlist.menu.profile.group')
          : t('chatlist.menu.profile.helper', { name: row.title });
    out.push({ kind: 'item', id: 'profile', label, tid: 'chatlistMenuProfile', onSelect: () => openProfile(row) });
  }
  out.push({ kind: 'item', id: 'find', label: t('chatlist.menu.find'), tid: 'chatlistMenuFind', onSelect: () => searchInChat(row) });
  out.push({ kind: 'separator', id: 's1' });
  out.push({
    kind: 'item',
    id: 'clear',
    label: t('chatlist.menu.clear'),
    tid: 'chatlistMenuClear',
    destructive: true,
    onSelect: () => clearMessages(row),
  });
  if (row.kind === 'helper' || row.kind === 'group')
    out.push({
      kind: 'item',
      id: 'delete',
      label: row.kind === 'group' ? t('chatlist.menu.delete.group') : t('chatlist.menu.delete.helper'),
      tid: 'chatlistMenuDelete',
      destructive: true,
      onSelect: () => deleteChat(row),
    });
  return out;
}

/** Type-ahead: the next chat after `from` (wrapping) whose name starts with `prefix`. */
export function typeAheadTarget(ids: string[], names: (id: string) => string, from: string | null, prefix: string): string | null {
  const p = searchKey(prefix);
  if (!p) return null;
  const start = from ? ids.indexOf(from) : -1;
  for (let n = 1; n <= ids.length; n++) {
    const id = ids[(start + n) % ids.length]!;
    if (searchKey(names(id)).startsWith(p)) return id;
  }
  return null;
}
