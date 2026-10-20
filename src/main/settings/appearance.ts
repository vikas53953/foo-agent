// Spec: 06-2 §6.2 (Appearance rows apply live, no restart; theme and accent reach every open window), 09 §9.14.3 (zoom:
// `webContents.setZoomFactor`, `titleBarOverlay.height = round(32 × zoom)`), 02-3 §F28.1 (theme: `nativeTheme.themeSource`),
// §F28.4 as amended by X-179 (optional Mica: Windows 11 build ≥ 22000 + "Transparency effects" on + setting on, not high
// contrast, not FOO_TEST), CR-0021 picks 21–22, AT-319, AT-321.
import { nativeTheme, type BrowserWindow } from 'electron';
import { release } from 'node:os';
import type { Settings } from '../../shared/settings';
import { tokens } from '../../shared/tokens';
import { testHooksEnabled } from '../ipc/guard';
import type { SettingsStore } from './Settings';

/** The Settings row's state and whether the window draws Mica right now. */
export type MicaState = { row: 'hidden' | 'disabled' | 'enabled'; on: boolean };

export interface MicaInputs {
  platform: NodeJS.Platform;
  /** The Windows build number (22000 = the first Windows 11); 0 when unknown or not Windows. */
  osBuild: number;
  /** Windows "Transparency effects" on (`!nativeTheme.prefersReducedTransparency`). */
  transparency: boolean;
  highContrast: boolean;
  setting: boolean;
  /** A FOO_TEST run: surfaces stay solid so golden pictures never depend on the wallpaper. */
  test: boolean;
}

const WIN11_BUILD = 22000;

/** AT-319: Mica only on Windows 11 + transparency on + setting on, not high contrast, not FOO_TEST; solid otherwise. */
export function micaDecision(i: MicaInputs): MicaState {
  const win10 = i.platform === 'win32' && i.osBuild < WIN11_BUILD;
  const row = win10 ? 'hidden' : !i.transparency || i.highContrast ? 'disabled' : 'enabled';
  const on = i.platform === 'win32' && !win10 && i.transparency && !i.highContrast && i.setting && !i.test;
  return { row, on };
}

/** `os.release()` on Windows is "10.0.<build>". */
export function windowsBuild(rel: string = release()): number {
  return Number(/^\d+\.\d+\.(\d+)/.exec(rel)?.[1] ?? 0);
}

/** 09 §9.14.3: the title bar overlay grows with the zoom so the caption buttons line up with the 32px bar. */
export const overlayHeight = (zoom: number): number => Math.round(tokens.size['titlebar-h'] * (zoom / 100));

function micaNow(s: Settings): MicaState {
  return micaDecision({
    platform: process.platform,
    osBuild: process.platform === 'win32' ? windowsBuild() : 0,
    transparency: !nativeTheme.prefersReducedTransparency,
    highContrast: nativeTheme.inForcedColorsMode,
    setting: s.appearance.mica,
    test: testHooksEnabled(),
  });
}

/** The current Mica state for the main window, read once at creation (`backgroundMaterial`). */
export const initialMica = (s: Settings): MicaState => micaNow(s);

/** Tells the page whether Mica is on (`<html data-mica>`, styles/mica.css) and how to show the row (`data-mica-row`). */
function markPage(win: BrowserWindow, m: MicaState): void {
  if (win.isDestroyed()) return;
  const js = `(() => { const r = document.documentElement; r.toggleAttribute('data-mica', ${m.on}); r.dataset.micaRow = '${m.row}'; })()`;
  void win.webContents.executeJavaScript(js, false).catch(() => undefined);
}

/**
 * Applies the Appearance settings to the main window and keeps them live: theme (every window, through nativeTheme),
 * zoom and overlay height, Mica. `overlay` gives the theme's overlay colours. Returns the unsubscribe function.
 */
export function applyAppearance(
  win: BrowserWindow,
  settings: SettingsStore,
  overlay: () => { color: string; symbolColor: string },
  solidBackground: () => string,
): () => void {
  let last = settings.get();
  let mica = micaNow(last);

  const applyZoom = (zoom: number) => {
    if (win.isDestroyed()) return;
    win.webContents.setZoomFactor(zoom / 100);
    win.setTitleBarOverlay({ ...overlay(), height: overlayHeight(zoom) });
  };
  const applyMica = () => {
    if (win.isDestroyed()) return;
    mica = micaNow(settings.get());
    if (process.platform === 'win32') {
      win.setBackgroundMaterial(mica.on ? 'mica' : 'none');
      win.setBackgroundColor(mica.on ? '#00000000' : solidBackground());
    }
    markPage(win, mica);
  };

  // Zoom is per page: apply it again after every load (09 §9.14.3 persisted value).
  const onLoad = () => {
    applyZoom(settings.get().zoom);
    markPage(win, mica);
  };
  win.webContents.on('did-finish-load', onLoad);

  const offSettings = settings.onChange((s) => {
    if (s.appearance.theme !== last.appearance.theme) nativeTheme.themeSource = s.appearance.theme;
    if (s.zoom !== last.zoom) applyZoom(s.zoom);
    if (s.appearance.mica !== last.appearance.mica) applyMica();
    last = s;
  });
  // 02-3 §F28.1 / 09 §9.12 live switch: overlay colours and the window fill follow the theme; transparency effects and
  // high contrast can also flip Mica.
  const onTheme = () => {
    if (win.isDestroyed()) return;
    const now = micaNow(settings.get());
    if (now.on !== mica.on || now.row !== mica.row) applyMica();
    else if (!mica.on) win.setBackgroundColor(solidBackground());
    applyZoom(settings.get().zoom);
  };
  nativeTheme.on('updated', onTheme);

  return () => {
    offSettings();
    nativeTheme.off('updated', onTheme);
    if (!win.isDestroyed()) win.webContents.off('did-finish-load', onLoad);
  };
}
