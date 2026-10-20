// Spec: 10-2 §C.8 AT-318..AT-321 (CR-0021 picks 20–22): Settings → Appearance (06-2 §6.2 as amended) writes every row and
// applies it live; zoom keys and the Zoom row share `zoom` with overlay height round(32 × zoom) (09 §9.14.3); Mica stays solid
// in FOO_TEST runs (02-3 §F28.4 as amended); Sounds are off by default and play only Approve / Done (02-3 §F22 as amended).
// The test replaces AudioContext with a recorder (tones are made on first use), so no audio device is needed.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import type { CardSeedRequest } from '../../src/shared/ipc';
import type { PublicSettings } from '../../src/shared/types';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import { launch } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await launch();
  page = await app.firstWindow();
  await openWorld(app, page);
  // Record caption-overlay heights and stand in for the speakers.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const g = globalThis as unknown as { overlays: number[] };
    g.overlays = [];
    const set = win.setTitleBarOverlay.bind(win);
    win.setTitleBarOverlay = (o) => {
      g.overlays.push(o.height ?? -1);
      set(o);
    };
  });
  await page.evaluate(() => {
    const w = window as unknown as { tones: number; AudioContext: unknown };
    w.tones = 0;
    const node = () => ({
      connect: (n: unknown) => n ?? node(),
      frequency: { value: 0 },
      type: '',
      start() {},
      stop() {},
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    });
    w.AudioContext = class {
      state = 'running';
      currentTime = 0;
      destination = {};
      createOscillator() {
        w.tones++;
        return node();
      }
      createGain() {
        return node();
      }
      resume() {
        return Promise.resolve();
      }
    };
  });
});
test.afterAll(async () => app?.close());

const settings = () => page.evaluate(() => window.foo!.invoke('settings:get', {})) as Promise<{ ok: true; value: PublicSettings }>;
const current = async () => (await settings()).value;
const zoomFactor = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
const lastOverlay = () => app.evaluate(() => (globalThis as unknown as { overlays: number[] }).overlays.at(-1));
const tones = () => page.evaluate(() => (window as unknown as { tones: number }).tones);

async function openAppearance(): Promise<void> {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'appearance' } }),
  );
  await page.getByTestId(TID.settingsRowAppearanceTheme).waitFor();
}

const row = (tid: string) => page.getByTestId(tid);
const toggle = (tid: string) => row(tid).getByRole('switch');

test('AT-320 every Appearance row writes its setting and applies live, without restart', async () => {
  await openAppearance();
  await expect(row(TID.settingsRowAppearancePreview)).toContainText(t('settings.appearance.preview.foo'));
  await expect(row(TID.settingsRowAppearancePreview)).toContainText(t('settings.appearance.preview.me'));

  await row(TID.settingsRowAppearanceTheme)
    .getByRole('radio', { name: t('settings.appearance.theme.dark') })
    .click();
  await expect.poll(async () => (await current()).appearance.theme).toBe('dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await row(TID.settingsRowAppearanceTheme)
    .getByRole('radio', { name: t('settings.appearance.theme.light') })
    .click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

  await toggle(TID.settingsRowAppearanceAccent).click();
  await expect.poll(async () => (await current()).appearance.useWindowsAccent).toBe(true);
  await expect(toggle(TID.settingsRowAppearanceAccent)).toHaveAttribute('aria-checked', 'true');
  await toggle(TID.settingsRowAppearanceAccent).click();
  await expect.poll(async () => (await current()).appearance.useWindowsAccent).toBe(false);
  // Off → the brand indigo from tokens.css (02-3 §F28.3).
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()))
    .toMatch(/^#2b3fd6$/i);

  await row(TID.settingsRowAppearanceZoom).getByRole('button').click();
  await page.getByRole('menuitem', { name: t('settings.appearance.zoom.value', { n: 125 }) }).click();
  await expect.poll(zoomFactor).toBe(1.25);
  await expect(row(TID.settingsRowAppearanceZoom)).toContainText('125%');

  await row(TID.settingsRowAppearanceAnimations)
    .getByRole('radio', { name: t('settings.appearance.animations.basic') })
    .click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('basic');
  expect((await current()).appearance.animations).toBe('basic');
  await row(TID.settingsRowAppearanceAnimations)
    .getByRole('radio', { name: t('settings.appearance.animations.full') })
    .click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe('full');

  for (const [tid, key] of [
    [TID.settingsRowAppearanceSounds, 'sounds'],
    [TID.settingsRowAppearanceMica, 'mica'],
    [TID.settingsRowAppearanceFaceMotion, 'faceMotion'],
  ] as const) {
    const before = (await current()).appearance[key];
    await toggle(tid).click();
    await expect.poll(async () => (await current()).appearance[key]).toBe(!before);
    await expect(toggle(tid)).toHaveAttribute('aria-checked', String(!before));
    await toggle(tid).click();
    await expect.poll(async () => (await current()).appearance[key]).toBe(before);
  }
  await row(TID.settingsRowAppearanceZoom).getByRole('button').click();
  await page.getByRole('menuitem', { name: t('settings.appearance.zoom.value', { n: 100 }) }).click();
  await expect.poll(zoomFactor).toBe(1);
});

test('AT-321 Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+wheel and the Zoom row share `zoom`; overlay height = round(32 × zoom)', async () => {
  await openAppearance();
  await page.keyboard.press('Control+Equal');
  await expect.poll(async () => (await current()).zoom).toBe(110);
  await expect.poll(zoomFactor).toBeCloseTo(1.1);
  await expect.poll(lastOverlay).toBe(35);
  await expect(row(TID.settingsRowAppearanceZoom)).toContainText('110%');
  await page.keyboard.press('Control+Equal');
  await expect.poll(async () => (await current()).zoom).toBe(125);
  await expect.poll(lastOverlay).toBe(40);
  await page.keyboard.press('Control+Minus');
  await expect.poll(async () => (await current()).zoom).toBe(110);
  await page.keyboard.press('Control+0');
  await expect.poll(async () => (await current()).zoom).toBe(100);
  await expect.poll(lastOverlay).toBe(32);
  await expect(row(TID.settingsRowAppearanceZoom)).toContainText('100%');

  await page.mouse.move(400, 400);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await current()).zoom).toBe(110);
  await expect.poll(zoomFactor).toBeCloseTo(1.1);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await current()).zoom).toBe(100);
  await expect.poll(zoomFactor).toBe(1);
});

test('AT-319 a FOO_TEST run stays solid: no Mica attribute, the left shell draws the solid sidebar fill', async () => {
  await openAppearance();
  const solid = () =>
    page.evaluate(() => ({
      mica: document.documentElement.hasAttribute('data-mica'),
      surface: getComputedStyle(document.documentElement).getPropertyValue('--bg-sidebar-surface').trim(),
      sidebar: getComputedStyle(document.documentElement).getPropertyValue('--bg-sidebar').trim(),
    }));
  expect((await current()).appearance.mica).toBe(true);
  const s = await solid();
  expect(s.mica).toBe(false);
  expect(s.surface).toBe(s.sidebar);
  await expect(row(TID.settingsRowAppearanceMica)).toBeVisible();
});

test('AT-318 Sounds are off by default; on, Approve plays a tone; never while off', async () => {
  expect((await current()).appearance.sounds).toBe(false);
  await openChat(page, 'foo');
  const T = Date.parse('2026-10-16T09:41:00+05:30');
  const seed = async () => {
    const fields = {
      verb: 'book',
      payee: 'Pizza by the Bay',
      siteDomain: 'example.com',
      partySize: 2,
      amountPaise: 0,
      cancelTerms: { freeUntil: T + 9 * 3_600_000, feePaise: 100_000, refundable: true },
      irreversible: false,
    } as const;
    const req = {
      type: 'approval',
      state: 'PENDING',
      payload: {
        variant: 'standard',
        approvalId: '',
        verb: 'book',
        title: 'Book a table',
        impact: 'Table for 2',
        fields,
        scopes: ['once'],
        hardLimit: true,
        expiresAt: T + 3_600_000,
      },
      approval: { fields, hardLimit: true, expiresAt: T + 3_600_000 },
    } as unknown as CardSeedRequest;
    const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
    const card = page.locator(`${byTid(TID.cardApproval)}[data-card-id="${r.cardId}"]`);
    await card.scrollIntoViewIfNeeded();
    return card;
  };
  let card = await seed();
  await card.getByTestId(TID.cardApprovalApprove).click();
  await expect(card).toHaveAttribute('data-card-state', 'APPROVED');
  await page.waitForTimeout(200);
  expect(await tones()).toBe(0);

  await page.evaluate(() => window.foo!.invoke('settings:set', { path: 'appearance.sounds', value: true }));
  card = await seed();
  await card.getByTestId(TID.cardApprovalApprove).click();
  await expect(card).toHaveAttribute('data-card-state', 'APPROVED');
  // Approve is two notes.
  await expect.poll(tones).toBe(2);
});
