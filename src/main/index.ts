// Spec: 08-1 §2.2 steps 1–5 (startup order); 09-windows §9.2 (identity), §9.5 (single instance); 02-3 §F28.1.
import { app, BrowserWindow, nativeTheme } from 'electron';
import { resolvePaths } from './data/paths';
import { registerIpc } from './ipc/IpcRouter';
import { SettingsStore } from './settings/Settings';
import { openDb, type Db } from './store/db';
import { createMainWindow } from './windows/mainWindow';
import { handleAppScheme, registerAppScheme } from './windows/protocol';
import { claimSingleInstance } from './windows/singleInstance';

export const AUMID = 'com.foo.desktop';

app.setAppUserModelId(AUMID); // §9.2: first line after app exists, before any window or notification

let mainWindow: BrowserWindow | null = null;
let db: Db | null = null;

const hidden = process.argv.includes('--hidden');

function onDeepLink(url: string): void {
  // The 08-0 §G.9 route table arrives with M11; until then every URL is logged and ignored.
  console.warn('URL_NOT_ALLOWED', url);
}

// Step 1: single instance.
if (!claimSingleInstance(() => mainWindow, onDeepLink)) {
  app.quit();
} else {
  registerAppScheme();
  if (!app.isDefaultProtocolClient('foo')) app.setAsDefaultProtocolClient('foo');

  // Step 2: settings (sync).
  const paths = resolvePaths();
  const settings = new SettingsStore(paths.settings);
  if (!settings.get().app.hardwareAcceleration) app.disableHardwareAcceleration();

  app.whenReady().then(() => {
    // Step 3: SQLite.
    db = openDb(paths.db);
    // Step 4: theme before any window, then the window.
    nativeTheme.themeSource = settings.get().appearance.theme;
    handleAppScheme();
    registerIpc(settings);
    mainWindow = createMainWindow(settings, { hidden });
    if (process.platform === 'win32') {
      mainWindow.setAppDetails({
        appId: AUMID,
        appIconPath: process.execPath,
        relaunchCommand: `"${process.execPath}"`,
        relaunchDisplayName: 'foo',
      });
    }
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  // Close to tray needs the tray (M11); until then closing the window quits.
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => db?.close());
}
