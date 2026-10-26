// Spec: 03-shell-1 §3.1.3 (breakpoints and columns), §3.1.3.4 (grid rows: title bar, banner strip, content; the window
// never scrolls), §3.5 (main shell frame: `--bg-app`), 03-shell-2 §3.7.1 (right shell: push at L, overlay at M/S, page at
// XS), §3.9.6 (`settings` and `screen` views replace the main and right shells; the list stays at L/M/S). M6: the Memory
// page (06-2 §7) is the first real page; the rest stay placeholders until their milestones.
// Mount points: `main` (the chat: header, find bar, message column, composer) and `right` (the details panel) are passed
// in by App; the shell gives them their grid cells and the layout through LayoutContext / useLayout().
// P1 T3 (CR-0021 picks 2, 4, 5; 02 §F7.1 "Pages and panels", "Chat switch", "window restore"): each chat or page change
// remounts the main cell's view, which slides 18px in (from the right; from the left on back); on a page change a still
// copy of the old view fades out over it in `--m-normal` (the cross-fade), chat to chat the new view fades in alone
// (PERF-03); the first view of a launch does not slide. While a dialog
// is open the shell steps back (Dialog sets `data-dialog-open` on the root); a restored window fades up 4px.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion as motionMs } from '../../shared/tokens';
import { reducedMotionNow } from '../a11y/useReducedMotion';
import { tokenMs } from '../ui/tokens';
import { BannerStrip } from '../banner/BannerStrip';
import { LeftShell } from '../chatlist/LeftShell';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { MemoryPage, ShellDialogs } from '../pages/lazyPages';
import { useStore } from '../store/index';
import { selectRightShellOpen, selectSidebarWidth } from '../store/settings';
import { selectRightShellOpenOverlay, selectView, selectXsPane } from '../store/ui';
import type { View } from '../../shared/types';
import { computeLayout, LayoutContext, useWindowWidth } from './layout';
import { useShellShortcuts } from './shortcuts';
import styles from './Shell.module.css';
import { TitleBar } from './TitleBar';

export interface ShellProps {
  /** The main shell's chat view (03-shell-2 §3.6). */
  main?: ReactNode;
  /** The right shell (03-shell-2 §3.7); rendered only while it is open. */
  right?: ReactNode;
}

export function Shell({ main, right }: ShellProps) {
  useShellShortcuts();
  const width = useWindowWidth();
  const sidebarWidth = useStore(selectSidebarWidth);
  // CR-0061 (X-218 item 9): an empty details panel is not opened, by default or by hand.
  const panelEmpty = useStore((s) => s.ui.panelEmpty);
  const rightOpenL = useStore(selectRightShellOpen) && !panelEmpty;
  const rightOpenOverlay = useStore(selectRightShellOpenOverlay) && !panelEmpty;
  const xsPane = useStore(selectXsPane);
  const view = useStore(selectView);
  const backDepth = useStore((s) => s.ui.back.length);
  const motion = useViewMotion(view, backDepth);
  const restored = useRestoreFade();
  const layout = computeLayout({ width, sidebarWidth, rightOpenL, rightOpenOverlay, xsPane });
  const page = view.kind !== 'chat';
  const showRight = !page && layout.right !== 'closed';
  const showMain = page || layout.showMain;
  const showLeft = layout.showLeft && !(layout.bp === 'XS' && page);
  const style = { '--left-w': `${layout.left / 16}rem` } as CSSProperties;

  return (
    <LayoutContext.Provider value={layout}>
      <div
        className={styles.shell}
        data-bp={layout.bp}
        data-right={showRight ? layout.right : 'closed'}
        data-restored={restored || undefined}
        style={style}
      >
        <TitleBar />
        <BannerStrip />
        <div className={styles.content}>
          {showLeft && <LeftShell />}
          {showMain && (
            <div className={styles.main}>
              <ViewFrame key={motion.key} viewKey={motion.key} dir={motion.dir}>
                {view.kind === 'screen' && view.id === 'memory' ? (
                  <MemoryPage key={JSON.stringify(view.params ?? {})} view={view} />
                ) : page ? (
                  <PlaceholderPage view={view} />
                ) : (
                  main
                )}
              </ViewFrame>
            </div>
          )}
          {showRight && (
            <div className={styles.right} data-state={layout.right}>
              {right}
            </div>
          )}
        </div>
        <ShellDialogs />
      </div>
    </LayoutContext.Provider>
  );
}

/**
 * The main cell's view. When it leaves (its key changed) a still copy of it, stripped of ids, test ids and focus, stays
 * over the cell while it fades out in `--m-normal` and is removed when that fade ends (CR-0021 picks 2 and 4); none at Off, where the swap is instant.
 * Chat to chat the old view leaves at once and the new one slides and fades in alone: the copy is a second layout of a
 * whole chat inside the switch, which PERF-03 (< 100 ms, Article 28) cannot carry (CR-0021 close-out).
 */
function ViewFrame({ dir, viewKey: own, children }: { dir: ViewDir; viewKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      const parent = el?.parentElement;
      if (!el || !parent || reducedMotionNow()) return;
      // The store already holds the view this one is replaced by.
      if (own.startsWith('chat:') && selectView(useStore.getState()).kind === 'chat') return;
      const ghost = el.cloneNode(true) as HTMLDivElement;
      const from = el.querySelectorAll('*');
      const scrolled: (() => void)[] = [];
      ghost.querySelectorAll('*').forEach((node, i) => {
        node.removeAttribute('id');
        node.removeAttribute('data-testid');
        const top = from[i]?.scrollTop ?? 0;
        const left = from[i]?.scrollLeft ?? 0;
        if (top || left) scrolled.push(() => node.scrollTo(left, top));
      });
      ghost.className = styles.leaving!;
      ghost.removeAttribute('data-dir');
      ghost.removeAttribute('id');
      ghost.removeAttribute('data-testid');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      parent.append(ghost);
      for (const restore of scrolled) restore();
      // Removed when its own fade ends, or at the latest a beat after it should have (a hidden window runs no frames).
      const done = (e?: AnimationEvent) => {
        if (!e || e.target === ghost) ghost.remove();
      };
      ghost.addEventListener('animationend', done);
      ghost.addEventListener('animationcancel', done);
      setTimeout(done, tokenMs('--m-normal', motionMs.normal) + motionMs.fast);
    };
  }, [own]);
  return (
    <div ref={ref} className={styles.view} data-dir={dir}>
      {children}
    </div>
  );
}

type ViewDir = 'first' | 'forward' | 'back';

/** One key per view the user sees as a new place: a chat, a screen, or Settings (its own pages swap inside it). */
function viewKey(view: View): string {
  if (view.kind === 'chat') return `chat:${view.chatId}`;
  if (view.kind === 'settings') return 'settings';
  return `screen:${view.id}`;
}

/** The main cell's view key and slide direction: `back` when the back stack shrank with this change (03-shell-2 §3.9.6). */
function useViewMotion(view: View, backDepth: number): { key: string; dir: ViewDir } {
  const key = viewKey(view);
  const [seen, setSeen] = useState<{ key: string; backDepth: number; dir: ViewDir }>({ key, backDepth, dir: 'first' });
  if (seen.key !== key || seen.backDepth !== backDepth) {
    // Adjusted while rendering (React's "storing information from previous renders" pattern).
    const dir = seen.key === key ? seen.dir : backDepth < seen.backDepth ? 'back' : 'forward';
    setSeen({ key, backDepth, dir });
  }
  return { key, dir: seen.dir };
}

/** True for one entrance after the window comes back from hidden or minimised (§F7.1 "window restore fades up 4px"). */
function useRestoreFade(): boolean {
  const [restored, setRestored] = useState(false);
  const wasHidden = useRef(document.visibilityState === 'hidden');
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden.current = true;
        setRestored(false);
      } else if (wasHidden.current) {
        wasHidden.current = false;
        setRestored(true);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return restored;
}
