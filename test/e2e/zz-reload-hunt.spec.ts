// TEMPORARY hunt (thread "Rare Windows test hangs"): AT-314's launch + reload with main-side tracing. Removed before merge.
import { expect, test } from '@playwright/test';
import { aiHome, firstRun } from './ai-step-world';
import type { FakeLine } from './fakeAi';
import { fullMotion } from './p1-first-run-world';

const VERIFY_SLOW: FakeLine = { match: { purpose: 'verify' }, reply: 'ready', once: false, delayMs: 2_000 };

test('reload hunt', async () => {
  const { app, page } = await firstRun(aiHome(['claude', 'codex']), [VERIFY_SLOW]);
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const g = globalThis as any;
    const t0 = Date.now();
    const log = (s: string) => g.__trace.push(`${Date.now() - t0} ${s}`);
    g.__trace = [] as string[];
    process.on('uncaughtException', (err) => log(`UNCAUGHT ${err?.stack ?? err}`));
    process.on('unhandledRejection', (err: any) => log(`UNHANDLED ${err?.stack ?? err}`));
    const orig = ipcMain.listeners('app:platform')[0] as (...a: any[]) => void;
    ipcMain.removeAllListeners('app:platform');
    ipcMain.on('app:platform', (e: any) => {
      let s = 'platform';
      try {
        const f = e.senderFrame;
        s += f ? ` frame detached=${f.detached} url=${f.url}` : ' frame=null';
      } catch (err) {
        s += ` senderFrame THREW ${err}`;
      }
      log(s);
      try {
        orig(e);
        log('platform handler returned');
      } catch (err) {
        log(`platform handler THREW ${err}`);
        throw err;
      }
    });
    const wc = BrowserWindow.getAllWindows()[0]!.webContents;
    for (const ev of [
      'did-start-loading',
      'did-start-navigation',
      'did-navigate',
      'dom-ready',
      'did-finish-load',
      'did-fail-load',
      'did-stop-loading',
      'preload-error',
      'render-process-gone',
      'unresponsive',
      'responsive',
      'did-frame-navigate',
    ])
      wc.on(ev as any, (_e: any, ...a: any[]) =>
        log(
          `wc ${ev} ${a
            .filter((x) => typeof x !== 'object')
            .join(' ')
            .slice(0, 160)}`,
        ),
      );
    wc.on('console-message', (d: any) => log(`console ${d.level} ${String(d.message).slice(0, 200)}`));
  });
  await fullMotion(page);
  await app.evaluate(() => (globalThis as any).__trace.push('--- reload'));
  await page.reload({ waitUntil: 'commit' });
  const dcl = await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  if (!dcl || process.env.HUNT_SHOW) {
    const probe = await Promise.race([
      app.evaluate(({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0]!.webContents;
        return Promise.race([
          wc.executeJavaScript('document.readyState + " " + location.href').then((r) => `js ${r}`),
          new Promise((r) =>
            setTimeout(
              () =>
                r(
                  `renderer JS did not answer in 3 s; isLoading=${wc.isLoading()} waiting=${wc.isWaitingForResponse()} crashed=${wc.isCrashed()}`,
                ),
              3_000,
            ),
          ),
        ]);
      }),
      new Promise((r) => setTimeout(() => r('MAIN did not answer in 6 s'), 6_000)),
    ]);
    const trace = await Promise.race([
      app.evaluate(() => (globalThis as any).__trace as string[]),
      new Promise<string[]>((r) => setTimeout(() => r(['MAIN did not answer']), 5_000)),
    ]);
    console.log(`::group::STALL probe=${probe}\n${trace.join('\n')}\n::endgroup::`);
  }
  expect(dcl, 'DOMContentLoaded after reload').toBe(true);
  // Electron answers an uncaught main-process error with a modal error box on Windows (main's JS stops until it is closed);
  // the listener above stops that box, so any error it caught is printed and fails the run.
  const errors = (await app.evaluate(() => (globalThis as any).__trace as string[])).filter((l) => /UNCAUGHT|UNHANDLED|THREW/.test(l));
  if (errors.length) console.log(`::group::MAIN ERRORS\n${errors.join('\n')}\n::endgroup::`);
  expect(errors).toEqual([]);
  await app.close();
});
