// Spec: 03-shell-2 §3.9.3 chat list keys that work anywhere in the app (Ctrl+1…9 opens the chat at that position in the
// current list; Alt+↓ / Alt+↑ and Ctrl+Tab / Ctrl+Shift+Tab open the next / previous chat; Alt+Shift+↓ opens the next
// chat that needs you), 09 §9.17 shell shortcuts (Ctrl+N New helper, Ctrl+Shift+N New group, Ctrl+, Settings, Ctrl+/
// Keyboard shortcuts, Ctrl+Shift+F search chats, Ctrl+Shift+P pin, Ctrl+Shift+U unread), 03-shell-1 §3.4.2 / §3.4.9
// (the hints shown in menus and tooltips). Chat-view keys (Ctrl+F, Ctrl+Shift+D, F6, Esc) belong to the main shell.
import { useEffect } from 'react';
import { focusPane } from '../a11y/focusTargets';
import { togglePin, toggleUnread } from '../chatlist/actions';
import { effectivePill } from '../chatlist/rules';
import { navigate, openDialog, useStore } from '../store/index';
import { selectOrderedChatIds, selectVisibleChatIds } from '../store/chats';
import { openChat } from './actions';

export { KEY_HINT } from './keys';

/** The chat `step` places away from the open one in `ids`, wrapping. */
export function stepChat(ids: string[], openId: string | null, step: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = openId ? ids.indexOf(openId) : -1;
  if (i < 0) return step === 1 ? ids[0]! : ids[ids.length - 1]!;
  return ids[(i + step + ids.length) % ids.length]!;
}

/** The next chat after the open one (wrapping) whose pill is "Needs you". */
export function nextNeedsYou(ids: string[], openId: string | null, needsYou: (id: string) => boolean): string | null {
  const start = openId ? ids.indexOf(openId) : -1;
  for (let n = 1; n <= ids.length; n++) {
    const id = ids[(start + n + ids.length) % ids.length]!;
    if (needsYou(id) && id !== openId) return id;
  }
  return null;
}

function openId(): string | null {
  const v = useStore.getState().ui.view;
  return v.kind === 'chat' && v.chatId ? v.chatId : null;
}

function onKeyDown(e: KeyboardEvent): void {
  const s = useStore.getState();
  if (s.ui.dialog !== null || e.defaultPrevented) return;
  const ctrl = e.ctrlKey && !e.metaKey;
  const setup = s.settings.value?.setup.complete ?? false;
  const run = (fn: () => void) => {
    e.preventDefault();
    fn();
  };

  if (ctrl && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
    const id = selectVisibleChatIds(s)[Number(e.key) - 1];
    if (id) run(() => openChat(id));
    return;
  }
  if ((e.altKey && !ctrl && !e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) || (ctrl && e.key === 'Tab')) {
    const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
    const id = stepChat(selectVisibleChatIds(s), openId(), back ? -1 : 1);
    if (id) run(() => openChat(id));
    return;
  }
  if (e.altKey && e.shiftKey && !ctrl && e.key === 'ArrowDown') {
    const now = s.live.now;
    const id = nextNeedsYou(selectOrderedChatIds(s), openId(), (cid) => {
      const r = s.chats.byId[cid];
      return !!r && effectivePill(r, now) === 'needs_you';
    });
    if (id) run(() => openChat(id));
    return;
  }
  if (!ctrl || e.altKey) return;
  const key = e.key.toLowerCase();
  const row = (() => {
    const id = openId();
    return id ? s.chats.byId[id] : undefined;
  })();
  if (key === 'n' && !e.shiftKey) {
    if (setup) run(() => openDialog('new-helper'));
  } else if (key === 'n' && e.shiftKey) {
    if (setup) run(() => openDialog('new-group'));
  } else if (e.key === ',' && !e.shiftKey) {
    run(() => navigate({ kind: 'settings', page: 'account' }));
  } else if (e.key === '/' && !e.shiftKey) {
    run(() => openDialog('shortcuts'));
  } else if (key === 'f' && e.shiftKey) {
    run(() => focusPane('search'));
  } else if (key === 'p' && e.shiftKey && row && row.kind !== 'foo' && row.kind !== 'wa_mirror' && !row.private) {
    run(() => void togglePin(row));
  } else if (key === 'u' && e.shiftKey && row) {
    run(() => toggleUnread(row, s.live.markedUnread[row.id] === true));
  }
}

/** Mounted once by the shell. */
export function useShellShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
