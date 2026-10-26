// Spec: 03-shell-2 §3.9.3 chat list keys that work anywhere in the app (Ctrl+1…9 opens the chat at that position in the
// current list; Alt+↓ / Alt+↑ and Ctrl+Tab / Ctrl+Shift+Tab open the next / previous chat; Alt+Shift+↓ opens the next
// chat that needs you), 09 §9.17 shell shortcuts (Ctrl+N New helper, Ctrl+Shift+N New group, Ctrl+, Settings, Ctrl+/
// Keyboard shortcuts, Ctrl+Shift+F search chats, Ctrl+Shift+P pin, Ctrl+Shift+U unread, Ctrl+M Memory; CR-0060: Ctrl+Shift+M
// mute, Ctrl+I profile of the open chat, Ctrl+W close the window), 03-shell-1 §3.4.2 / §3.4.9
// (the hints shown in menus and tooltips), 09 §9.14.3 app zoom (Ctrl+= / Ctrl+Numpad + in, Ctrl+- / Ctrl+Numpad - out, Ctrl+0
// reset, Ctrl+wheel the same; one `zoom` value shared with Settings → Appearance, AT-321, CR-0021 pick 22). Chat-view keys
// (Ctrl+F, Ctrl+Shift+D, F6, Esc) belong to the main shell.
import { useEffect } from 'react';
import { ZOOM_STEPS } from '../../shared/settingsLists';
import type { FeatureId } from '../../shared/features';
import { focusPane } from '../a11y/focusTargets';
import { mute, openProfile, togglePin, toggleUnread } from '../chatlist/actions';
import { TID } from '../../shared/testids';
import { effectivePill } from '../chatlist/rules';
import { invoke } from '../ipc/client';
import { navigate, openDialog, useStore } from '../store/index';
import { selectIsMuted, selectOrderedChatIds, selectVisibleChatIds } from '../store/chats';
import { selectFeatureOn } from '../store/live';
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

type Zoom = (typeof ZOOM_STEPS)[number];

/** 09 §9.14.3: the next step on the ladder (clamped at 80 and 200 %); a value off the ladder snaps to the nearest step. */
export function zoomStep(current: number, dir: 1 | -1 | 0): Zoom {
  if (dir === 0) return 100;
  const i = ZOOM_STEPS.findIndex((z) => z >= current);
  const at = i < 0 ? ZOOM_STEPS.length - 1 : ZOOM_STEPS[i] === current ? i : dir === 1 ? i - 1 : i;
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + dir))]!;
}

/** The zoom the keys last asked for, so two quick presses step twice before settings:changed comes back. */
let pendingZoom: number | null = null;

function setZoom(dir: 1 | -1 | 0): void {
  const current = pendingZoom ?? useStore.getState().settings.value?.zoom ?? 100;
  const next = zoomStep(current, dir);
  if (next === current) return;
  pendingZoom = next;
  void invoke('settings:set', { path: 'zoom', value: next })
    .catch(() => undefined)
    .finally(() => {
      if (pendingZoom === next) pendingZoom = null;
    });
}

/** Ctrl+= / Ctrl+- / Ctrl+0 (and the numpad keys); true when the key was a zoom key. */
function zoomKey(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.altKey || e.metaKey) return false;
  const dir = e.key === '=' || e.key === '+' ? 1 : e.key === '-' ? -1 : e.key === '0' && !e.shiftKey ? 0 : null;
  if (dir === null) return false;
  e.preventDefault();
  setZoom(dir);
  return true;
}

/** A wheel notch is 100 (Windows reports 100 per notch at 100 %); trackpads send smaller deltas that add up. */
const WHEEL_NOTCH = 100;
/** Small deltas further apart than this are separate gestures, not one notch. */
const WHEEL_IDLE_MS = 300;
let wheelSum = 0;
let wheelAt = 0;

function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (e.timeStamp - wheelAt > WHEEL_IDLE_MS) wheelSum = 0;
  wheelAt = e.timeStamp;
  wheelSum += e.deltaY;
  if (Math.abs(wheelSum) < WHEEL_NOTCH / 2) return;
  const dir = wheelSum < 0 ? 1 : -1;
  wheelSum = 0;
  setZoom(dir);
}

function openId(): string | null {
  const v = useStore.getState().ui.view;
  return v.kind === 'chat' && v.chatId ? v.chatId : null;
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || zoomKey(e)) return;
  const s = useStore.getState();
  if (s.ui.dialog !== null) return;
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
  // CR-0054: a shortcut for a feature this build left off does nothing.
  const on = (id: FeatureId) => selectFeatureOn(id)(s);
  if (key === 'n' && !e.shiftKey) {
    if (setup && on('helpers')) run(() => openDialog('new-helper'));
  } else if (key === 'n' && e.shiftKey) {
    if (setup && on('groups')) run(() => openDialog('new-group'));
  } else if (e.key === ',' && !e.shiftKey) {
    run(() => navigate({ kind: 'settings', page: 'account' }));
  } else if (key === 'm' && !e.shiftKey) {
    if (on('memory')) run(() => navigate({ kind: 'screen', id: 'memory' }));
  } else if (e.key === '/' && !e.shiftKey) {
    run(() => openDialog('shortcuts'));
  } else if (key === 'f' && e.shiftKey) {
    run(() => focusPane('search'));
  } else if (key === 'p' && e.shiftKey && row && row.kind !== 'foo' && row.kind !== 'wa_mirror' && !row.private) {
    run(() => void togglePin(row));
  } else if (key === 'u' && e.shiftKey && row) {
    run(() => toggleUnread(row, s.live.markedUnread[row.id] === true));
  } else if (key === 'm' && e.shiftKey && row && !row.private) {
    // 09 §9.17: unmutes at once; muting opens the chat's options, where Mute holds its 8 hours / 1 week / Always choice.
    if (selectIsMuted(row.id)(s)) run(() => mute(row.id, null));
    else run(() => document.querySelector<HTMLElement>(`[data-testid="${TID.chatHeaderMore}"]`)?.click());
  } else if (key === 'i' && !e.shiftKey && row && !italicKey(e)) {
    if (on(row.kind === 'foo' ? 'name' : 'helpers')) run(() => openProfile(row));
  } else if (key === 'w' && !e.shiftKey) {
    // 09 §9.17 Ctrl+W: the same as ✕ (tray or quit per §9.8.2).
    run(() => window.close());
  }
}

/** 09 §9.17: inside the composer with text selected, Ctrl+I keeps its italic meaning (04 §10). */
function italicKey(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el || !(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.isContentEditable)) return false;
  const sel = window.getSelection();
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    ? (el.selectionEnd ?? 0) > (el.selectionStart ?? 0)
    : !!sel && !sel.isCollapsed;
}

/** Mounted once by the shell. */
export function useShellShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);
}
