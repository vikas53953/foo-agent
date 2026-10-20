// Spec: 10-acceptance-2 §D ART-26a (accessibility audit: axe-core on every M1 surface, light and dark; 01-articles Art. 26,
// 03-shell-2 §3.9), ART-29 (offline is one line with one fix button and nothing is lost; Art. 29, 03-shell-1 §3.3), §E PERF-03
// (chat switch, p95 < 100 ms over 20 switches; P1 T10 made it a gate). spec/trace.csv routes these three ids to this file (FID-18); the other M1 specs name behaviours, not ids.
// Runs on the demo and perf seeds (08-3 §22.9) in Electron.
// Legacy mode: axe's default run opens a blank page for frame results, which Electron does not support (Target.createTarget).
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
    // Row backgrounds fade on a theme switch; axe must read the settled colours, not a mid-fade frame.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
    let axe = new AxeBuilder({ page }).setLegacyMode(true);
    for (const s of scopes) axe = axe.include(s);
    const r = await axe.analyze();
    expect(r.violations.map((v) => `${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
  expect(await page.evaluate(handAudit, scopes)).toEqual([]);

  // The offline banner joins the audit (it is the first F6 stop when shown).
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(10_000));
  await expect(page.getByTestId(TID.bannerStrip)).toBeVisible();
  const banner = await new AxeBuilder({ page }).setLegacyMode(true).include(byTid(TID.bannerStrip)).analyze();
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

/** 10-2 §E PERF-03: click on a chat row → that chat's last messages painted, p95 < 100 ms. */
const SWITCH_P95_MS = 100;
const SWITCHES = 20;

test('PERF-03: chat switch on the perf seed paints the header and messages (p95 < 100 ms)', async () => {
  test.setTimeout(120_000);
  const { app, page, seededMs } = await start('perf');
  console.log(`perf seed to first row: ${seededMs} ms`);
  await setSize(app, page, 1440, 900);
  const rows = page.getByTestId(TID.chatlistRow);
  expect(await rows.count()).toBeGreaterThan(10);
  // The probe: the click event starts the clock (the row opens on click); it stops after the first frame that has the new chat's header
  // name and message rows in the DOM has run (its paint is queued by then).
  await page.evaluate(
    ({ header, log }) => {
      const w = window as unknown as { __switch: number[]; __want: string | null };
      w.__switch = [];
      w.__want = null;
      window.addEventListener(
        'click',
        (e) => {
          const want = w.__want;
          if (want === null) return;
          const t0 = e.timeStamp;
          const ready = () =>
            (document.querySelector(header)?.textContent ?? '').includes(want) && !!document.querySelector(`${log} [data-message-id]`);
          const onFrame = () => {
            if (!ready()) return requestAnimationFrame(onFrame);
            setTimeout(() => w.__switch.push(performance.now() - t0), 0);
          };
          requestAnimationFrame(onFrame);
        },
        true,
      );
    },
    { header: byTid(TID.chatHeaderName), log: byTid(TID.threadLog) },
  );
  for (let i = 0; i < SWITCHES; i++) {
    const row = rows.nth(1 + (i % 10));
    const name = (await row.getByTestId(TID.chatlistRowName).textContent()) ?? '';
    await page.evaluate((n) => ((window as unknown as { __want: string }).__want = n), name);
    await row.click();
    await page.waitForFunction((n) => (window as unknown as { __switch: number[] }).__switch.length >= n, i + 1);
    await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
  }
  const times = await page.evaluate(() => (window as unknown as { __switch: number[] }).__switch.slice().sort((a, b) => a - b));
  const q = (xs: number[], p: number) => xs[Math.ceil(xs.length * p) - 1]!;
  console.log(`chat switch → painted p95 ${q(times, 0.95).toFixed(1)} ms (p50 ${q(times, 0.5).toFixed(1)}) over ${times.length} switches`);
  expect(q(times, 0.95)).toBeLessThan(SWITCH_P95_MS);
  await app.close();
});
