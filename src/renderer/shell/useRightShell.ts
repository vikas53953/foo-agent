// Spec: 03-shell-2 §3.7.1 (L: pushes, open by default, persisted in settings.window.rightShellOpen (X-91); M/S: overlay,
// closed by default, `ui.rightShellOpenOverlay`, not persisted; XS: full window page), §3.7.1 focus rules, X-21 (Ctrl+Shift+D).
import { useCallback } from 'react';
import {
  getState,
  selectRightShellOpenOverlay,
  selectSettings,
  setRightShellOpenOverlay,
  setRightShellOpenPersisted,
  useBreakpoint,
  useStore,
  type Breakpoint,
} from '../_m1b-stubs';
import { TID } from '../../shared/testids';

export type RightShellMode = 'push' | 'overlay' | 'page';

export const modeFor = (bp: Breakpoint): RightShellMode => (bp === 'L' ? 'push' : bp === 'XS' ? 'page' : 'overlay');

/** Focus goes to the panel title when it opens by keyboard; back to the Panel toggle when it closes. */
function focusSoon(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}
export const focusPanelTitle = () => focusSoon(`[data-testid="${TID.appPanel}"] [data-panel-title]`);
export const focusPanelToggle = () => focusSoon(`[data-testid="${TID.chatHeaderPanel}"]`);

export function rightShellOpenNow(bp: Breakpoint): boolean {
  const s = getState();
  return modeFor(bp) === 'push' ? s.settings.value.window.rightShellOpen : s.ui.rightShellOpenOverlay;
}

export function setRightShell(bp: Breakpoint, open: boolean, opts: { byKeyboard?: boolean } = {}): void {
  const was = rightShellOpenNow(bp);
  if (was === open) return;
  const focusWasInside = !!document.activeElement?.closest(`[data-testid="${TID.appPanel}"]`);
  if (modeFor(bp) === 'push') setRightShellOpenPersisted(open);
  else setRightShellOpenOverlay(open);
  if (open && opts.byKeyboard) focusPanelTitle();
  if (!open && (focusWasInside || opts.byKeyboard)) focusPanelToggle();
}

export function useRightShell() {
  const bp = useBreakpoint();
  const mode = modeFor(bp);
  const persisted = useStore(selectSettings).window.rightShellOpen;
  const overlay = useStore(selectRightShellOpenOverlay);
  const open = mode === 'push' ? persisted : overlay;
  const toggle = useCallback((byKeyboard: boolean) => setRightShell(bp, !rightShellOpenNow(bp), { byKeyboard }), [bp]);
  const close = useCallback((byKeyboard: boolean) => setRightShell(bp, false, { byKeyboard }), [bp]);
  return { bp, mode, open, toggle, close };
}
