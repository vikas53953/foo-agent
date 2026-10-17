// Spec: 11-fidelity §11.2.2 (references drawn in the Chromium that Electron ships), §11.2.6 (GPU off, scale 1).
// Minimal Electron main used only by scripts/golden-render.ts: one window, no network, a throwaway profile.
import { app, BrowserWindow, session } from 'electron';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
if (process.env.FOO_GOLDEN_USER_DATA) app.setPath('userData', process.env.FOO_GOLDEN_USER_DATA);

const allowed = (url) => /^(file|data|about|blob|devtools):/.test(url);

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowed(details.url) }));
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    enableLargerThanScreen: true,
    show: true,
    backgroundColor: '#FFFFFF',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  void win.loadURL('about:blank');
});

app.on('window-all-closed', () => app.quit());
