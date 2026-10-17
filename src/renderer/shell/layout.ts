// Spec: 03-shell-1 §3.1.3 (breakpoints on the window's content width: L ≥ 1280, M 1008–1279, S 640–1007, XS < 640;
// left 340 default, 300–460 at L, 300–400 at M, 300 fixed at S, full width at XS; main min 480 / 520 / 340; right 340
// pushes at L and overlays at M/S, a page at XS), rule 3.1.3.1 (at L the left shell shrinks, never below 300, before the
// right shell closes; if it still does not fit, the right shell overlays for that width), 3.1.3.3 (XS shows one pane),
// 03-shell-2 §3.7.1 (L open/closed persists in window.rightShellOpen; M/S use ui.rightShellOpenOverlay).
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { XsPane } from '../store/ui';

export type Breakpoint = 'L' | 'M' | 'S' | 'XS';
export type RightMode = 'push' | 'overlay' | 'page' | 'closed';

export const BP_L = 1280;
export const BP_M = 1008;
export const BP_S = 640;
export const LEFT_DEFAULT = 340;
export const LEFT_MIN = 300;
export const LEFT_MAX_L = 460;
export const LEFT_MAX_M = 400;
export const RIGHT_W = 340;
export const MAIN_MIN: Record<Breakpoint, number> = { L: 480, M: 520, S: 340, XS: 0 };

export function breakpointOf(width: number): Breakpoint {
  if (width >= BP_L) return 'L';
  if (width >= BP_M) return 'M';
  if (width >= BP_S) return 'S';
  return 'XS';
}

/** The drag range of the left shell at a breakpoint (null: no resize handle). */
export function leftRange(bp: Breakpoint): { min: number; max: number } | null {
  if (bp === 'L') return { min: LEFT_MIN, max: LEFT_MAX_L };
  if (bp === 'M') return { min: LEFT_MIN, max: LEFT_MAX_M };
  return null;
}

export interface LayoutInput {
  width: number;
  /** settings.window.sidebarWidth (300–460). */
  sidebarWidth: number;
  /** settings.window.rightShellOpen (L). */
  rightOpenL: boolean;
  /** ui.rightShellOpenOverlay (M/S, and L when it does not fit). */
  rightOpenOverlay: boolean;
  xsPane: XsPane;
}

export interface Layout {
  bp: Breakpoint;
  /** Left shell width in px (0 when hidden). */
  left: number;
  right: RightMode;
  showLeft: boolean;
  showMain: boolean;
  resizable: boolean;
}

export function computeLayout(i: LayoutInput): Layout {
  const bp = breakpointOf(i.width);
  if (bp === 'XS') {
    return {
      bp,
      left: i.xsPane === 'list' ? i.width : 0,
      right: i.xsPane === 'panel' ? 'page' : 'closed',
      showLeft: i.xsPane === 'list',
      showMain: i.xsPane === 'chat',
      resizable: false,
    };
  }
  if (bp === 'S')
    return { bp, left: LEFT_MIN, right: i.rightOpenOverlay ? 'overlay' : 'closed', showLeft: true, showMain: true, resizable: false };
  const range = leftRange(bp)!;
  let left = Math.min(Math.max(i.sidebarWidth, range.min), range.max);
  if (bp === 'M') return { bp, left, right: i.rightOpenOverlay ? 'overlay' : 'closed', showLeft: true, showMain: true, resizable: true };
  // L: the right shell pushes when open; 3.1.3.1 shrinks the left shell first, then overlays.
  let right: RightMode = i.rightOpenL ? 'push' : 'closed';
  if (right === 'push' && left + RIGHT_W + MAIN_MIN.L > i.width) {
    left = Math.max(LEFT_MIN, i.width - RIGHT_W - MAIN_MIN.L);
    if (left + RIGHT_W + MAIN_MIN.L > i.width) right = 'overlay';
  }
  if (right === 'closed' && i.rightOpenOverlay) right = 'overlay';
  return { bp, left, right, showLeft: true, showMain: true, resizable: true };
}

// ---------------------------------------------------------------- window width (CSS 100vw)

function subscribe(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

export function useWindowWidth(): number {
  return useSyncExternalStore(subscribe, () => window.innerWidth);
}

export const LayoutContext = createContext<Layout>({
  bp: 'L',
  left: LEFT_DEFAULT,
  right: 'push',
  showLeft: true,
  showMain: true,
  resizable: true,
});

/** The current layout (breakpoint, column widths, right shell mode). For the chat header, panel and list. */
export function useLayout(): Layout {
  return useContext(LayoutContext);
}
