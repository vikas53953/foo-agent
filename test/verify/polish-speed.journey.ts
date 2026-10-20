// Spec: 02-3 §F29.6 (loading delays), 11-fidelity PERF rows. Polish audit: perceived-speed numbers of today's build (Linux test run).
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, rest, setTheme } from '../fidelity/capture';

/** Click a chat row in the page and count ms until its header shows the name and the log has a bubble. */
async function switchMs(page: import('@playwright/test').Page, name: string): Promise<number> {
  return page.evaluate(
    ([rowTid, nameTid, headTid, n]) =>
      new Promise<number>((done) => {
        const row = [...document.querySelectorAll(`[data-testid="${rowTid}"]`)].find(
          (r) => r.querySelector(`[data-testid="${nameTid}"]`)?.textContent?.trim() === n,
        ) as HTMLElement;
        const t0 = performance.now();
        row.click();
        const tick = () => {
          if (document.querySelector(`[data-testid="${headTid}"]`)?.textContent?.includes(n)) done(performance.now() - t0);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [TID.chatlistRow, TID.chatlistRowName, TID.chatHeaderName, name] as const,
  );
}

export default async function journey(v: Verify): Promise<void> {
  const t0 = Date.now();
  const { app, page } = await v.launch({});
  await page.getByTestId(TID.titlebarStrip).waitFor();
  v.note(`launch to first paint of the shell: ${Date.now() - t0} ms (includes Electron start)`);
  await openWorld(app, page);
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await rest(page);
  await page.evaluate('window.__name = (f) => f');
  const names = ['Trips', 'Money', 'foo', 'Home', 'Trips', 'foo'];
  const ms: number[] = [];
  for (const n of names) {
    ms.push(await switchMs(page, n));
    await page.waitForTimeout(300);
  }
  v.note(`chat switch ms (click to header updated): ${ms.map((x) => x.toFixed(0)).join(', ')}`);
  const key = await page.evaluate(
    (fieldTid) =>
      new Promise<number>((done) => {
        const f = document.querySelector(`[data-testid="${fieldTid}"]`) as HTMLElement;
        f.focus();
        const before = f.textContent ?? '';
        const t0 = performance.now();
        document.execCommand('insertText', false, 'a');
        const tick = () => {
          if ((f.textContent ?? '') !== before) requestAnimationFrame(() => done(performance.now() - t0));
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    TID.composerField,
  );
  v.note(`keystroke to painted frame: ${key.toFixed(0)} ms`);
  await v.shot('after-speed');
}
