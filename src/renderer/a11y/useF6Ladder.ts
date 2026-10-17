// Spec: 03-shell-2 §3.9.2 (F6 / Shift+F6 pane cycle, hand-built: banner button → selected chat row (or the first) → the last
// focused message, else the newest → the composer field → the right-shell title; wraps, skips hidden panes; XS list view
// 1 → 2, chat view 1 → 3 → 4).
import { useEffect } from 'react';
import { TID } from '../../shared/testids';
import { A_TID, breakpointFor, getState } from '../_m1b-stubs';
import { FOCUS_MESSAGES_EVENT } from '../messages/MessageList';
import { rightShellOpenNow } from '../shell/useRightShell';
import { f6Next, f6Panes, type Pane } from './f6';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const byTid = (id: string) => `[data-testid="${id}"]`;

/** The pane focus is in now, from the DOM. */
export function currentPane(el: Element | null): Pane | null {
  if (!el) return null;
  if (el.closest(byTid(A_TID.bannerStrip))) return 'banner';
  if (el.closest(byTid(A_TID.sidebar))) return 'left';
  if (el.closest(byTid(TID.appPanel))) return 'right';
  if (el.closest(byTid(A_TID.composerField)) || el.closest('[data-composer-row]')) return 'composer';
  if (el.closest(byTid(TID.threadLog))) return 'messages';
  return null;
}

export function focusPane(p: Pane): void {
  switch (p) {
    case 'banner':
      return q(`${byTid(A_TID.bannerStrip)} ${byTid(A_TID.bannerAction)}`)?.focus();
    case 'left': {
      const rows = byTid(A_TID.chatlistRow);
      return (q(`${rows}[aria-selected="true"]`) ?? q(rows))?.focus();
    }
    case 'messages':
      q(byTid(TID.threadLog))?.dispatchEvent(new CustomEvent(FOCUS_MESSAGES_EVENT));
      return;
    case 'composer':
      return (
        q(`${byTid(A_TID.composerField)} textarea, ${byTid(A_TID.composerField)} [contenteditable="true"]`) ?? q(byTid(A_TID.composerField))
      )?.focus();
    case 'right':
      return q(`${byTid(TID.appPanel)} [data-panel-title]`)?.focus();
  }
}

export function useF6Ladder(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F6' || e.ctrlKey || e.altKey || e.metaKey) return;
      const s = getState();
      const bp = breakpointFor(innerWidth);
      const panes = f6Panes({
        xs: bp === 'XS',
        xsPane: s.app.xsPane,
        bannerShown: !!q(byTid(A_TID.bannerAction)),
        rightOpen: s.ui.view.kind === 'chat' && rightShellOpenNow(bp) && !!q(byTid(TID.appPanel)),
        composerPresent: !!q(byTid(A_TID.composerField)),
      });
      const next = f6Next(panes, currentPane(document.activeElement), e.shiftKey ? -1 : 1);
      if (!next) return;
      e.preventDefault();
      focusPane(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
