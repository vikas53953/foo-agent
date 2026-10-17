// Spec: 03-shell-2 §3.9.2 (F6 / Shift+F6 pane cycle, wrapping, skipping hidden panes; XS list view 1 → 2, chat view 1 → 3 → 4).
// Pure order; useF6Ladder moves focus.
export type Pane = 'banner' | 'left' | 'messages' | 'composer' | 'right';

export const F6_ORDER: Pane[] = ['banner', 'left', 'messages', 'composer', 'right'];

export interface F6Ctx {
  xs: boolean;
  xsPane: 'list' | 'chat';
  bannerShown: boolean;
  rightOpen: boolean;
  composerPresent: boolean;
}

export function f6Panes(c: F6Ctx): Pane[] {
  const shown: Record<Pane, boolean> = {
    banner: c.bannerShown,
    left: !c.xs || c.xsPane === 'list',
    messages: !c.xs || (c.xsPane === 'chat' && !c.rightOpen),
    composer: c.composerPresent && (!c.xs || (c.xsPane === 'chat' && !c.rightOpen)),
    // At XS the details page replaces the chat view (it is opened by its own button; F6 then cycles banner → page).
    right: c.rightOpen && (!c.xs || c.xsPane === 'chat'),
  };
  return F6_ORDER.filter((p) => shown[p]);
}

export function f6Next(panes: Pane[], current: Pane | null, dir: 1 | -1): Pane | null {
  if (!panes.length) return null;
  const i = current ? panes.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? panes[0]! : panes[panes.length - 1]!;
  return panes[(i + dir + panes.length) % panes.length]!;
}
