// Spec: 03-shell-2 §3.9.2 (F6 / Shift+F6 pane cycle, hand-built: banner button → selected chat row (or the first) → the last
// focused message, else the newest → the composer field → the right-shell title; wraps, skips hidden panes; XS list view
// 1 → 2, chat view 1 → 3 → 4). Panes focus themselves through a11y/focusTargets; the banner is reached through its button.
import { useEffect } from 'react';
import { TID } from '../../shared/testids';
import { rightShellOpenNow, layoutNow } from '../shell/useRightShell';
import { useStore } from '../store/index';
import { f6Next, f6Panes, type F6Pane } from './f6';
import { focusPane } from './focusTargets';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const byTid = (id: string) => `[data-testid="${id}"]`;
/** The composer row the main shell reserves; 04's composer fills it (M2) and registers the `composer` pane. */
const COMPOSER = '[data-composer-row] textarea, [data-composer-row] [contenteditable="true"]';

/** The pane focus is in now, from the DOM. */
export function currentPane(el: Element | null): F6Pane | null {
  if (!el) return null;
  if (el.closest(byTid(TID.bannerStrip))) return 'banner';
  if (el.closest(byTid(TID.sidebar))) return 'chatlist';
  if (el.closest(byTid(TID.appPanel))) return 'panel';
  if (el.closest('[data-composer-row]')) return 'composer';
  if (el.closest(byTid(TID.threadLog))) return 'messages';
  return null;
}

function focusF6(p: F6Pane): void {
  if (focusPane(p)) return;
  if (p === 'banner') q(`${byTid(TID.bannerStrip)} ${byTid(TID.bannerAction)}`)?.focus();
  else if (p === 'composer') q(COMPOSER)?.focus();
}

export function useF6Ladder(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F6' || e.ctrlKey || e.altKey || e.metaKey) return;
      const s = useStore.getState();
      const panes = f6Panes({
        xs: layoutNow().bp === 'XS',
        xsPane: s.ui.xsPane,
        bannerShown: !!q(byTid(TID.bannerAction)),
        rightOpen: rightShellOpenNow() && !!q(byTid(TID.appPanel)),
        composerPresent: !!q(COMPOSER),
      });
      const next = f6Next(panes, currentPane(document.activeElement), e.shiftKey ? -1 : 1);
      if (!next) return;
      e.preventDefault();
      focusF6(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
