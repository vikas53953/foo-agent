// Spec: 10-acceptance-2 §D ART-26a (accessibility audit: axe-core on every M1 surface, light and dark; 01-articles Art. 26,
// 03-shell-2 §3.9), ART-29 (offline is one line with one fix button and nothing is lost; Art. 29, 03-shell-1 §3.3), §E PERF-03
// (chat switch). spec/trace.csv routes these three ids to this file (FID-18); the other M1 specs name behaviours, not ids.
// Runs on the demo and perf seeds (08-3 §22.9) in Electron.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { launch } from './launch';

const byTid = (id: string) => `[data-testid="${id}"]`;
const names = (page: Page) => page.locator(`${byTid(TID.chatlistRow)} ${byTid(TID.chatlistRowName)}`).allTextContents();

async function setSize(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await page.waitForFunction((w) => window.innerWidth === w, width);
}

async function start(seed: 'demo' | 'perf' = 'demo') {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const t0 = Date.now();
  await page.evaluate((s) => window.__fooTest!.seed(s), seed);
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  return { app, page, seededMs: Date.now() - t0 };
}

/** Hand checks axe does not make: every control named, meters valued, landmarks labelled, one h1, ids unique. */
function handAudit(scopes: string[]): string[] {
  const out: string[] = [];
  const name = (el: Element) =>
    (el.getAttribute('aria-label') ?? '') ||
    (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim() ||
    (el.textContent ?? '').trim();
  for (const scope of scopes) {
    for (const el of Array.from(
      document.querySelectorAll(`${scope} button, ${scope} [role="button"], ${scope} input, ${scope} [role="radio"]`),
    )) {
      const own = el.tagName === 'INPUT' ? el.getAttribute('aria-label') || el.getAttribute('placeholder') : name(el);
      if (!own) out.push(`unnamed ${el.tagName.toLowerCase()} ${el.getAttribute('data-testid') ?? ''}`);
    }
    for (const el of Array.from(document.querySelectorAll(`${scope} [role="meter"]`))) {
      if (!el.getAttribute('aria-valuenow') || !el.getAttribute('aria-valuemax') || !name(el))
        out.push(`meter ${el.getAttribute('data-testid')}`);
    }
  }
  const labelled = (el: Element) => !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
  for (const el of Array.from(document.querySelectorAll('main, aside, nav, [role="log"]')).filter((e) => !labelled(e)))
    out.push(`unnamed landmark ${el.tagName.toLowerCase()}`);
  const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
  for (const id of Array.from(new Set(ids.filter((id, i) => ids.indexOf(id) !== i)))) out.push(`duplicate id ${id}`);
  if (document.querySelectorAll('h1').length !== 1) out.push(`h1 count ${document.querySelectorAll('h1').length}`);
  return out;
}

test('ART-26a: every M1 surface passes axe in light and dark (list, banner, chat header, find bar, messages, right shell)', async () => {
  const { app, page } = await start();
  await setSize(app, page, 1440, 900);
  await page.locator(byTid(TID.chatlistRow)).first().click();
  await expect(page.getByTestId(TID.appPanel)).toBeVisible();
  await page.keyboard.press('Control+F');
  await expect(page.getByTestId(TID.threadFind)).toBeVisible();
  const scopes = [byTid(TID.sidebar), byTid(TID.thread), byTid(TID.appPanel)];
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => window.__fooTest!.theme(t), theme);
    // As m0-window.spec.ts: Linux CI has no desktop theme bridge, so the media query is emulated there.
    if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    let axe = new AxeBuilder({ page });
    for (const s of scopes) axe = axe.include(s);
    const r = await axe.analyze();
    expect(r.violations.map((v) => `${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
  expect(await page.evaluate(handAudit, scopes)).toEqual([]);

  // The offline banner joins the audit (it is the first F6 stop when shown).
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(10_000));
  await expect(page.getByTestId(TID.bannerStrip)).toBeVisible();
  const banner = await new AxeBuilder({ page }).include(byTid(TID.bannerStrip)).analyze();
  expect(banner.violations.map((v) => v.id)).toEqual([]);
  await app.close();
});

test('ART-29: offline is one line with one fix button and nothing is lost', async () => {
  const { app, page } = await start();
  const before = await names(page);
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await expect(page.getByTestId(TID.bannerStrip)).toHaveCount(0); // a short blip shows nothing
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await expect(page.getByTestId(TID.bannerStrip)).toHaveCount(1);
  await expect(page.getByTestId(TID.bannerStrip).locator('button')).toHaveCount(1);
  expect(await names(page)).toEqual(before);
  await page.getByTestId(TID.bannerAction).click();
  await page.evaluate(() => window.__fooTest!.setOnline(true));
  await expect(page.getByTestId(TID.bannerStrip)).toHaveCount(0);
  expect(await names(page)).toEqual(before);
  await app.close();
});

test('PERF-03: chat switch on the perf seed paints the header and messages (smoke timing)', async () => {
  const { app, page, seededMs } = await start('perf');
  console.log(`perf seed to first row: ${seededMs} ms`);
  const rows = page.getByTestId(TID.chatlistRow);
  expect(await rows.count()).toBeGreaterThan(10);
  const times: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = (await rows.nth(i).getByTestId(TID.chatlistRowName).textContent()) ?? '';
    const t0 = Date.now();
    await rows.nth(i).click();
    await expect(rows.nth(i)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
    await expect(page.getByTestId(TID.threadLog)).toBeVisible();
    times.push(Date.now() - t0);
  }
  console.log(`chat switch ms: ${times.join(', ')}`);
  expect(Math.max(...times)).toBeLessThan(2_000); // smoke only; budgets are measured on the reference laptop (10-2 §E)
  await app.close();
});
