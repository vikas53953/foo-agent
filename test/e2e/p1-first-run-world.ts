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
  await page.reload({ waitUntil: 'commit' });
  return () =>
    app.evaluate(({ ipcMain }) => {
      const g = globalThis as { __fooBoot?: unknown; __fooRelease?: (() => void)[] };
      (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers.set('app:getBootstrap', g.__fooBoot);
      g.__fooRelease!.splice(0).forEach((go) => go());
    });
}

/** Full animations whatever the PC (a first run on ≤ 4 CPUs stores Basic, 02 §F7 X-150); applies from the next load. */
export const fullMotion = (page: Page) =>
  page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.animations', value: 'full' }));
