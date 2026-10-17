// Spec: 03-shell-2 §3.9.4 (Esc ladder: exactly one thing, the first that applies; never quits, closes the window or answers a
// card; composer-owned Esc runs first), 02-3 §F25.3 (implemented once, at the root). Surfaces that own an Esc meaning (menus,
// the find field, the right shell, dialogs) handle it themselves and stop the event; this root handler covers the rest, from
// wherever focus is, in the ladder's order.
import { useEffect } from 'react';
import { TID } from '../../shared/testids';
import {
  A_TID,
  back,
  breakpointFor,
  chatSearch,
  clearSelection,
  getState,
  setDialog,
  setXsPane,
} from '../_m1b-stubs';
import { closeFind } from '../shell/FindBar';
import { modeFor, rightShellOpenNow, setRightShell } from '../shell/useRightShell';
import { escRung, type EscRung, type EscState } from './escLadder';

export function readEscState(): EscState {
  const s = getState();
  const bp = breakpointFor(innerWidth);
  const active = document.activeElement;
  return {
    focusInComposer: !!active?.closest(`[data-testid="${A_TID.composerField}"]`),
    menuOpen: !!document.querySelector('[role="menu"], [role="tooltip"][data-open]'),
    dialogOpen: s.ui.dialog !== null,
    selecting: s.ui.selection.size > 0,
    findOpen: s.ui.findOpen,
    rightShellOpen: s.ui.view.kind === 'chat' && rightShellOpenNow(bp),
    focusInRightShell: !!active?.closest(`[data-testid="${TID.appPanel}"]`),
    rightShellOverlay: modeFor(bp) !== 'push',
    searchHasText: chatSearch.hasText(),
    viewKind: s.ui.view.kind,
    xsChatView: bp === 'XS' && s.ui.view.kind === 'chat' && s.app.xsPane === 'chat',
  };
}

/** Runs one rung. `composer` and `menu` belong to their owners, so the ladder only yields to them. */
export function runEscRung(rung: EscRung): void {
  switch (rung) {
    case 'composer':
    case 'menu':
      return;
    case 'dialog':
      return setDialog(null);
    case 'selection':
      return clearSelection();
    case 'find':
      return closeFind();
    case 'rightShell':
      return setRightShell(breakpointFor(innerWidth), false, { byKeyboard: true });
    case 'search':
      return chatSearch.clear();
    case 'pageBack':
      return back();
    case 'xsBack':
      return setXsPane('list');
  }
}

export function useEscLadder(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const rung = escRung(readEscState());
      if (!rung || rung === 'composer' || rung === 'menu') return;
      e.preventDefault();
      runEscRung(rung);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
