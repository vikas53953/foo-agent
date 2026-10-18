// Spec: 09 §9.27.3 (banner window: `BrowserWindow({ frame: false, transparent: false, resizable: false, movable: false,
// skipTaskbar: true, focusable: true, alwaysOnTop: true, show: false })`, `setAlwaysOnTop(true, 'floating')`, takes focus
// when shown; Alt+D global while a banner is shown), 08-1 §1.2.1 (`windows/signin-banner.html` under app://foo/, same CSP),
// 08-0 §E.3. The Electron half of signinBanner.ts.
import { BrowserWindow, globalShortcut, nativeTheme } from 'electron';
import { tokens } from '../../shared/tokens';
import { preloadPath } from './mainWindow';
import { isTrustedUrl, startUrl } from './protocol';
import { BANNER_H, SigninBanners, type BannerDeps, type BannerWindow } from './signinBanner';

/** app://foo/windows/signin-banner.html (or the dev server's copy with FOO_DEV=1). */
export const bannerUrl = () => new URL('windows/signin-banner.html', startUrl()).toString();

function electronBannerWindow(): BannerWindow {
  const win = new BrowserWindow({
    width: 800,
    height: BANNER_H,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: tokens.colors['--bg-sidebar'][nativeTheme.shouldUseDarkColors ? 'dark' : 'light'],
    webPreferences: { preload: preloadPath(), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  const base = bannerUrl();
  return {
    setBounds: (r) => !win.isDestroyed() && win.setBounds(r),
    show: () => !win.isDestroyed() && win.show(),
    hide: () => !win.isDestroyed() && win.hide(),
    focus: () => !win.isDestroyed() && win.focus(),
    // A new hash on the same page is a same-document navigation: the page gets `hashchange`, nothing reloads.
    load: (hash) => !win.isDestroyed() && void win.loadURL(base + hash),
    close: () => !win.isDestroyed() && win.close(),
    onClosed: (cb) => win.on('closed', cb),
  };
}

export function electronBanners(d: Pick<BannerDeps, 'agentName' | 'onAction'>): SigninBanners {
  return new SigninBanners({
    ...d,
    create: electronBannerWindow,
    shortcut: {
      register: (accel, cb) => globalShortcut.register(accel, cb),
      unregister: (accel) => globalShortcut.unregister(accel),
    },
  });
}
