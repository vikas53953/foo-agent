// Spec: 03-shell-2 §3.11 (acceptance 3.11.1, 3.11.2, 3.11.3 header back button, 3.11.5 header part, 3.11.8, 3.11.10),
// 10-acceptance-2 ART-26a (accessibility audit on builder B's surfaces), 11-fidelity FID-14 (SV-15, SV-18, SV-29, SV-32).
// Runs in CI only (Electron + the demo seed: chats foo, Trips, Money, Home, Family group). Builder A's test ids (chatlist-row,
// sidebar, composer-field, banner-*) are written as strings until the M1 merge puts them in TID.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { checkSpecValues, readRows, type SvResult } from '../fidelity/spec-values';
import { launch } from './launch';

const byTid = (id: string) => `[data-testid="${id}"]`;
const ROW = 'chatlist-row';

async function start(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();
  await page.evaluate(() => (window as unknown as { __fooTest: { seed(s: string): Promise<unknown> } }).__fooTest.seed('demo'));
  await page.reload();
  await page.locator(byTid(ROW)).first().waitFor();
  return { app, page };
}

async function resize(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await page.waitForFunction(([w]) => window.innerWidth === w, [width]);
}

async function openChat(page: Page, name: string) {
  await page.locator(byTid(ROW)).filter({ hasText: name }).first().click();
  await expect(page.getByTestId(TID.chatHeaderName)).toHaveText(name);
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

/** Which F6 pane holds focus (03-shell-2 §3.9.2). */
const focusedPane = (page: Page) =>
  page.evaluate(
    ([panel, log]) => {
      const el = document.activeElement;
      if (!el) return null;
      if (el.closest('[data-testid="banner-strip"]')) return 'banner';
      if (el.closest('[data-testid="sidebar"]')) return 'left';
      if (el.closest(`[data-testid="${panel}"]`)) return 'right';
      if (el.closest('[data-testid="composer-field"]') || el.closest('[data-composer-row]')) return 'composer';
      if (el.closest(`[data-testid="${log}"]`)) return 'messages';
      return null;
    },
    [TID.appPanel, TID.threadLog],
  );

test('3.11.1 + FID-14 SV-15/SV-18/SV-29: 1440 wide shows 340 / 760 / 340 with the right shell open', async () => {
  const { app, page } = await start();
  await resize(app, page, 1440, 900);
  await openChat(page, 'foo');
  const panel = page.getByTestId(TID.appPanel);
  await expect(panel).toHaveAttribute('data-state', 'open');
  await expect(panel).toHaveAttribute('data-mode', 'push');
  expect(Math.round((await box(page, byTid('sidebar'))).width)).toBe(340);
  expect(Math.round((await box(page, byTid(TID.thread))).width)).toBe(760);
  expect(Math.round((await box(page, byTid(TID.appPanel))).width)).toBe(340);

  // SV-15: chat header 60 tall, aligned with the left header (same top and bottom y).
  const head = await box(page, byTid(TID.chatHeader));
  const left = await page.evaluate(() => {
    const el =
      document.querySelector('[data-testid="sidebar"] header') ??
      document.querySelector('[data-testid="sidebar-new-helper"]')?.closest('header, [data-sidebar-header]') ??
      null;
    const r = el?.getBoundingClientRect();
    return r ? { y: r.y, height: r.height } : null;
  });
  const sv15: SvResult = {
    id: 'SV-15',
    ok:
      Math.abs(head.height - 60) <= 0.5 &&
      !!left &&
      Math.abs(left.y - head.y) <= 0.5 &&
      Math.abs(left.y + left.height - (head.y + head.height)) <= 0.5,
    expected: '60px; aligned',
    measured: `chat header ${head.y}+${head.height}; left header ${left ? `${left.y}+${left.height}` : 'not found'}`,
  };

  const rows = readRows().filter((r) => r.id === 'SV-18' || r.id === 'SV-29');
  const light = await checkSpecValues(page, { theme: 'light', rows });
  await page.evaluate(() => (window as unknown as { __fooTest: { theme(t: string): Promise<unknown> } }).__fooTest.theme('dark'));
  // As m0-window.spec.ts: Linux CI has no desktop theme bridge, so the media query is emulated there.
  if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await checkSpecValues(page, { theme: 'dark', rows: rows.filter((r) => r.id === 'SV-29') });
  const results = [sv15, ...light, ...dark.map((r) => ({ ...r, note: 'dark' }))];
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'fid-14-m1b.json'), JSON.stringify(results, null, 2) + '\n');
  expect(results.filter((r) => !r.ok)).toEqual([]);
  await app.close();
});

test('FID-14 SV-32: keyboard focus draws 2px --focus-outer + 1px --focus-inner', async () => {
  const { app, page } = await start();
  await resize(app, page, 1440, 900);
  await openChat(page, 'foo');
  await page.getByTestId(TID.chatHeaderFind).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement!);
    return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, shadow: cs.boxShadow };
  });
  expect(ring).toMatchObject({ width: '2px', style: 'solid', color: 'rgb(11, 11, 16)' });
  expect(ring.shadow).toContain('rgb(255, 255, 255) 0px 0px 0px 1px');
  await app.close();
});

test('3.11.2: at 1100 wide Ctrl+Shift+D overlays without moving the chat; Esc closes and returns focus to the Panel toggle', async () => {
  const { app, page } = await start();
  await resize(app, page, 1100, 760);
  await openChat(page, 'foo');
  const panel = page.getByTestId(TID.appPanel);
  await expect(panel).toHaveAttribute('data-state', 'closed');
  const before = await box(page, byTid(TID.thread));
  await page.getByTestId(TID.threadLog).focus();
  await page.keyboard.press('Control+Shift+D');
  await expect(panel).toHaveAttribute('data-state', 'open');
  await expect(panel).toHaveAttribute('data-mode', 'overlay');
  expect(await box(page, byTid(TID.thread))).toEqual(before);
  await expect(page.locator(`${byTid(TID.appPanel)} [data-panel-title]`)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveAttribute('data-state', 'closed');
  await expect(page.getByTestId(TID.chatHeaderPanel)).toBeFocused();
  await app.close();
});

test('3.11.3 (header part): at 600 wide one pane shows and the chat header has "Back to chats"', async () => {
  const { app, page } = await start();
  await resize(app, page, 600, 800);
  const list = page.getByTestId('sidebar');
  const thread = page.getByTestId(TID.thread);
  if (await thread.isVisible()) await page.getByTestId(TID.chatHeaderBack).click();
  await expect(list).toBeVisible();
  await page.locator(byTid(ROW)).filter({ hasText: 'Trips' }).first().click();
  await expect(thread).toBeVisible();
  await expect(list).toBeHidden();
  const back = page.getByTestId(TID.chatHeaderBack);
  await expect(back).toHaveAccessibleName('Back to chats');
  await back.click();
  await expect(list).toBeVisible();
  await expect(thread).toBeHidden();
  await app.close();
});

test('3.11.5 (header part): a chat that needs you shows a status line starting "Needs you:" within 1 s', async () => {
  const { app, page } = await start();
  await resize(app, page, 1440, 900);
  const needing = page.locator(byTid(ROW)).filter({ has: page.locator('[data-testid="chatlist-row-pill"]', { hasText: 'Needs you' }) });
  expect(await needing.count()).toBeGreaterThan(0);
  await needing.first().click();
  const status = page.getByTestId(TID.chatHeaderStatus);
  await expect(status).toHaveText(/^Needs you: /, { timeout: 1000 });
  await expect(status).toHaveAttribute('role', 'status');
  await app.close();
});

test('3.11.8: F6 with the panel open and no banner visits list → messages → composer → panel → list', async () => {
  const { app, page } = await start();
  await resize(app, page, 1440, 900);
  await openChat(page, 'foo');
  await expect(page.getByTestId(TID.appPanel)).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('banner-strip')).toHaveCount(0);
  await page.locator(`${byTid(ROW)}[aria-selected="true"]`).focus();
  expect(await focusedPane(page)).toBe('left');
  const composer = (await page.getByTestId('composer-field').count()) > 0;
  const expected = composer ? ['messages', 'composer', 'right', 'left'] : ['messages', 'right', 'left'];
  const visited: (string | null)[] = [];
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press('F6');
    visited.push(await focusedPane(page));
  }
  expect(visited).toEqual(expected);
  await page.keyboard.press('Shift+F6');
  expect(await focusedPane(page)).toBe('right');
  await app.close();
});

test('3.11.10: a group chat shows "In this group" instead of memory and no "Spent this month"', async () => {
  const { app, page } = await start();
  await resize(app, page, 1440, 900);
  await openChat(page, 'Family group');
  const members = page.getByTestId(TID.appPanelMembers);
  await expect(members).toBeVisible();
  await expect(members.getByRole('heading')).toHaveText(/in this group/i);
  await expect(members).toContainText('You');
  await expect(members).toContainText('Private things stay in your own chats.');
  await expect(page.getByTestId(TID.appPanelKnow)).toHaveCount(0);
  await expect(page.getByTestId(TID.appPanelSpent)).toHaveCount(0);
  await app.close();
});

test('accessibility audit on builder B surfaces (input to the m1-shell.spec.ts audit): chat header, find bar, message list, right shell', async () => {
  const { app, page } = await start();
  await resize(app, page, 1440, 900);
  await openChat(page, 'foo');
  await page.keyboard.press('Control+F');
  await expect(page.getByTestId(TID.threadFind)).toBeVisible();
  const include = [byTid(TID.thread), byTid(TID.appPanel)];

  // axe-core when the project has it; otherwise the hand checks below carry the audit.
  const axeModule = '@axe-core/playwright';
  const axe = (await import(/* @vite-ignore */ axeModule).catch(() => null)) as {
    default: new (o: { page: Page }) => {
      include(s: string): unknown;
      analyze(): Promise<{ violations: { id: string; impact: string | null }[] }>;
    };
  } | null;
  if (axe) {
    const builder = new axe.default({ page });
    for (const s of include) builder.include(s);
    const { violations } = await builder.analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }

  const problems = await page.evaluate((scopes) => {
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
    const landmarks = Array.from(document.querySelectorAll('main, aside, [role="log"]')).filter(
      (el) => !labelled(el) && el.getAttribute('aria-hidden') !== 'true',
    );
    for (const el of landmarks) out.push(`unnamed landmark ${el.tagName.toLowerCase()}`);
    const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
    for (const id of Array.from(new Set(ids.filter((id, i) => ids.indexOf(id) !== i)))) out.push(`duplicate id ${id}`);
    if (document.querySelectorAll('h1').length !== 1) out.push(`h1 count ${document.querySelectorAll('h1').length}`);
    return out;
  }, include);
  expect(problems).toEqual([]);
  await app.close();
});
