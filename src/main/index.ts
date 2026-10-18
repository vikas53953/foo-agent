// Spec: 08-1 §2.2 steps 1–5 (startup order); 09-windows §9.2 (identity), §9.5 (single instance); 02-3 §F28.1;
// 08-3 §22.1–§22.2 (test runs: fake clock and test channels, loaded only when the build has them); 03-shell-1 §3.3.2
// type 1 (network state for the offline banner).
import { app, BrowserWindow, nativeTheme } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths } from './data/paths';
import { deps, installTestDeps } from './deps';
import { testHooksEnabled } from './ipc/guard';
import { electronProbe, emit, listContext, registerIpc, type AppContext } from './ipc/IpcRouter';
import { EngineBridge } from './engine-supervisor/EngineBridge';
import { EngineSupervisor } from './engine-supervisor/EngineSupervisor';
import { engineHello } from './engine-supervisor/hello';
import { chatRowById, messageGet } from './store/queries';
import { NetMonitor } from './net/netMonitor';
import type { FakeClock } from '../shared/clock';
import { SettingsStore } from './settings/Settings';
import { openDb, type Db } from './store/db';
import { ensureFooChat } from './store/queries';
import { newId } from '../shared/ids';
import { createMainWindow } from './windows/mainWindow';
import { handleAppScheme, registerAppScheme } from './windows/protocol';
import { claimSingleInstance } from './windows/singleInstance';

export const AUMID = 'com.foo.desktop';

app.setAppUserModelId(AUMID); // §9.2: first line after app exists, before any window or notification

let mainWindow: BrowserWindow | null = null;
let db: Db | null = null;
let supervisor: EngineSupervisor | null = null;

const hidden = process.argv.includes('--hidden');

/** FOO_TEST runs: fake clock at X-10 and the test:* channels. A packaged build has no test folder and runs without them. */
async function loadTestHooks(ctx: AppContext, clock: FakeClock): Promise<void> {
  if (!existsSync(join(__dirname, 'test', 'testHooks.js'))) {
    console.warn('FOO_TEST=1 but this build has no test hooks');
    return;
  }
  const hooks = await import('./test/testHooks');
  hooks.registerTestHooks(ctx, clock);
}

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

  app.whenReady().then(async () => {
    const testClock = testHooksEnabled() ? installTestDeps() : null;
    // Step 3: SQLite.
    db = openDb(paths.db);
    ensureFooChat(db, deps.clock.now(), settings.get().identity.agentName, newId('c', deps.clock.now()));
    // Network state on the injected clock: the injected Net in test runs, Electron's probe otherwise.
    const netMonitor = new NetMonitor(deps.clock);
    const probe = testClock ? () => deps.net.online : electronProbe;
    const store = db;
    // 08-1 §2.4: main's half of the engine port; the engine forks after first paint (step 6).
    const engine = new EngineBridge({
      db: store,
      settings,
      emit,
      emitMessage: (id) => {
        const row = messageGet(store, id);
        if (row) emit('message:upsert', row);
      },
      emitChat: (id) => {
        const row = chatRowById(store, listContext(settings.get()), id);
        if (row) emit('chat:upsert', row);
      },
    });
    const ctx: AppContext = { db, settings, net: netMonitor, probe, dataDir: paths.data, engine };
    supervisor = new EngineSupervisor(engine, { data: paths.data, local: paths.local });
    supervisor.onStarted = () =>
      engineHello(engine.send.bind(engine), {
        settings: () => settings.get(),
        online: () => !netMonitor.offline,
        testClock,
      });
    settings.onChange((s) => engine.send('settings.changed', { paths: [], settings: s }));
    if (testClock) await loadTestHooks(ctx, testClock);
    else netMonitor.poll(probe);
    // Step 4: theme before any window, then the window.
    nativeTheme.themeSource = settings.get().appearance.theme;
    handleAppScheme(paths.data);
    registerIpc(ctx);
    mainWindow = createMainWindow(settings, { hidden });
    if (process.platform === 'win32') {
      mainWindow.setAppDetails({
        appId: AUMID,
        appIconPath: process.execPath,
        relaunchCommand: `"${process.execPath}"`,
        relaunchDisplayName: 'foo',
      });
    }
    // Step 6: +300 ms after first paint, fork the engine.
    mainWindow.once('ready-to-show', () => setTimeout(() => supervisor?.start(), 300));
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  // Close to tray needs the tray (M11); until then closing the window quits.
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    supervisor?.stop();
    db?.close();
  });
}
