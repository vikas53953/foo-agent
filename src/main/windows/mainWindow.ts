// Spec: 03-shell-1 §3.1 (size, restore), §3.2 (title bar); 09-windows §9.6, §9.12, §9.14.3 (zoom), §9.15; 02-3 §F28.1,
// §F28.4 as amended by X-179 (optional Mica, CR-0021 pick 21).
import { app, BrowserWindow, nativeTheme, screen, systemPreferences, type Rectangle } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tokens } from '../../shared/tokens';
import { t } from '../../shared/copy/t';
import { testHooksEnabled } from '../ipc/guard';
import { applyAccentEverywhere } from '../theme/applyAccent';
import { applyAppearance, initialMica, overlayHeight } from '../settings/appearance';
import type { SettingsStore } from '../settings/Settings';
import { isTrustedUrl, startUrl } from './protocol';

const DEFAULT = { width: 1280, height: 800 };
const MIN = { width: 360, height: 500 };
const SAVE_DEBOUNCE_MS = 500;

type Theme = 'light' | 'dark';
const currentTheme = (): Theme => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
const sidebarBg = (th: Theme) => tokens.colors['--bg-sidebar'][th];

/** §3.2.1: overlay colours follow the theme; high contrast uses system ButtonFace / ButtonText. */
export function overlayColours(): { color: string; symbolColor: string } {
  if (nativeTheme.shouldUseHighContrastColors && process.platform === 'win32') {
    return { color: systemPreferences.getColor('3d-face'), symbolColor: systemPreferences.getColor('button-text') };
  }
  const th = currentTheme();
  return { color: sidebarBg(th), symbolColor: tokens.colors['--fg-1'][th] };
}

function visibleShare(r: Rectangle, area: Rectangle): number {
  const w = Math.max(0, Math.min(r.x + r.width, area.x + area.width) - Math.max(r.x, area.x));
  const h = Math.max(0, Math.min(r.y + r.height, area.y + area.height) - Math.max(r.y, area.y));
  return (w * h) / (r.width * r.height);
}

/** §3.1.1 default: 1280×800 centred on the primary work area, or 90 % of it when the area is smaller than 1280×800 + 5 %. */
export function defaultBounds(area: Rectangle): Rectangle {
  const fits = area.width >= DEFAULT.width * 1.05 && area.height >= DEFAULT.height * 1.05;
  const width = fits ? DEFAULT.width : Math.round(area.width * 0.9);
  const height = fits ? DEFAULT.height : Math.round(area.height * 0.9);
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

/** §3.1.2 rule 1: a saved rect less than 50 % inside every display's work area is ignored. */
export function restoredBounds(saved: Rectangle | undefined, areas: Rectangle[], primary: Rectangle): Rectangle {
  if (saved && areas.some((a) => visibleShare(saved, a) >= 0.5)) return saved;
  return defaultBounds(primary);
}

/** 08-3 §22.1: test runs load the test preload when this build has it (it is left out of the packaged app). */
export function preloadPath(): string {
  const dir = join(__dirname, '..', '..', 'preload');
  const test = join(dir, 'preloadTest.js');
  return testHooksEnabled() && existsSync(test) ? test : join(dir, 'preload.js');
}

export function createMainWindow(settings: SettingsStore, opts: { hidden: boolean }): BrowserWindow {
  const s = settings.get();
  const bounds = restoredBounds(
    s.window.bounds,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  );
  const mica = initialMica(s);
  const win = new BrowserWindow({
    ...bounds,
    minWidth: MIN.width,
    minHeight: MIN.height,
    show: false,
    title: t('app.window.title'),
    backgroundColor: mica.on ? '#00000000' : sidebarBg(currentTheme()),
    backgroundMaterial: mica.on ? 'mica' : 'none',
    icon: join(app.getAppPath(), 'resources', 'icons', 'foo.ico'),
    thickFrame: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...overlayColours(), height: overlayHeight(s.zoom) },
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      zoomFactor: s.zoom / 100,
    },
  });

  // §3.2.2: document.title is always "foo".
  win.on('page-title-updated', (e) => e.preventDefault());

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });

  win.once('ready-to-show', () => {
    if (settings.get().window.maximized) win.maximize();
    if (!opts.hidden) win.show();
  });

  // §3.1.2: save the window state, debounced 500 ms.
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    if (win.isDestroyed()) return;
    const normal = win.getNormalBounds();
    settings.update((cur) => ({
      ...cur,
      window: {
        ...cur.window,
        bounds: normal,
        maximized: win.isMaximized(),
        displayId: String(screen.getDisplayMatching(normal).id),
      },
    }));
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize'] as const) win.on(ev as 'resize', schedule);
  win.on('close', () => {
    clearTimeout(timer);
    save();
  });

  // §9.12 live switch (overlay and background follow the theme), zoom, Mica and theme source: settings/appearance.ts.
  const offAppearance = applyAppearance(win, settings, overlayColours, () => sidebarBg(currentTheme()));
  applyAccentEverywhere(settings);

  // §3.1.2 rule 1: when a display goes away, a window left less than 50 % on screen returns to the default place.
  const onDisplayRemoved = () => {
    if (win.isDestroyed() || win.isMaximized()) return;
    const areas = screen.getAllDisplays().map((d) => d.workArea);
    const next = restoredBounds(win.getNormalBounds(), areas, screen.getPrimaryDisplay().workArea);
    if (next !== undefined) win.setBounds(next);
  };
  screen.on('display-removed', onDisplayRemoved);
  win.on('closed', () => {
    offAppearance();
    screen.off('display-removed', onDisplayRemoved);
  });

  void win.loadURL(startUrl());
  return win;
}
