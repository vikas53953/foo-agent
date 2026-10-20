// Spec: 08-1 §2.2 steps 1–5 (startup order); 09-windows §9.2 (identity), §9.5 (single instance); 02-3 §F28.1;
// 08-3 §22.1–§22.2 (test runs: fake clock and test channels, loaded only when the build has them); 03-shell-1 §3.3.2
// type 1 (network state for the offline banner). M4 T4: §2.2 step 1 launches.json + safe mode (G-M4-13), step 3 damaged
// database rebuild (§4.1.1), §2.3 quit / shutdown (`jobs.pauseAll`, `clean: true`; G-M4-04), 09 §9.22 power.
import { app, BrowserWindow, nativeTheme, powerMonitor, powerSaveBlocker, safeStorage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths } from './data/paths';
import { deps, installTestDeps } from './deps';
import { testHooksEnabled } from './ipc/guard';
import { electronProbe, emit, listContext, registerIpc, type AppContext } from './ipc/IpcRouter';
import { EngineBridge } from './engine-supervisor/EngineBridge';
import { EngineSupervisor } from './engine-supervisor/EngineSupervisor';
import { engineHello } from './engine-supervisor/hello';
import { chatRowById, messageGet, publicSettings } from './store/queries';
import { NetMonitor } from './net/netMonitor';
import type { FakeClock } from '../shared/clock';
import { SettingsStore } from './settings/Settings';
import type { Db } from './store/db';
import { LaunchLog } from './store/launches';
import { openDbOrRebuild } from './store/rebuild';
import { PowerService } from './power/PowerService';
import { ensureFooChat } from './store/queries';
import { newId } from '../shared/ids';
import { logEvent, setAppTechLog, TechLog } from './log/techLog';
import { createMainWindow } from './windows/mainWindow';
import { handleAppScheme, registerAppScheme } from './windows/protocol';
import { claimSingleInstance } from './windows/singleInstance';
// M8
import { memoryWaSession } from './vault/waSessionMemory';
import { registerWhatsAppIpc } from './whatsapp/waIpc';
import { BRIDGE_START_DELAY_MS, WhatsAppMain } from './whatsapp/waMain';
// M5 T2
import { normalisedForms } from '../shared/redactor';
import { mainRegistry, registerSecretValue, setRegisterValue } from './secrets/registerValue';
import { memoryKeyring, memorySafeStore, napiKeyring } from './vault/keyring';
import { registryMirror } from './vault/registryMirror';
import { findOpenApproval } from './approvals/ApprovalGate'; // M5 T4 (review fix 4)
import { approvalGate } from './approvals/approvalIpc'; // M5 T7
import { draftService } from './drafts/draftIpc'; // M8 T6
import { SecretVault } from './vault/SecretVault';
import { installVault } from './vault/vaultRuntime';
import { google } from './connections/connectionIpc'; // M8 T5

export const AUMID = 'com.foo.desktop';

app.setAppUserModelId(AUMID); // §9.2: first line after app exists, before any window or notification

let mainWindow: BrowserWindow | null = null;
let db: Db | null = null;
let supervisor: EngineSupervisor | null = null;
let power: PowerService | null = null;
let launches: LaunchLog | null = null;
/** Set once the quit work is done (or Windows is ending the session, which is never delayed, 09 §9.22). */
let quitReady = false;
let sessionEnding = false;

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
  // The 08-0 §G.9 route table arrives with M11; until then every URL is ignored. The URL itself is never logged (R7).
  void url;
  logEvent({ lvl: 'warn', mod: 'main', evt: 'URL_NOT_ALLOWED' });
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
    // 08-3 §19.1 / R7: the tech log, on the injected clock; debug lines only in test runs.
    setAppTechLog(new TechLog({ dir: join(paths.data, 'logs'), clock: deps.clock, debug: !!testClock }));
    logEvent({ lvl: 'info', mod: 'main', evt: 'APP_STARTED' });
    // Step 1 (second half): the launch record and the safe-mode decision, on the injected clock.
    launches = LaunchLog.start(join(paths.data, 'launches.json'), deps.clock.now(), app.getVersion());
    // Step 3: SQLite; a damaged file is set aside and rebuilt from the mirrors (§4.1.1).
    db = openDbOrRebuild(paths.db, {
      dataDir: paths.data,
      now: deps.clock.now(),
      agentName: settings.get().identity.agentName,
      log: (evt, detail) => logEvent({ lvl: evt === 'DB_REBUILT' ? 'warn' : 'error', mod: 'store', evt, kind: detail }),
    }).db;
    ensureFooChat(db, deps.clock.now(), settings.get().identity.agentName, newId('c', deps.clock.now()));
    // Network state on the injected clock: the injected Net in test runs, Electron's probe otherwise.
    const netMonitor = new NetMonitor(deps.clock);
    const probe = testClock ? () => deps.net.online : electronProbe;
    const store = db;
    // M8 (T3): WhatsApp's main half; the engine's wa.report and vault requests reach it through the bridge context.
    let whatsapp: WhatsAppMain | null = null;
    // 08-1 §2.4: main's half of the engine port; the engine forks after first paint (step 6).
    const engine = new EngineBridge({
      whatsapp: {
        report: (r) => whatsapp?.report(r),
        vault: (req) => (whatsapp ? whatsapp.vault(req) : { ok: false, error: { kind: 'UNKNOWN' } }),
      },
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
      dataDir: paths.data,
      now: () => deps.clock.now(),
      keepAwake: (on, jobCount) => power?.keepAwake(on, jobCount),
      // M5 T7 (08-1 §2.4): engine `approval.open` / `approval.transition` go to main's one ApprovalGate.
      approvals: () => approvalGate(ctx),
      // M8 T5: the engine's Google calls (connection.google) go to main's one GoogleConnections.
      google: () => google(),
      // M8 T6: engine `gmail.draft` → main's DraftService (08-0 §G.7).
      drafts: () => draftService(ctx),
    });
    const launchLog = launches;
    power = new PowerService({
      blocker: powerSaveBlocker,
      send: (kind, payload) => engine.send(kind, payload as never),
      pauseAll: async (reason) => {
        // No engine wanted (a test run without the fake AI): nothing can be running.
        if (!EngineSupervisor.wanted()) return;
        const r = await engine.request('jobs.pauseAll', { reason });
        if (!r.ok) throw new Error(r.error.kind);
      },
      markClean: () => launchLog.markClean(),
    });
    power.attach(powerMonitor);
    // M5 T2 (08-2 §11.2–§11.4): main's registry of record mirrored to the engine, and the vault. FOO_TEST runs use the
    // in-memory keyring and safeStorage (08-3 §22.2); Credential Manager is Windows only.
    const mirror = registryMirror({
      registry: mainRegistry(),
      engine,
      normalisedForms,
      clock: deps.clock,
    });
    setRegisterValue((value, opts) => mirror.register(value, opts));
    installVault({
      vault: new SecretVault({
        db: store,
        keyring: testClock ? memoryKeyring() : process.platform === 'win32' ? napiKeyring() : null,
        safe: testClock ? memorySafeStore() : safeStorage,
        blobDir: join(paths.data, 'vault'),
        clock: deps.clock,
        register: registerSecretValue,
        findOpenApproval: (j, v) => findOpenApproval(store, j, v),
      }),
      register: registerSecretValue,
      now: () => deps.clock.now(),
      emitCard: (row) => emit('card:upsert', row),
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
    const sup = supervisor;
    ctx.bridgeTest = (msg) => sup.bridgeLife.post(msg);
    whatsapp = new WhatsAppMain({
      db: store,
      settings,
      engine,
      bridge: sup,
      session: memoryWaSession(),
      emit,
      emitChat: (id) => {
        const row = chatRowById(store, listContext(settings.get()), id);
        if (row) emit('chat:upsert', row);
      },
      emitSettings: () => emit('settings:changed', publicSettings(settings.get())),
      chatRow: (id) => chatRowById(store, listContext(settings.get()), id),
      now: () => deps.clock.now(),
      dataDir: paths.data,
    });
    const waDue = whatsapp.startup();
    sup.onBridgeGaveUp = () => whatsapp?.report({ event: 'status', status: 'error', errorKind: null });
    supervisor.onStarted = () => {
      // M5 T7 (08-2 §5.9 step 2): an engine that crashed mid-submit left RUNNING behind; main moves it to CHECKING first.
      approvalGate(ctx).recoverSubmitted();
      engineHello(engine.send.bind(engine), {
        settings: () => settings.get(),
        online: () => !netMonitor.offline,
        testClock,
        launch: () => launchLog.nextEngineStart(),
      });
      // M5 T2: a new engine starts with an empty registry; main's live values go to it again.
      mirror.replay();
    };
    supervisor.onCrashed = () => launchLog.engineCrashed();
    settings.onChange((s) => engine.send('settings.changed', { paths: [], settings: s }));
    if (testClock) await loadTestHooks(ctx, testClock);
    else netMonitor.poll(probe);
    // Step 4: theme before any window, then the window.
    nativeTheme.themeSource = settings.get().appearance.theme;
    handleAppScheme(paths.data);
    registerIpc(ctx);
    registerWhatsAppIpc(whatsapp);
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
    // 08-1 §2.2 step 7 (M8 T3): the wa-bridge at +20 s when a whatsapp row exists.
    if (waDue) setTimeout(() => supervisor?.startBridge(), BRIDGE_START_DELAY_MS);
    mainWindow.on('query-session-end', () => {
      sessionEnding = true;
      power?.sessionEnding();
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  // Close to tray needs the tray (M11); until then closing the window quits.
  app.on('window-all-closed', () => app.quit());
  // §2.3 step 4: pause the running jobs (engine ack, bounded), mark the launch clean, then quit for real.
  app.on('before-quit', (e) => {
    if (quitReady || sessionEnding || !power) return;
    e.preventDefault();
    void power.beforeQuit().finally(() => {
      quitReady = true;
      app.quit();
    });
  });
  app.on('will-quit', () => {
    // §2.3 step 5: on Windows sign-out / shutdown the record is clean only if Windows lets foo get this far.
    if (sessionEnding) launches?.markClean();
    supervisor?.stop();
    db?.close();
  });
}
