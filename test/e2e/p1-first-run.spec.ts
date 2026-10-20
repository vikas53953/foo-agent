// Spec: 10-acceptance-2 §C.8 AT-313 (splash: the 96px face's eyes open once; the logo never animates; Off: eyes already
// open), AT-314 (AI finder polish: a striped 4-step pill; rows test live, shimmer → ✓ works; app logos on white tiles);
// 06-1 §1.3 / §1.4 (Normal hands over to the shell, Slow shows "Getting things ready…" after 3.0 s), §2.2, 02-2 §F17.6;
// CR-0021 pick 9. The splash is held on screen by making main answer `app:getBootstrap` only when the test says so.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finder, finderRow, firstRun } from './ai-step-world';
import type {} from '../../src/shared/ipc';
import type { FakeLine } from './fakeAi';
import { advance } from './m8-drafts-world';

/** Every verify answers "ready" after 2 s, so the Testing state is on screen long enough to see. */
const VERIFY_SLOW: FakeLine = { match: { purpose: 'verify' }, reply: 'ready', once: false, delayMs: 2_000 };

/** Full animations whatever the PC (a first run on ≤ 4 CPUs stores Basic, 02 §F7 X-150); applies from the next load. */
const fullMotion = (page: Page) => page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.animations', value: 'full' }));

/** Holds main's `app:getBootstrap` answer until `release()`; the renderer is reloaded so the splash paints again. */
async function holdBootstrap(app: ElectronApplication, page: Page): Promise<() => Promise<void>> {
  await app.evaluate(({ ipcMain }) => {
    type Handler = (...a: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
    const g = globalThis as { __fooBoot?: Handler; __fooRelease?: (() => void)[] };
    g.__fooBoot ??= handlers.get('app:getBootstrap')!;
    g.__fooRelease = [];
    handlers.set('app:getBootstrap', (...a: unknown[]) => new Promise((done) => g.__fooRelease!.push(() => done(g.__fooBoot!(...a)))));
  });
  await page.reload();
  return () =>
    app.evaluate(({ ipcMain }) => {
      const g = globalThis as { __fooBoot?: (...a: unknown[]) => unknown; __fooRelease?: (() => void)[] };
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers;
      handlers.set('app:getBootstrap', g.__fooBoot);
      g.__fooRelease!.splice(0).forEach((go) => go());
    });
}

/** The running animations inside the splash, by keyframes name. */
const splashAnimations = (page: Page) =>
  page.evaluate((root) => {
    const host = document.querySelector(`[data-testid="${root}"]`);
    return document
      .getAnimations()
      .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target && host?.contains(a.effect.target))
      .map((a) => ({
        name: (a as CSSAnimation).animationName,
        iterations: (a.effect as KeyframeEffect).getComputedTiming().iterations,
        part: (a.effect as KeyframeEffect).target!.closest('[data-testid]')?.getAttribute('data-testid') ?? '',
      }));
  }, TID.screenSplash);

test('AT-313 splash: the 96px face wakes once (eyes open from a line) then rests; the wordmark never animates; Slow line after 3 s; hands over to the shell', async () => {
  const { app, page } = await firstRun(aiHome(['claude']));
  await finder(page).waitFor();
  await fullMotion(page);
  const release = await holdBootstrap(app, page);
  const splash = page.getByTestId(TID.screenSplash);
  const face = page.getByTestId(TID.splashFace);
  await expect(splash).toBeVisible();
  await expect(face).toHaveAttribute('data-state', 'waking');
  expect(await face.evaluate((el) => el.getBoundingClientRect().width)).toBe(96);
  // Each eye plays the wake keyframes once (computed style keeps them after they finish).
  const eyes = await face
    .locator('[data-part="eyes"] rect')
    .evaluateAll((els) =>
      els.map((el) => ({ name: getComputedStyle(el).animationName, count: getComputedStyle(el).animationIterationCount })),
    );
  expect(eyes).toHaveLength(2);
  for (const e of eyes) {
    expect(e.name).toContain('wake');
    expect(e.count).toBe('1');
  }
  // Nothing else in the splash moves: the wordmark and status line hold still.
  expect((await splashAnimations(page)).every((a) => a.part === TID.splashFace)).toBe(true);
  await expect(page.getByTestId(TID.screenSplashWordmark)).toHaveText(t('app.window.title'));
  await expect(page.getByTestId(TID.screenSplashStatus)).toHaveText('');
  await expect(face).toHaveAttribute('data-state', 'resting');
  expect(
    await face
      .locator('[data-part="eyes"] rect')
      .evaluateAll((els) => els.some((el) => getComputedStyle(el).animationName.includes('wake'))),
  ).toBe(false);
  await expect(page.getByTestId(TID.screenSplashStatus)).toHaveText(t('app.splash.loading'), { timeout: 4_000 });
  await expect(page.getByTestId(TID.screenSplashStatus)).toHaveAttribute('role', 'status');
  await release();
  await expect(splash).toHaveCount(0);
  await expect(finder(page)).toBeVisible();
  await app.close();
});

test('AT-313 Off: with reduced motion the eyes are already open and nothing in the splash moves', async () => {
  const { app, page } = await firstRun(aiHome(['claude']));
  await finder(page).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const release = await holdBootstrap(app, page);
  const face = page.getByTestId(TID.splashFace);
  await expect(face).toBeVisible();
  await expect(face).toHaveAttribute('data-motion-face', 'off');
  await expect(face).toHaveAttribute('data-state', 'resting');
  // Only the face's own cross-fade may run (opacity, ≤ 83 ms at Off, §F15.9.5); no wake, blink or movement.
  expect((await splashAnimations(page)).filter((a) => !a.name.includes('cross'))).toEqual([]);
  // Eyes open: full height (24 of the 100-unit disc, §F15.9.1a), not a line.
  const eyeHeight = await face
    .locator('[data-part="eyes"] rect')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(eyeHeight).toBeGreaterThan(96 * 0.2);
  await release();
  await expect(page.getByTestId(TID.screenSplash)).toHaveCount(0);
  await app.close();
});

test('AT-314 AI finder: striped 4-step pill at step 1; rows test live (Testing… shimmers, then ✓ works); app logos on white tiles', async () => {
  const { app, page } = await firstRun(aiHome(['claude', 'codex']), [VERIFY_SLOW]);
  await fullMotion(page);
  await page.reload();
  const pill = finder(page).getByTestId(TID.setupProgress);
  await expect(pill).toHaveAttribute('role', 'progressbar');
  await expect(pill).toHaveAttribute('aria-valuenow', '1');
  await expect(pill).toHaveAttribute('aria-valuemax', '4');
  await expect(pill).toHaveAttribute('aria-label', t('setup.step_pill.1'));
  const fill = await pill.evaluate((el) => {
    const f = el.firstElementChild as HTMLElement;
    return { ratio: f.offsetWidth / el.clientWidth, bg: getComputedStyle(f).backgroundImage };
  });
  expect(fill.ratio).toBeCloseTo(0.25, 2);
  expect(fill.bg).toContain('repeating-linear-gradient');

  const claude = finderRow(page, 'claude-cli');
  await expect(claude).toHaveAttribute('data-state', 'testing', { timeout: 15_000 });
  const testing = claude.locator('[data-shimmer]');
  await expect(testing).toHaveText(t('setup.ai_finder.status.testing'));
  expect(await testing.evaluate((el) => getComputedStyle(el).animationName)).toContain('row-shimmer');
  await advance(page, 2_500); // the fake AI answers on main's clock
  await expect(claude).toHaveAttribute('data-state', 'works', { timeout: 15_000 });
  await expect(claude.locator('[data-shimmer]')).toHaveCount(0);
  await expect(claude.locator('[data-icon="CheckmarkCircle"]')).toBeVisible();

  const tiles = await finder(page)
    .locator(`[data-testid="${TID.setupAiRow}"]`)
    .evaluateAll((rows) =>
      rows.map((r) => {
        const tile = r.querySelector('[data-logo]') as HTMLElement;
        const img = tile.querySelector('img');
        const s = getComputedStyle(tile);
        return {
          id: r.getAttribute('data-row-id'),
          logo: tile.getAttribute('data-logo'),
          bg: s.backgroundColor,
          size: tile.getBoundingClientRect().width,
          loaded: img ? img.complete && img.naturalWidth > 0 : null,
          letters: tile.textContent,
        };
      }),
    );
  for (const tile of tiles) {
    expect(tile.letters).toBe(''); // no letter discs
    expect(tile.size).toBe(32);
    if (tile.id === 'own-key') expect(tile.logo).toBe('key');
    else {
      expect(tile.logo).toBe(tile.id);
      expect(tile.bg).toBe('rgb(255, 255, 255)');
      expect(tile.loaded).toBe(true);
    }
  }
  await app.close();
});
