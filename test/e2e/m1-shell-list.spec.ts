// M1 left shell and chat list (03-shell-1 §3.3, §3.4; 03-shell-2 §3.9.3) on the demo seed (08-3 §22.9).
// Acceptance 3.11.1, 3.11.3, 3.11.4, 3.11.5, 3.11.7; Article 29 (offline: one line, one fix button); Article 26a (axe on
// the shell, light and dark); PERF-01 (cold start to a usable list) and PERF-03 (chat switch) smoke timings on the perf
// seed; FID-14 rows SV-13, 14, 15, 17, 23, 24, 25. The trace ids for Article 26a, Article 29 and PERF-03 are routed to
// test/e2e/m1-shell.spec.ts in spec/trace.csv, so the titles here name the behaviour, not the id (FID-18).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { checkSpecValues, readRows, type SvRow } from '../fidelity/spec-values';
import { launch } from './launch';

const row = (page: Page, name: string) =>
  page.locator('[data-testid="chatlist-row"]', { has: page.locator(`[data-testid="chatlist-row-name"]:text-is("${name}")`) });
const names = (page: Page) => page.locator('[data-testid="chatlist-row"] [data-testid="chatlist-row-name"]').allTextContents();

async function setSize(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await page.waitForFunction((w) => window.innerWidth === w, width);
}

async function start(seed: 'demo' | 'perf' = 'demo') {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();
  const t0 = Date.now();
  const reply = await page.evaluate((s) => window.__fooTest!.seed(s), seed);
  await expect(page.getByTestId('chatlist-row').first()).toBeVisible();
  return { app, page, refs: reply.refs ?? {}, seededMs: Date.now() - t0 };
}

test('3.11.1: at 1440 wide the columns are 340 / main / 340 and the list shows the demo chats', async () => {
  const { app, page } = await start();
  await setSize(app, page, 1440, 900);
  expect((await page.getByTestId('sidebar').boundingBox())?.width).toBe(340);
  await expect(page.locator('[data-bp]')).toHaveAttribute('data-bp', 'L');
  expect(await names(page)).toEqual(
    expect.arrayContaining(['foo', 'Trips', 'Money', 'Home', 'Family group', 'Building society', 'School friends']),
  );
  // folded helper (X-153), WhatsApp mirror mark, muted badge, group sender preview
  await expect(page.locator('[data-testid="chatlist-row"][data-folded="true"]')).toHaveCount(1);
  await expect(row(page, 'Building society').getByTestId('chatlist-row-source')).toHaveAttribute('data-state', 'whatsapp');
  await expect(row(page, 'Building society').getByTestId('chatlist-row-unread')).toHaveAttribute('data-state', 'muted');
  await expect(row(page, 'Family group').getByTestId('chatlist-row-preview')).toHaveText('foo: Mom’s cake is ordered 🎂');
  await expect(row(page, 'Trips').getByTestId('chatlist-row-pill')).toHaveAttribute('data-state', 'working');
  await app.close();
});

test('3.11.3: at 600 wide only one of list or chat shows', async () => {
  const { app, page } = await start();
  await setSize(app, page, 600, 800);
  await expect(page.locator('[data-bp]')).toHaveAttribute('data-bp', 'XS');
  const listShown = await page.getByTestId('sidebar').isVisible();
  const mainShown = await page
    .locator('main')
    .first()
    .isVisible()
    .catch(() => false);
  expect(listShown && mainShown).toBe(false);
  await app.close();
});

test('3.11.4: a chat that needs you is listed above foo and the pinned chat', async () => {
  const { app, page, refs } = await start();
  await row(page, 'Trips').click({ button: 'right' });
  await page.getByTestId('chatlist-menu-pin').click();
  await expect(row(page, 'Trips').getByTestId('chatlist-row-pin')).toBeVisible();
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'needs_you'), refs.moneyJob!);
  await expect(row(page, 'Money').getByTestId('chatlist-row-pill')).toHaveAttribute('data-state', 'needs_you');
  const order = await names(page);
  expect(order.indexOf('Money')).toBeLessThan(order.indexOf('Trips'));
  expect(order.indexOf('foo')).toBeLessThan(order.indexOf('Trips'));
  await app.close();
});

test('3.11.5: a job entering NEEDS YOU updates the pill and the chip count within 1 s', async () => {
  const { app, page, refs } = await start();
  const chip = page.getByTestId('chatlist-filter-needs-you');
  const before = Number((await chip.textContent())?.replace(/\D/g, '') || '0');
  const t0 = Date.now();
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'needs_you'), refs.tripsJob!);
  await expect(row(page, 'Trips').getByTestId('chatlist-row-pill')).toHaveText('Needs you', { timeout: 1000 });
  await expect(chip).toContainText(String(before + 1), { timeout: 1000 });
  expect(Date.now() - t0).toBeLessThan(1500);
  await chip.click();
  await expect(page.getByTestId('chatlist-row')).toHaveCount(before + 1);
  await app.close();
});

test('3.11.7: offline for 10 s shows exactly one offline line with one button', async () => {
  const { app, page } = await start();
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(10_000));
  const banner = page.getByTestId('banner-strip');
  await expect(banner).toHaveAttribute('data-state', 'offline');
  await expect(page.getByTestId('banner-strip')).toHaveCount(1);
  await expect(banner.locator('button')).toHaveCount(1);
  await expect(page.getByTestId('banner-action')).toHaveText('Try again');
  await expect(page.getByTestId('sidebar-footer-status')).toContainText('Offline');
  await page.evaluate(() => window.__fooTest!.setOnline(true));
  await expect(page.getByTestId('banner-strip')).toHaveCount(0);
  await app.close();
});

test('offline is one line with one fix button and nothing is lost (Article 29 behaviour)', async () => {
  const { app, page } = await start();
  const before = await names(page);
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await expect(page.getByTestId('banner-strip')).toHaveCount(0); // a short blip shows nothing
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await expect(page.getByTestId('banner-strip')).toHaveCount(1);
  expect(await names(page)).toEqual(before);
  await page.getByTestId('banner-action').click();
  await app.close();
});

test('list keys, search, chips and the context menu', async () => {
  const { app, page } = await start();
  await page.getByTestId('chatlist-row').first().focus();
  await page.keyboard.press('ArrowDown');
  const second = await page.getByTestId('chatlist-row').nth(1).getAttribute('data-chat-id');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.chatId)).toBe(second);
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await page.keyboard.type('m');
  await expect(page.locator(':focus [data-testid="chatlist-row-name"]')).toHaveText(/^M/);
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('chatlist-menu-unread')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chatlist-menu-unread')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+F');
  await page.keyboard.type('zzzz');
  await expect(page.getByTestId('chatlist-empty')).toHaveAttribute('data-state', 'search');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chatlist-row').first()).toBeVisible();

  await page.getByTestId('chatlist-filter-working').click();
  await expect(page.getByTestId('chatlist-row')).toHaveCount(1);
  await page.getByTestId('chatlist-filter-all').click();

  // pin limit: three user pins, the fourth shows the status line
  for (const name of ['Trips', 'Money', 'Home', 'Family group']) {
    await row(page, name).click({ button: 'right' });
    await page.getByTestId('chatlist-menu-pin').click();
  }
  await expect(page.getByTestId('chatlist-status')).toHaveText('You can pin up to 3 chats.');
  await page.keyboard.press('Control+2');
  await expect(page.locator('[data-testid="chatlist-row"][aria-selected="true"]')).toHaveCount(1);
  await app.close();
});

test('the shell passes axe in light and dark (Article 26a audit)', async () => {
  const { app, page } = await start();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => window.__fooTest!.theme(t), theme);
    const r = await new AxeBuilder({ page }).include('[data-testid="sidebar"]').analyze();
    expect(r.violations.map((v) => `${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
  await app.close();
});

test('perf seed: list ready and chat switch smoke timings', async () => {
  const { app, page, seededMs } = await start('perf');
  console.log(`perf seed to first row: ${seededMs} ms`);
  const rows = page.getByTestId('chatlist-row');
  expect(await rows.count()).toBeGreaterThan(10);
  const times: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const t0 = Date.now();
    await rows.nth(i).click();
    await expect(rows.nth(i)).toHaveAttribute('aria-selected', 'true');
    times.push(Date.now() - t0);
  }
  console.log(`chat switch ms: ${times.join(', ')}`);
  expect(Math.max(...times)).toBeLessThan(2_000); // smoke only; budgets are measured on the reference laptop (10-2 §E)
  await app.close();
});

test('spec values for the left shell: SV-13, 14, 15, 17, 23, 24, 25', async () => {
  const { app, page } = await start();
  await setSize(app, page, 1440, 900);
  const all = readRows();
  const pick = (id: string): SvRow => {
    const live = { ...all.find((r) => r.id === id)! };
    delete live.pending;
    return live;
  };
  // A folded row is one 44 line by design (X-153); "Mark as unread" unfolds News & X so every row is a full row.
  await row(page, 'News & X').click({ button: 'right' });
  await page.getByTestId('chatlist-menu-unread').click();
  await expect(page.locator('[data-testid="chatlist-row"][data-folded="true"]')).toHaveCount(0);
  await row(page, 'Trips').click({ button: 'right' }); // a menu open for SV-23
  const rows = ['SV-13', 'SV-14', 'SV-17', 'SV-23', 'SV-24', 'SV-25'].map(pick);
  const results = await checkSpecValues(page, { theme: 'light', app, rows });
  // SV-15: the left header is 60 high (the chat header half belongs to the main shell).
  const header = await page.locator('[data-testid="sidebar"] > div').first().boundingBox();
  results.push({ id: 'SV-15', ok: header?.height === 60, expected: '60px', measured: `${header?.height}px` });
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'fid-14-m1-list.json'), JSON.stringify(results, null, 2) + '\n');
  expect(results.filter((r) => !r.ok)).toEqual([]);
  await app.close();
});
