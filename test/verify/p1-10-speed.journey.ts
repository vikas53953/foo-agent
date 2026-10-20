// Spec: 10-acceptance-2 §C.8 AT-322 (the first script; a lazily loaded page shows its skeleton within 150ms), §E PERF-03
// (chat switch), 06 §0.5 Loading, CR-0021 (P1 T10). foo-verify journey for P1 T10: launch to the title bar, the scripts
// index.html loads and the page scripts the idle preload fetches, 20 chat switches on the perf seed timed click → messages
// painted, Settings from its preloaded script, and last Memory opened while its script is held back (the page frame turns
// into the §0.5 skeleton, then the page), and Settings with its script answering 404 (the §0.5 Error card). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-10-speed.journey.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, rest, settle, windowSize } from '../fidelity/capture';

declare global {
  interface Window {
    __switch: number[];
    __want: string | null;
    __skeleton: number | null;
  }
}

type Hook = { __log: string[]; __hold: boolean; __fail: boolean; __release: (() => void) | null };
const q = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1]!;

export default async function journey(v: Verify): Promise<void> {
  const t0 = Date.now();
  const { app, page } = await v.launch();
  // The app's own app:// handler, wrapped: every script request is logged, and once `__hold` is set the Memory script
  // waits until the journey releases it. The original handler is caught by registering it again (protocol.ts).
  await app.evaluate(
    ({ protocol }, modulePath) => {
      const g = globalThis as unknown as Hook;
      const start = Date.now();
      g.__log = [];
      g.__hold = false;
      g.__fail = false;
      g.__release = null;
      const { handleAppScheme } = process.mainModule!.require(modulePath) as { handleAppScheme: (dir: string) => void };
      let original: ((r: Request) => Promise<Response>) | null = null;
      const handle = protocol.handle.bind(protocol);
      protocol.handle = (_scheme, fn) => void (original = fn as (r: Request) => Promise<Response>);
      protocol.unhandle('app');
      handleAppScheme(process.env.FOO_DATA_DIR!);
      protocol.handle = handle;
      let gate: Promise<void> | null = null;
      protocol.handle('app', async (request) => {
        const name = new URL(request.url).pathname.split('/').pop()!;
        if (name.endsWith('.js')) g.__log.push(`${name} +${Date.now() - start}ms`);
        if (g.__fail && /^SettingsPage-.+\.js$/.test(name)) return new Response('Not found', { status: 404 });
        if (g.__hold && /^Memory-.+\.js$/.test(name)) {
          gate ??= new Promise<void>((resolve) => (g.__release = resolve));
          await gate;
        }
        return original!(request);
      });
    },
    join(__dirname, '..', '..', 'out', 'main', 'main', 'windows', 'protocol.js'),
  );
  await page.getByTestId(TID.titlebarStrip).waitFor();
  v.note(`launch → title bar ${Date.now() - t0} ms (wall clock, includes Electron start)`);
  const html = readFileSync(join(__dirname, '..', '..', 'out', 'renderer', 'index.html'), 'utf8');
  const first = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((m) => m[1]!);
  v.note(`index.html loads: ${first.join(', ')}`);
  if (first.some((n) => /^(Memory|SettingsPage)-/.test(n))) throw new Error('a page script is in the first script');

  // The window reloads so the wrapper sees a whole start (its first scripts come from the cache); the idle preload then
  // fetches the page scripts without any page being opened.
  const log = () => app.evaluate(() => (globalThis as unknown as Hook).__log);
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  for (let i = 0; i < 50 && !(await log()).some((n) => n.startsWith('SettingsPage-')); i++) await page.waitForTimeout(200);
  v.note(`after a reload, with no page opened, the idle preload requested: ${(await log()).join(', ')}`);
  if (!(await log()).some((n) => n.startsWith('Memory-'))) throw new Error('the idle preload did not fetch the page scripts');
  await page.evaluate(() => window.__fooTest!.seed('perf'));
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  await windowSize(app, page, 1440, 900);

  // PERF-03 probe (as in test/e2e/m1-shell.spec.ts): click → the first frame with the new header and message rows has run.
  // A string, not a function: tsx would name the probe's inner functions with a helper the window does not have.
  await page.evaluate(`(() => {
    const header = ${JSON.stringify(byTid(TID.chatHeaderName))};
    const log = ${JSON.stringify(byTid(TID.threadLog))};
    window.__switch = [];
    window.__want = null;
    window.addEventListener('click', (e) => {
      const want = window.__want;
      if (want === null) return;
      const start = e.timeStamp;
      const onFrame = () => {
        const ready = (document.querySelector(header)?.textContent ?? '').includes(want) && !!document.querySelector(log + ' [data-message-id]');
        if (!ready) return requestAnimationFrame(onFrame);
        setTimeout(() => window.__switch.push(performance.now() - start), 0);
      };
      requestAnimationFrame(onFrame);
    }, true);
  })()`);
  const rows = page.getByTestId(TID.chatlistRow);
  for (let i = 0; i < 20; i++) {
    const row = rows.nth(1 + (i % 10));
    const name = (await row.getByTestId(TID.chatlistRowName).textContent()) ?? '';
    await page.evaluate((n) => (window.__want = n), name);
    await row.click();
    await page.waitForFunction((n) => window.__switch.length >= n, i + 1);
  }
  const switches = await page.evaluate(() => window.__switch);
  v.note(
    `20 chat switches, click → messages painted: p50 ${q(switches, 0.5).toFixed(0)} ms, p95 ${q(switches, 0.95).toFixed(0)} ms, max ${Math.max(...switches).toFixed(0)} ms (PERF-03 budget p95 < 100 ms, judged on Windows)`,
  );
  await rest(page);
  await settle(page);
  await v.shot('chat-after-switches');

  // Settings: its own script, preloaded while the window was idle.
  const settingsAt = Date.now();
  await page.getByTestId(TID.sidebarFooterSettings).click();
  await page.getByTestId(TID.screenSettings).waitFor();
  v.note(`Settings opened ${Date.now() - settingsAt} ms after the click (wall clock)`);
  await rest(page);
  await settle(page);
  await v.shot('settings-page');

  // Last, Memory with its script held back: the window reloads so the module is fetched fresh, and the app:// wrapper
  // holds it until released: the empty page frame, the §0.5 skeleton from 150ms, then the page once the script arrives.
  await app.evaluate(() => ((globalThis as unknown as Hook).__hold = true));
  await page.reload();
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  await page.getByTestId(TID.sidebarMore).click();
  // In the window: the menu item's click starts the clock, the skeleton's arrival in the DOM stops it.
  await page.evaluate(`(() => {
    const sel = ${JSON.stringify(byTid(TID.screenLoading))};
    window.__skeleton = null;
    window.addEventListener('click', (e) => {
      const start = e.timeStamp;
      const mo = new MutationObserver(() => {
        if (!document.querySelector(sel)) return;
        window.__skeleton = performance.now() - start;
        mo.disconnect();
      });
      mo.observe(document.body, { subtree: true, childList: true });
    }, { capture: true, once: true });
  })()`);
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await page.getByTestId(TID.screenLoading).waitFor({ timeout: 2_000 });
  if ((await page.getByTestId(TID.screenMemory).count()) !== 0) throw new Error('Memory drew before its script loaded');
  if ((await page.locator('[data-page-loading] [data-testid]').count()) === 0)
    throw new Error('the skeleton is not the page-loading frame');
  const skeletonMs = await page.evaluate(() => window.__skeleton!);
  if (skeletonMs > 150 + 50) throw new Error(`skeleton after ${skeletonMs.toFixed(0)} ms`);
  await v.shot('memory-loading-skeleton');
  v.note(
    `Memory clicked with its script held: the §0.5 skeleton (screen-loading, no Memory page yet) arrived ${skeletonMs.toFixed(0)} ms after the click (delay-loading 150 ms + the next timer and frame)`,
  );
  const released = await app.evaluate(() => {
    const g = globalThis as unknown as Hook;
    g.__release?.();
    return !!g.__release;
  });
  if (!released) throw new Error('the Memory script was never requested');
  await page.getByTestId(TID.screenMemory).waitFor();
  if ((await page.locator('[data-page-loading]').count()) !== 0) throw new Error('the loading frame stayed after the page');
  v.note('released the script: the Memory page took the skeleton’s place');
  await rest(page);
  await settle(page);
  await v.shot('memory-page');

  // A page script that does not load (a chunk missing after an update): the §0.5 Error card in the page, not a blank window.
  await app.evaluate(() => ((globalThis as unknown as Hook).__fail = true));
  await page.reload();
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  await page.getByTestId(TID.sidebarFooterSettings).click();
  const error = page.getByTestId(TID.screenError);
  await error.waitFor();
  const words = await error.innerText();
  if (!words.includes(t('screen.load_error.text')) || !words.includes(t('screen.load_error.action', { agentName: 'foo' })))
    throw new Error(`load error block: ${words}`);
  if ((await page.getByTestId(TID.chatlistRow).count()) === 0) throw new Error('the window went blank');
  v.note(`Settings script answered 404: the page shows "${words.replace(/\n+/g, ' / ')}" and the chat list stays`);
  await rest(page);
  await settle(page);
  await v.shot('settings-load-error');
}
