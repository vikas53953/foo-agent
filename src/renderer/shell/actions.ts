// Spec: 03-shell-1 §3.1.2 (sidebarWidth, rightShellOpen and lastChatId persist in settings.window), §3.4.1 (resize),
// 03-shell-2 §3.7.1 (Panel toggle and Ctrl+Shift+D: L persists, M/S overlay, XS page), §3.9.3 (opening a chat),
// Article 28 (a cached chat paints at once; store/apply.ts loadChat fetches the rest).
import { invoke } from '../ipc/client';
import { loadChat } from '../store/apply';
import { navigate, update, useStore } from '../store/index';
import type { Breakpoint } from './layout';

/** Persists one settings.window value and applies it locally at once (settings:set answers with the new settings). */
async function setWindowSetting(
  path: 'window.sidebarWidth' | 'window.rightShellOpen' | 'window.lastChatId',
  value: number | boolean | string,
) {
  update((s) => {
    const w = s.settings.value?.window;
    if (!w) return;
    if (path === 'window.sidebarWidth') w.sidebarWidth = value as number;
    else if (path === 'window.rightShellOpen') w.rightShellOpen = value as boolean;
    else w.lastChatId = value as string;
  });
  try {
    const r = await invoke('settings:set', { path, value });
    if (r.ok)
      update((s) => {
        s.settings.value = r.value.settings;
      });
  } catch (e) {
    console.warn('settings:set', path, e);
  }
}

let widthTimer: ReturnType<typeof setTimeout> | null = null;

/** Resizing the left shell: applied at once, saved after the drag settles. */
export function setSidebarWidth(px: number, persistNow = false): void {
  update((s) => {
    if (s.settings.value) s.settings.value.window.sidebarWidth = px;
  });
  if (widthTimer) clearTimeout(widthTimer);
  const save = () => void setWindowSetting('window.sidebarWidth', px);
  if (persistNow) save();
  else widthTimer = setTimeout(save, 500);
}

/** Panel toggle / Ctrl+Shift+D (03-shell-2 §3.7.1). */
export function toggleRightShell(bp: Breakpoint): void {
  const s = useStore.getState();
  if (bp === 'L') {
    if (s.ui.rightShellOpenOverlay) {
      update((d) => {
        d.ui.rightShellOpenOverlay = false;
      });
      return;
    }
    void setWindowSetting('window.rightShellOpen', !(s.settings.value?.window.rightShellOpen ?? true));
  } else if (bp === 'XS') {
    update((d) => {
      d.ui.xsPane = d.ui.xsPane === 'panel' ? 'chat' : 'panel';
    });
  } else {
    update((d) => {
      d.ui.rightShellOpenOverlay = !d.ui.rightShellOpenOverlay;
    });
  }
}

/** Opens a chat from the list, a shortcut or a link: select, remember as lastChatId, fetch if not cached. */
export function openChat(chatId: string): void {
  navigate({ kind: 'chat', chatId });
  if (useStore.getState().settings.value?.window.lastChatId !== chatId) void setWindowSetting('window.lastChatId', chatId);
  loadChat(chatId).catch((e: unknown) => console.warn('chat:open', chatId, e));
}
