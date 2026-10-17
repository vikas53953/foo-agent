// Spec: 10-acceptance-2 §E PERF-04 (fling from bottom to top and back in the 5,000-message chat with mixed bubbles, cards
// and images: ≤ 1 % of frames over 16.7 ms; DOM message nodes bounded by the virtualised list) and §D ART-26a (axe on every
// surface and state, light and dark: here the M2 bubbles, cards, the bubble menu and the reaction picker; 04 §1–§19,
// 05-3 §5.22–§5.24). spec/trace.csv routes neither id to this file yet (implementation-notes: CR needed), so the titles
// name behaviours. Runs on the perf and ux-world seeds (08-3 §22.9) in Electron.
// Legacy mode: axe's default run opens a blank page for frame results, which Electron does not support (Target.createTarget).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { launch } from './launch';

const byTid = (id: string) => `[data-testid="${id}"]`;
/** 02-2 §F13.3: one frame at 60 fps. */
const FRAME_MS = 16.7;
/** PERF-04: at most 1 % of frames may run long. */
const LONG_FRAME_SHARE = 0.01;
/** The virtualised list keeps the rows in view plus its overscan; far below 5,000 whatever the scroll position. */
const MAX_ROWS_IN_DOM = 80;

async function setSize(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await page.waitForFunction((w) => window.innerWidth === w, width);
}

async function start(seed: 'perf' | 'ux-world') {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await page.evaluate((s) => window.__fooTest!.seed(s), seed);
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await setSize(app, page, 1440, 900);
  return { app, page };
}

async function openChat(page: Page, name: string) {
  await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) })
    .first()
    .click();
  await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
  await expect(page.getByTestId(TID.threadLog)).toBeVisible();
}

/** Scrolls the log with wheel flings until `done` holds, measuring every frame meanwhile. */
async function fling(page: Page, dir: -1 | 1): Promise<number[]> {
  const log = page.getByTestId(TID.threadLog);
  const box = (await log.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel(0, dir * 1200);
    const edge = await log.evaluate((el, d) => (d < 0 ? el.scrollTop <= 0 : el.scrollHeight - el.scrollTop - el.clientHeight < 2), dir);
    const loading = await page.getByTestId(TID.threadLoadOlder).count();
    if (edge && !loading) break;
  }
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    return w.__frames.slice(1);
  });
}

const rowsInDom = (page: Page) => page.locator(`${byTid(TID.threadLog)} [data-index]`).count();

test('fling scroll through the 5,000-message chat holds 60 fps and keeps the DOM bounded', async () => {
  test.setTimeout(240_000);
  const { app, page } = await start('perf');
  await openChat(page, 'foo');
  const up = await fling(page, -1);
  const upRows = await rowsInDom(page);
  const down = await fling(page, 1);
  const downRows = await rowsInDom(page);
  const frames = [...up, ...down];
  const long = frames.filter((f) => f > FRAME_MS).length;
  console.log(`frames ${frames.length}, over ${FRAME_MS} ms: ${long}; rows in DOM ${upRows} / ${downRows}`);
  expect(frames.length).toBeGreaterThan(60);
  expect(long / frames.length).toBeLessThanOrEqual(LONG_FRAME_SHARE);
  expect(Math.max(upRows, downRows)).toBeLessThanOrEqual(MAX_ROWS_IN_DOM);
  await app.close();
});

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
}

async function audit(page: Page, scopes: string[], label: string) {
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => window.__fooTest!.theme(t), theme);
    if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await settle(page);
    let axe = new AxeBuilder({ page }).setLegacyMode(true);
    for (const s of scopes) axe = axe.include(s);
    const r = await axe.analyze();
    expect(r.violations.map((v) => `${label} ${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
}

test('bubbles, cards, the bubble menu and the reaction picker pass axe in light and dark', async () => {
  test.setTimeout(180_000);
  const { app, page } = await start('ux-world');
  const thread = byTid(TID.threadLog);

  // foo's chat: the chapter 8 scene (badges, 👍, Punjabi, reply-quote, rich answer with a table and sources).
  await openChat(page, 'foo');
  const rich = page.getByText('Goa flights, Sat 12 Dec');
  await rich.scrollIntoViewIfNeeded();
  await expect(rich).toBeVisible();
  await audit(page, [thread], 'foo chat');

  // Trips: the gallery (images, file, voice, Not sent, deleted, edited, Read more, emoji, code, Worked for, cards).
  await openChat(page, 'Trips');
  for (const tid of [TID.bubbleNotSent, TID.bubbleImage, TID.cardTable, TID.cardPlace]) {
    const el = page.getByTestId(tid).first();
    await el.scrollIntoViewIfNeeded();
    await expect(el).toBeVisible();
    await audit(page, [thread], `trips ${tid}`);
  }

  // The bubble menu (right-click) and the reaction picker (its React item).
  const answer = page.getByTestId(TID.bubbleHelper).filter({ hasText: 'Window seats are free' }).first();
  await answer.scrollIntoViewIfNeeded();
  await answer.click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await audit(page, ['[role="menu"]'], 'menu');
  await page.getByTestId(TID.bubbleMenuReact).click();
  await expect(page.getByTestId(TID.bubbleReactPicker)).toBeVisible();
  await audit(page, [byTid(TID.bubbleReactPicker)], 'picker');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.bubbleReactPicker)).toHaveCount(0);

  // The Family group: sender labels and the handoff marker.
  await openChat(page, 'Family group');
  await expect(page.getByTestId(TID.bubbleSender).first()).toBeVisible();
  await audit(page, [thread], 'group');
  await app.close();
});
