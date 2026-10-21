// Spec: 10-acceptance-2 §C.8 AT-324 (message details, 02 §F7.1 "Chat": each built detail animates at Full, fades at Basic,
// is still at Off, and the virtual list does not jump), CR-0021 picks 1–3 (springs through `--ease-spring` /
// `--ease-spring-soft` and `--m-spring`; exits faster than entrances; Basic is a `--m-basic` fade and Off the §F25.4 table),
// 04 §1.5 (rows from history or scroll-back appear without motion), 04 §14.4 (streamed words fade in). Every reply comes from
// the fake AI (FOO_FAKE_AI, 08-3 §22.3); no test reaches a real AI or the network.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { TID } from '../../src/shared/testids';
import { intake, launchWithFakeAi, type FakeLine } from './fakeAi';
import { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

const byTid = (id: string) => `[data-testid="${id}"]`;
/** 02 §F7: `--m-spring` 400ms, `--m-basic` 200ms, Off fades 83ms; the spring is a CSS `linear()` curve (CR-0021 pick 1). */
const SPRING = '0.4s';
const BASIC = '0.2s';
const OFF = '0.083s';
/** The engine's hold before a reply streams (08-4 §25.5 item 2). */
const HOLD_MS = 1500;

type Level = 'full' | 'basic' | 'off';

async function start(lines: FakeLine[], seed: 'ux-world' | 'perf' = 'ux-world') {
  const dirs = testDirs();
  mkdirSync(dirs.FOO_DATA_DIR, { recursive: true });
  writeFileSync(
    join(dirs.FOO_DATA_DIR, 'settings.json'),
    JSON.stringify({ ...settingsDefaults, appearance: { ...settingsDefaults.appearance, animations: 'full' } }),
  );
  const { app } = await launchWithFakeAi(lines, { dirs });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const { refs } = await page.evaluate((s) => window.__fooTest!.seed(s), seed);
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  if (seed === 'ux-world') await settleSeededJobs(page, refs);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.waitForFunction(() => window.innerWidth === 1280);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  return { app, page };
}

async function openChat(page: Page, name: string) {
  await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) })
    .first()
    .click();
  await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
  await expect(page.getByTestId(TID.composerField)).toBeVisible();
}

/** The motion level as Settings → Appearance applies it (02 §F7 X-150: `<html data-motion>`). */
const setLevel = (page: Page, level: Level) => page.evaluate((l) => (document.documentElement.dataset.motion = l), level);

async function send(page: Page, text: string): Promise<Locator> {
  const field = page.getByTestId(TID.composerField);
  // The field takes text only once the AI has passed its test (AT-006); a slow runner can still be testing it here.
  await expect(field).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
  await field.focus();
  // A key typed while the field re-renders can be lost on a slow Windows runner ("dentit", PR #85 run 39583657155):
  // type at a human pace, and once more from empty if the words still came out wrong.
  await page.keyboard.type(text, { delay: 15 });
  if (!((await field.textContent()) ?? '').includes(text)) {
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text, { delay: 30 });
  }
  await expect(field).toContainText(text);
  await page.keyboard.press('Enter');
  const bubble = page.getByTestId(TID.bubbleMe).filter({ hasText: text });
  await expect(bubble).toBeVisible();
  return page.locator(`${byTid(TID.threadLog)} [data-message-id]`).filter({ has: bubble });
}

/** The computed animation of the first element under `el` that matches `sel` (or `el` itself). */
function anim(loc: Locator, sel?: string) {
  return loc.evaluate((el, s) => {
    const target = (s ? el.querySelector(s) : el) as HTMLElement | null;
    if (!target) return null;
    const cs = getComputedStyle(target);
    return { name: cs.animationName, duration: cs.animationDuration, timing: cs.animationTimingFunction };
  }, sel);
}

const moveScale = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim());

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

/** The turn starts on the engine's own schedule: move the clock past the hold until the reply shows (as m3-replies does). */
async function showUp(page: Page, bubble: Locator) {
  await expect
    .poll(async () => {
      await advance(page, HOLD_MS + 100);
      return bubble.count();
    })
    .toBeGreaterThan(0);
  await expect(bubble).toBeVisible();
}

test('AT-324 · a new message rises with the spring at Full, fades at Basic, is still at Off; your bubble grows from the send button', async () => {
  const { app, page } = await start([]);
  await openChat(page, 'foo');

  const full = await send(page, 'book the dentist for Saturday');
  await expect(full).toHaveAttribute('data-new', '');
  const a = await anim(full, ':scope > div');
  expect(a?.name).toMatch(/row-grow/);
  expect(a?.duration).toBe(SPRING);
  expect(a?.timing).toMatch(/^linear\(/);
  expect(await full.evaluate((el) => getComputedStyle(el.firstElementChild!).transformOrigin)).toMatch(/px$/);
  expect(await moveScale(page)).toBe('1');

  await setLevel(page, 'basic');
  const basic = await send(page, 'the morning slot is best');
  const b = await anim(basic, ':scope > div');
  expect(b?.duration).toBe(BASIC);
  expect(b?.timing).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  expect(await moveScale(page)).toBe('0');

  await setLevel(page, 'off');
  const off = await send(page, 'thanks');
  const c = await anim(off, ':scope > div');
  expect(c?.duration).toBe(OFF);
  expect(await moveScale(page)).toBe('0');
  await app.close();
});

test('AT-324 · the rise plays once per message: not again on scroll-back, and the virtual list keeps its place', async () => {
  test.setTimeout(120_000);
  const { app, page } = await start([], 'perf');
  await openChat(page, 'foo');
  const row = await send(page, 'one more thing before I forget');
  const id = await row.getAttribute('data-message-id');
  await expect(row).toHaveAttribute('data-new', '');
  const log = page.getByTestId(TID.threadLog);
  // While the row animates the list stays pinned to the bottom (transforms never change the measured height).
  await page.waitForTimeout(500);
  const gap = await log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  expect(gap).toBeLessThanOrEqual(1);

  // Fling to the top: the row leaves the DOM; back to the bottom: it mounts again, with no rise.
  await log.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(page.locator(`${byTid(TID.threadLog)} [data-message-id="${id}"]`)).toHaveCount(0);
  await log.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const again = page.locator(`${byTid(TID.threadLog)} [data-message-id="${id}"]`);
  await expect(again).toBeVisible();
  await expect(again).not.toHaveAttribute('data-new', '');
  await app.close();
});

test('AT-324 · an error bubble shakes once with no red flash, and the retry spinner turns into ✓', async () => {
  const { app, page } = await start([
    intake('train times', '', { error: 'AI_TIMEOUT' }),
    intake('train times', 'The 7:10 AM Deccan Queen gets to Mumbai by 10:25 AM.'),
  ]);
  await openChat(page, 'foo');
  await send(page, 'train times to Mumbai?');
  const cut = page.locator(`${byTid(TID.bubbleFoo)}[data-state="failed"]`);
  await showUp(page, cut);
  const row = page.locator(`${byTid(TID.threadLog)} [data-message-id]`).filter({ has: cut });
  const line = row.locator('[data-shake]');
  await expect(line).toHaveCount(1);
  const shake = await anim(line);
  expect(shake?.name).toMatch(/shake/);
  // No red flash: the bubble keeps foo's bubble colour.
  const bg = await cut.evaluate((el) => getComputedStyle(el).backgroundColor);
  const fooBg = await page
    .getByTestId(TID.bubbleFoo)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe(fooBg);

  await cut.getByTestId(TID.bubbleErrorRetry).click();
  const retry = row.getByTestId(TID.bubbleErrorRetry);
  await expect(retry).toHaveAttribute('data-state', 'done');
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Deccan Queen' }));
  // The cut-off bubble stays (04 §19.4: one retry per bubble), so its ✓ stays too.
  await page.waitForTimeout(2_500);
  await expect(retry).toHaveAttribute('data-state', 'done');
  await app.close();
});

test('AT-324 · the reaction picker springs from the bubble, the picked reaction bounces once, code copy turns into ✓', async () => {
  const say = 'Run this:\n\n```bash\nnpm run build\n```';
  const { app, page } = await start([intake('build it', say)]);
  await openChat(page, 'foo');
  await send(page, 'how do I build it?');
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'npm run build' });
  await showUp(page, bubble);
  await expect(bubble).toHaveAttribute('data-state', 'complete');

  const copy = bubble.getByTestId(TID.bubbleCodeCopy);
  await copy.click();
  // The ✓ appears once the async clipboard write resolves, which can be a frame or two later on Windows runners.
  await expect.poll(async () => (await anim(copy, 'svg'))?.name ?? '').toMatch(/check-in/);
  expect((await anim(copy, 'svg'))?.duration).toBe(SPRING);

  const row = page.locator(`${byTid(TID.threadLog)} [data-message-id]`).filter({ has: bubble });
  await bubble.click({ button: 'right' });
  await page.getByTestId(TID.bubbleMenuReact).click();
  const picker = page.getByTestId(TID.bubbleReactPicker);
  await expect(picker).toBeVisible();
  const p = await anim(picker);
  expect(p?.name).toMatch(/picker-in/);
  expect(p?.timing).toMatch(/^linear\(/);
  await picker.getByTestId(TID.bubbleReactOption).first().click();
  const chip = row.getByTestId(TID.bubbleReaction).first();
  await expect(chip).toHaveAttribute('data-pop');
  expect((await anim(chip))?.name).toMatch(/pop/);
  await app.close();
});

test('AT-324 · streamed words fade in 150ms with no movement', async () => {
  const { app, page } = await start([
    {
      match: { purpose: 'intake', promptIncludes: 'next festival' },
      chunks: [
        { text: '<say>Holi is on Fri 26 Mar. ' },
        { text: 'Schools are shut that day too. ', delayMs: 20_000 },
        {
          text: `Shall I add both to your calendar?</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`,
          delayMs: 20_000,
        },
      ],
    },
  ]);
  await openChat(page, 'foo');
  await send(page, 'when is the next festival?');
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Holi is on' });
  await showUp(page, bubble);
  await expect(bubble).toHaveAttribute('data-state', 'streaming');
  await advance(page, 20_000);
  await expect(bubble).toContainText('Schools are shut');
  const fading = bubble.locator('span[class*="wordIn"]');
  await expect(fading.first()).toBeVisible();
  const w = await anim(fading.last());
  expect(w?.name).toMatch(/word-in/);
  expect(w?.timing).toBe('linear');
  await advance(page, 20_000);
  await expect(bubble).toHaveAttribute('data-state', 'complete');
  // A finished reply renders plain text again.
  await expect(bubble.locator('span[class*="wordIn"]')).toHaveCount(0);
  await app.close();
});
