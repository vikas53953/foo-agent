// Spec: 03-shell-2 §3.9.4 (Esc does exactly one thing, the first that applies; never quits, closes the window or answers a
// card; composer-owned Esc meanings run first, 04-2 §22.9), 02-3 §F25.3 (one root handler). Pure decision; useEscLadder runs it.
export type EscRung = 'composer' | 'menu' | 'dialog' | 'selection' | 'find' | 'rightShell' | 'search' | 'pageBack' | 'xsBack';

export interface EscState {
  /** A menu, popover or tooltip is open (it closes itself and stops the event; the ladder only yields). */
  menuOpen: boolean;
  dialogOpen: boolean;
  selecting: boolean;
  findOpen: boolean;
  rightShellOpen: boolean;
  focusInRightShell: boolean;
  /** M/S overlay or the XS page. */
  rightShellOverlay: boolean;
  searchHasText: boolean;
  viewKind: 'chat' | 'settings' | 'screen';
  /** XS and the chat view is showing. */
  xsChatView: boolean;
  focusInComposer: boolean;
}

export function escRung(s: EscState): EscRung | null {
  if (s.focusInComposer) return 'composer';
  if (s.menuOpen) return 'menu';
  if (s.dialogOpen) return 'dialog';
  if (s.selecting) return 'selection';
  if (s.findOpen) return 'find';
  if (s.rightShellOpen && (s.focusInRightShell || s.rightShellOverlay)) return 'rightShell';
  if (s.searchHasText) return 'search';
  if (s.viewKind === 'settings' || s.viewKind === 'screen') return 'pageBack';
  if (s.xsChatView) return 'xsBack';
  return null;
}
