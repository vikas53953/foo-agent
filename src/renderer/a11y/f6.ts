// Spec: 03-shell-2 §3.9.2 (F6 / Shift+F6 pane cycle, wrapping, skipping hidden panes; XS list view 1 → 2, chat view 1 → 3 → 4,
// the details page 1 → 5). Pure order over the focusTargets pane names; useF6Ladder moves focus.
import type { XsPane } from '../store/ui';
import type { Pane } from './focusTargets';

export type F6Pane = Exclude<Pane, 'search'>;

export const F6_ORDER: F6Pane[] = ['banner', 'chatlist', 'messages', 'composer', 'panel'];

export interface F6Ctx {
  xs: boolean;
  xsPane: XsPane;
  bannerShown: boolean;
  rightOpen: boolean;
  composerPresent: boolean;
}

export function f6Panes(c: F6Ctx): F6Pane[] {
  const chatView = !c.xs || c.xsPane === 'chat';
  const shown: Record<F6Pane, boolean> = {
    banner: c.bannerShown,
    chatlist: !c.xs || c.xsPane === 'list',
    messages: chatView,
    composer: c.composerPresent && chatView,
    // At XS the details page replaces the chat view (it is opened by its own button; F6 then cycles banner → page).
    panel: c.rightOpen && (!c.xs || c.xsPane === 'panel'),
  };
  return F6_ORDER.filter((p) => shown[p]);
}

export function f6Next(panes: F6Pane[], current: F6Pane | null, dir: 1 | -1): F6Pane | null {
  if (!panes.length) return null;
  const i = current ? panes.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? panes[0]! : panes[panes.length - 1]!;
  return panes[(i + dir + panes.length) % panes.length]!;
}
