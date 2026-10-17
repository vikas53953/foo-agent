// Spec: 03-shell-2 §3.9.4 (Esc ladder: exactly one thing, the first that applies; never quits, closes the window or answers a
// card; composer-owned Esc runs first), 02-3 §F25.3 (implemented once, at the root). Surfaces that own an Esc meaning (menus,
// the find field, the search field, the right shell, dialogs) handle it themselves and stop the event; this root handler covers
// the rest, from wherever focus is, in the ladder's order.
import { useEffect } from 'react';
import { TID } from '../../shared/testids';
import { chatSearch } from '../chatlist/ChatSearch';
import { closeFind } from '../shell/FindBar';
import { layoutNow, rightShellOpenNow, rightShellOverlaysNow, setRightShell } from '../shell/useRightShell';
import { back, clearSelection, closeDialog, setMenu, setXsPane, useStore } from '../store/index';
import { escRung, type EscRung, type EscState } from './escLadder';

export function readEscState(): EscState {
  const s = useStore.getState();
  const active = document.activeElement;
  return {
    focusInComposer: !!active?.closest('[data-composer-row]'),
    menuOpen: s.ui.menu !== null || !!document.querySelector('[role="menu"]'),
    dialogOpen: s.ui.dialog !== null,
    selecting: s.ui.selection.size > 0,
    findOpen: s.ui.findOpen,
    rightShellOpen: rightShellOpenNow(),
    focusInRightShell: !!active?.closest(`[data-testid="${TID.appPanel}"]`),
    rightShellOverlay: rightShellOverlaysNow(),
    searchHasText: chatSearch.hasText(),
    viewKind: s.ui.view.kind,
    xsChatView: layoutNow().bp === 'XS' && s.ui.view.kind === 'chat' && s.ui.xsPane === 'chat',
  };
}

/** Runs one rung. `composer` belongs to its owner, so the ladder only yields to it. */
export function runEscRung(rung: EscRung): void {
  switch (rung) {
    case 'composer':
      return;
    case 'menu':
      // A menu that has focus closes itself; one left open without focus (a click elsewhere) closes here.
      return setMenu(null);
    case 'dialog':
      return closeDialog();
    case 'selection':
      return clearSelection();
    case 'find':
      return closeFind();
    case 'rightShell':
      return setRightShell(false, { byKeyboard: true });
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
      if (!rung || rung === 'composer') return;
      e.preventDefault();
      runEscRung(rung);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
