// Spec: 03-shell-1 §3.1.3 (breakpoints and columns), §3.1.3.4 (grid rows: title bar, banner strip, content; the window
// never scrolls), §3.5 (main shell frame: `--bg-app`), 03-shell-2 §3.7.1 (right shell: push at L, overlay at M/S, page at
// XS), §3.9.6 (`settings` and `screen` views replace the main and right shells; the list stays at L/M/S).
// Mount points: `main` (the chat: header, find bar, message column, composer) and `right` (the details panel) are passed
// in by App; the shell gives them their grid cells and the layout through LayoutContext / useLayout().
import type { CSSProperties, ReactNode } from 'react';
import { BannerStrip } from '../banner/BannerStrip';
import { LeftShell } from '../chatlist/LeftShell';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { useStore } from '../store/index';
import { selectRightShellOpen, selectSidebarWidth } from '../store/settings';
import { selectRightShellOpenOverlay, selectView, selectXsPane } from '../store/ui';
import { computeLayout, LayoutContext, useWindowWidth } from './layout';
import styles from './Shell.module.css';
import { TitleBar } from './TitleBar';

export interface ShellProps {
  /** The main shell's chat view (03-shell-2 §3.6). */
  main?: ReactNode;
  /** The right shell (03-shell-2 §3.7); rendered only while it is open. */
  right?: ReactNode;
}

export function Shell({ main, right }: ShellProps) {
  const width = useWindowWidth();
  const sidebarWidth = useStore(selectSidebarWidth);
  const rightOpenL = useStore(selectRightShellOpen);
  const rightOpenOverlay = useStore(selectRightShellOpenOverlay);
  const xsPane = useStore(selectXsPane);
  const view = useStore(selectView);
  const layout = computeLayout({ width, sidebarWidth, rightOpenL, rightOpenOverlay, xsPane });
  const page = view.kind !== 'chat';
  const showRight = !page && layout.right !== 'closed';
  const showMain = page || layout.showMain;
  const showLeft = layout.showLeft && !(layout.bp === 'XS' && page);
  const style = { '--left-w': `${layout.left / 16}rem` } as CSSProperties;

  return (
    <LayoutContext.Provider value={layout}>
      <div className={styles.shell} data-bp={layout.bp} data-right={showRight ? layout.right : 'closed'} style={style}>
        <TitleBar />
        <BannerStrip />
        <div className={styles.content}>
          {showLeft && <LeftShell />}
          {showMain && <div className={styles.main}>{page ? <PlaceholderPage view={view} /> : main}</div>}
          {showRight && (
            <div className={styles.right} data-state={layout.right}>
              {right}
            </div>
          )}
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
