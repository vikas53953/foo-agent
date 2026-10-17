// M0 acceptance (foo-plan §5 M0): one instance, identity, title bar, tokens live, light/dark, PERF-01 smoke.
import { expect, test, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import electronPath from 'electron';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { tokens } from '../../src/shared/tokens';
import { checkSpecValues } from '../fidelity/spec-values';
import { launch, testDirs } from './launch';

const EVIDENCE = join('qa-evidence', 'M0', 'screens');

test('cold start shows the empty window with foo title bar (PERF-01 smoke)', async () => {
  const t0 = Date.now();
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();
  const coldStartMs = Date.now() - t0;
  console.log(`PERF-01 smoke: ${coldStartMs} ms`);
  expect(coldStartMs).toBeLessThan(15_000); // smoke only; the 2.0 s budget is measured on the reference laptop (10-2 §E)

  expect(await page.title()).toBe('foo');
  const strip = page.getByTestId('titlebar-strip');
  const box = await strip.boundingBox();
  expect(box?.height).toBe(tokens.size['titlebar-h']);

  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds());
  expect(size.width).toBeLessThanOrEqual(1280);
  await app.close();
});

test('FID-14 spec values: live rows SV-16, SV-37, SV-38', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();
  const results = await checkSpecValues(page, { theme: 'light', app });
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'fid-14.json'), JSON.stringify(results, null, 2) + '\n');
  expect(results.map((r) => r.id)).toEqual(['SV-16', 'SV-37', 'SV-38']);
  expect(results.filter((r) => !r.ok)).toEqual([]);
  await app.close();
});

function seedSettings(dirs: ReturnType<typeof testDirs>, theme: 'light' | 'dark') {
  mkdirSync(dirs.FOO_DATA_DIR, { recursive: true });
  writeFileSync(
    join(dirs.FOO_DATA_DIR, 'settings.json'),
    JSON.stringify({ ...settingsDefaults, appearance: { ...settingsDefaults.appearance, theme } }),
  );
}

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

async function paintedColours(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-testid="titlebar-strip"]')!;
    const main = document.querySelector('main')!;
    return { strip: getComputedStyle(strip).backgroundColor, main: getComputedStyle(main).backgroundColor };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme (from settings, before first paint) paints the ${theme} tokens`, async () => {
    const dirs = testDirs();
    seedSettings(dirs, theme);
    const app = await launch(dirs);
    const page = await app.firstWindow();
    await page.getByTestId('titlebar-strip').waitFor();
    // On Windows, Electron makes prefers-color-scheme follow nativeTheme.themeSource (02-3 §F28.1). Linux CI has no
    // desktop theme bridge, so there the media query is emulated; windows-latest is the source of truth.
    if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const css = await paintedColours(page);
    expect(css.strip).toBe(rgb(tokens.colors['--bg-sidebar'][theme]));
    expect(css.main).toBe(rgb(tokens.colors['--bg-app'][theme]));
    const bg = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor());
    expect(bg.toUpperCase()).toBe(tokens.colors['--bg-sidebar'][theme].toUpperCase());
    mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE, `m0-window-${theme}.png`) });
    await app.close();
  });
}

test('theme follows a live switch without a restart (09 §9.12)', async () => {
  test.skip(process.platform !== 'win32', 'prefers-color-scheme follows nativeTheme live only on Windows and macOS');
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();
  for (const theme of ['dark', 'light'] as const) {
    await app.evaluate(({ nativeTheme }, th) => {
      nativeTheme.themeSource = th;
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect((await paintedColours(page)).strip).toBe(rgb(tokens.colors['--bg-sidebar'][theme]));
  }
  await app.close();
});

test('a second launch quits and focuses the first window', async () => {
  const dirs = testDirs();
  const app = await launch(dirs);
  const page = await app.firstWindow();
  await page.getByTestId('titlebar-strip').waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());

  const args = ['.', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])];
  const second = spawnSync(electronPath as unknown as string, args, {
    env: { ...process.env, FOO_TEST: '1', ...dirs },
    timeout: 30_000,
  });
  expect(second.status).toBe(0);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => !w.isMinimized()))).toEqual([true]);
  await app.close();
});
