// Spec: 03-shell-2 §3.9.2 (F6 panes and where focus lands), §3.9.3 (Enter on a chat row opens it and moves focus to the
// composer), 02-3 §F25.3 (focus return). Surfaces register a focus function under a pane name; others call focusPane().
export type Pane = 'banner' | 'chatlist' | 'search' | 'messages' | 'composer' | 'panel';

const targets = new Map<Pane, () => boolean>();

/** Registers how to focus a pane; the function returns false when the pane is not visible. Returns the unregister. */
export function registerFocusTarget(pane: Pane, focus: () => boolean): () => void {
  targets.set(pane, focus);
  return () => {
    if (targets.get(pane) === focus) targets.delete(pane);
  };
}

/** Focuses a pane if it is registered and visible. */
export function focusPane(pane: Pane): boolean {
  return targets.get(pane)?.() ?? false;
}
