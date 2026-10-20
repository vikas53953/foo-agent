// Spec: 10-acceptance-2 §C.8 AT-313 (splash: the 96px face's eyes open once; the logo never animates; Off: eyes already
// open), AT-314 (AI finder polish: a striped 4-step pill; rows test live, shimmer → ✓ works; app logos on white tiles);
// 06-1 §1.3 / §1.4 (Normal hands over to the shell, Slow shows "Getting things ready…" after 3.0 s), §2.2, 02-2 §F17.6;
// CR-0021 pick 9. The splash is held on screen by making main answer `app:getBootstrap` only when the test says so.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finder, finderRow, firstRun } from './ai-step-world';
import type {} from '../../src/shared/ipc';
import type { FakeLine } from './fakeAi';
import { advance } from './m8-drafts-world';
import { fullMotion, holdBootstrap } from './p1-first-run-world';

/** Every verify answers "ready" after 2 s, so the Testing state is on screen long enough to see. */
const VERIFY_SLOW: FakeLine = { match: { purpose: 'verify' }, reply: 'ready', once: false, delayMs: 2_000 };

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
  await face.waitFor();
  // One round trip, inside the 600 ms wake: the mood, the size and each eye's keyframes (computed style keeps them).
  const first = await face.evaluate((el) => ({
    state: el.getAttribute('data-state'),
    width: el.getBoundingClientRect().width,
    eyes: [...el.querySelectorAll('[data-part="eyes"] rect')].map((r) => [
      getComputedStyle(r).animationName,
      getComputedStyle(r).animationIterationCount,
    ]),
  }));
  expect(first.state).toBe('waking');
  expect(first.width).toBe(96);
  expect(first.eyes).toHaveLength(2);
  for (const [name, count] of first.eyes) {
    expect(name).toContain('wake');
    expect(count).toBe('1'); // once
  }
  await expect(page.getByTestId(TID.screenSplashWordmark)).toHaveText(t('app.window.title'));
  await expect(page.getByTestId(TID.screenSplashStatus)).toHaveText('');
  await expect(page.getByTestId(TID.appAnnouncer).first()).toContainText(t('app.splash.starting', { agentName: 'foo' }));
  // After the wake the eyes rest open: nothing in the splash is still running (no loop, no second wake), and the
  // wordmark and status line never moved. The shell underneath is out of reach (§1.5).
  await page.waitForTimeout(800);
  expect(await splashAnimations(page)).toEqual([]);
  const eyeHeight = await face
    .locator('[data-part="eyes"] rect')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(eyeHeight).toBeGreaterThan(96 * 0.2);
  expect(await page.evaluate(() => document.getElementById('root')!.inert)).toBe(true);
  await expect(page.getByTestId(TID.screenSplashStatus)).toHaveText(t('app.splash.loading'), { timeout: 4_000 });
  await expect(page.getByTestId(TID.screenSplashStatus)).toHaveAttribute('role', 'status');
  // The chat list arrives: the splash cross-fades out (data-exit while it fades), then the shell is live.
  const sawExit = page.waitForSelector(`[data-testid="${TID.screenSplash}"][data-exit]`, { state: 'attached', timeout: 3_000 });
  await release();
  await sawExit;
  await expect(splash).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById('root')!.inert)).toBe(false);
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

  // Only the face's own cross-fade may run (opacity, ≤ 83 ms at Off, §F15.9.5); no wake, blink or movement.
  expect((await splashAnimations(page)).filter((a) => !a.name.includes('cross'))).toEqual([]);
  // Eyes open: full height (24 of the 100-unit disc, §F15.9.1a), not a line.
  const eyeHeight = await face
    .locator('[data-part="eyes"] rect')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(eyeHeight).toBeGreaterThan(96 * 0.2);
  await release();
  // Off: the splash leaves at once (no fade, no data-exit).
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
