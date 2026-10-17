// 08-3 §22.2, §22.7, §22.8: in FOO_TEST runs window.__fooTest drives the fake clock (X-10), the seed registry, the online
// flag, the theme and a reset through the test:* channels.
import { expect, test } from '@playwright/test';
import { TEST_EPOCH_MS } from '../../src/shared/clock';
import type {} from '../../src/shared/ipc'; // window.__fooTest type
import { launch } from './launch';

test('test hooks: clock, seed, online, theme, reset (08-3 §22)', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();

  expect(await page.evaluate(() => typeof window.__fooTest)).toBe('object');
  expect(await page.evaluate(() => window.__fooTest!.clock.now())).toEqual({ now: TEST_EPOCH_MS, iso: '2026-10-16T03:30:00.000Z' });
  expect((await page.evaluate(() => window.__fooTest!.clock.advance(60_000))).now).toBe(TEST_EPOCH_MS + 60_000);
  expect((await page.evaluate(() => window.__fooTest!.clock.set('2026-10-15T19:00:00+05:30'))).iso).toBe('2026-10-15T13:30:00.000Z');

  for (const set of ['demo', 'perf', 'ux-world'] as const) {
    expect(await page.evaluate((s) => window.__fooTest!.seed(s), set)).toMatchObject({ set, loaded: true });
  }
  await expect(page.evaluate(() => window.__fooTest!.seed('nope' as 'demo'))).rejects.toThrow();

  expect(await page.evaluate(() => window.__fooTest!.setOnline(false))).toEqual({ online: false });

  expect(await page.evaluate(() => window.__fooTest!.theme('dark'))).toEqual({ themeSource: 'dark' });
  if (process.platform === 'win32') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => window.__fooTest!.theme('light'))).toEqual({ themeSource: 'light' });
  if (process.platform === 'win32') await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  expect((await page.evaluate(() => window.__fooTest!.reset())).now).toBe(TEST_EPOCH_MS);
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');
  await app.close();
});
