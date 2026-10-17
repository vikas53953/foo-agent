// Spec: 09-windows §9.5 (single instance and activation), 08-1 §2.2 step 1.
import { app, type BrowserWindow } from 'electron';

/** Returns false when another instance owns the lock; the caller quits at once. */
export function claimSingleInstance(getWindow: () => BrowserWindow | null, onDeepLink: (url: string) => void): boolean {
  if (!app.requestSingleInstanceLock()) return false;
  app.on('second-instance', (_event, argv) => {
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus(); // user-initiated activation (second launch) only
    }
    const url = argv.find((a) => a.startsWith('foo://'));
    if (url) onDeepLink(url);
  });
  return true;
}
