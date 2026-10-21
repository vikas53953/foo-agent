// Spec: 06-1 §1.2 (the splash is replaced by the shell when the chat list query returns). Test-only: main's
// `app:getBootstrap` answer is held until the test releases it, so the splash stays on screen long enough to look at.
// It wraps Electron's own invoke-handler table (no app hook exists for this; P1 T8).
import type { ElectronApplication, Page } from '@playwright/test';

/** Holds `app:getBootstrap`, reloads the renderer so the splash paints again, and returns the release. */
export async function holdBootstrap(app: ElectronApplication, page: Page): Promise<() => Promise<void>> {
  await app.evaluate(({ ipcMain }) => {
    type Handler = (...a: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
    const g = globalThis as { __fooBoot?: Handler; __fooRelease?: (() => void)[] };
    g.__fooBoot ??= handlers.get('app:getBootstrap')!;
    g.__fooRelease = [];
    handlers.set('app:getBootstrap', (...a: unknown[]) => new Promise((done) => g.__fooRelease!.push(() => done(g.__fooBoot!(...a)))));
  });
  // Only until the new document commits: the splash checks wait for what they need. Waiting for `load` while the bootstrap is
  // held timed out on a busy runner (AT-313 Off, page.reload 30 s; before that a bare test timeout).
  await tracedReload(app, page, 'commit');
  return () =>
    app.evaluate(({ ipcMain }) => {
      const g = globalThis as { __fooBoot?: unknown; __fooRelease?: (() => void)[] };
      (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers.set('app:getBootstrap', g.__fooBoot);
      g.__fooRelease!.splice(0).forEach((go) => go());
    });
}

/**
 * A reload that, when it stalls, says where. About 1 run in 30 on windows-latest a reload commits and then never reaches
 * DOMContentLoaded (AT-313 / AT-314); 375 traced runs on the runner did not repeat it. So each reload records main's side
 * (the preload's sync `app:platform` call, the window's load events), and a stall fails with that record and a probe of
 * main and the renderer, instead of a bare timeout. No retry: the bound is the reload's own 30 s.
 */
export async function tracedReload(
  app: ElectronApplication,
  page: Page,
  until: 'commit' | 'domcontentloaded' = 'domcontentloaded',
): Promise<void> {
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const g = globalThis as { __fooReload?: string[]; __fooReloadAt?: number; __fooReloadHooked?: boolean };
    g.__fooReload = [];
    g.__fooReloadAt = Date.now();
    const log = (s: string) => g.__fooReload?.push(`${Date.now() - g.__fooReloadAt!} ms ${s}`);
    if (g.__fooReloadHooked) return;
    g.__fooReloadHooked = true;
    type Listener = (e: Electron.IpcMainEvent) => void;
    const platform = ipcMain.listeners('app:platform')[0] as Listener;
    ipcMain.removeAllListeners('app:platform');
    ipcMain.on('app:platform', (e) => {
      log('app:platform asked');
      platform(e);
      log('app:platform answered');
    });
    const wc = BrowserWindow.getAllWindows()[0]!.webContents;
    for (const evt of [
      'did-start-navigation',
      'did-navigate',
      'dom-ready',
      'did-finish-load',
      'did-fail-load',
      'preload-error',
      'render-process-gone',
      'unresponsive',
    ] as const)
      wc.on(evt as 'dom-ready', () => log(evt));
  });
  await page.reload({ waitUntil: 'commit' });
  if (until === 'commit') return;
  const loaded = await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).then(
    () => true,
    () => false,
  );
  if (loaded) return;
  const answer = <T>(p: Promise<T>, ms: number, none: string) =>
    Promise.race([p, new Promise<string>((r) => setTimeout(() => r(none), ms))]);
  const renderer = await answer(
    app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0]!.webContents;
      return Promise.race([
        wc.executeJavaScript('document.readyState').then((r: string) => `renderer runs, readyState ${r}`),
        new Promise<string>((r) =>
          setTimeout(() => r(`renderer silent 3 s (loading ${wc.isLoading()}, crashed ${wc.isCrashed()})`), 3_000),
        ),
      ]);
    }),
    6_000,
    'main silent 6 s',
  );
  const trace = await answer(
    app.evaluate(() => ((globalThis as { __fooReload?: string[] }).__fooReload ?? []).join('; ')),
    3_000,
    'main silent',
  );
  throw new Error(`reload committed but no DOMContentLoaded in 30 s: ${renderer}; main saw: ${trace}`);
}

/** Full animations whatever the PC (a first run on ≤ 4 CPUs stores Basic, 02 §F7 X-150); applies from the next load. */
export const fullMotion = (page: Page) =>
  page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.animations', value: 'full' }));
