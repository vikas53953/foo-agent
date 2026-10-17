// Spec: 03-shell-2 §3.7.1 (L: pushes, open by default, persisted in settings.window.rightShellOpen (X-91); M/S: overlay,
// closed by default, `ui.rightShellOpenOverlay`, not persisted; XS: full window page), §3.7.1 focus rules, X-21 (Ctrl+Shift+D).
// The shell grid (Shell.tsx, layout.ts) decides the mode; this adds the focus rules on top of shell/actions toggleRightShell.
import { useCallback } from 'react';
import { TID } from '../../shared/testids';
import { useStore } from '../store/index';
import { selectRightShellOpen, selectSidebarWidth } from '../store/settings';
import { toggleRightShell } from './actions';
import { computeLayout, useLayout, type Layout } from './layout';

export type RightShellMode = 'push' | 'overlay' | 'page';

/** The layout now, outside React (key handlers): the same computation Shell.tsx renders with. */
export function layoutNow(): Layout {
  const s = useStore.getState();
  return computeLayout({
    width: window.innerWidth,
    sidebarWidth: selectSidebarWidth(s),
    rightOpenL: selectRightShellOpen(s),
    rightOpenOverlay: s.ui.rightShellOpenOverlay,
    xsPane: s.ui.xsPane,
  });
}

/** Focus goes to the panel title when it opens by keyboard; back to the Panel toggle when it closes. */
function focusSoon(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}
export const focusPanelTitle = () => focusSoon(`[data-testid="${TID.appPanel}"] [data-panel-title]`);
export const focusPanelToggle = () => focusSoon(`[data-testid="${TID.chatHeaderPanel}"]`);

export function rightShellOpenNow(): boolean {
  return useStore.getState().ui.view.kind === 'chat' && layoutNow().right !== 'closed';
}

/** The right shell overlays the chat now (M/S, L when it does not fit, or the XS page). */
export function rightShellOverlaysNow(): boolean {
  const r = layoutNow().right;
  return r === 'overlay' || r === 'page';
}

export function setRightShell(open: boolean, opts: { byKeyboard?: boolean } = {}): void {
  if (rightShellOpenNow() === open) return;
  const focusWasInside = !!document.activeElement?.closest(`[data-testid="${TID.appPanel}"]`);
  toggleRightShell(layoutNow().bp);
  if (open && opts.byKeyboard) focusPanelTitle();
  if (!open && (focusWasInside || opts.byKeyboard)) focusPanelToggle();
}

export function useRightShell() {
  const layout = useLayout();
  const open = layout.right !== 'closed';
  const mode: RightShellMode =
    layout.right === 'closed' ? (layout.bp === 'L' ? 'push' : layout.bp === 'XS' ? 'page' : 'overlay') : layout.right;
  const toggle = useCallback((byKeyboard: boolean) => setRightShell(!rightShellOpenNow(), { byKeyboard }), []);
  const close = useCallback((byKeyboard: boolean) => setRightShell(false, { byKeyboard }), []);
  return { bp: layout.bp, mode, open, toggle, close };
}
