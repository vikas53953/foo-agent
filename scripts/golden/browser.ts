// Spec: 11-fidelity §11.2.2 (reference rendering: Electron's Chromium, 1440×900, deviceScaleFactor 1), §11.2.6 (GPU off).
// Opens a frozen reference file in one of two engines:
// - electron (default; the golden runner): Electron's own Chromium through Playwright `_electron`, scripts/golden/electron-host.mjs;
// - chromium (local smoke only): Playwright's Chromium, executable from `--chromium-path` or FOO_CHROMIUM_PATH.
// Network is blocked in both, so the Blueprint's web fonts never load and a render depends only on the frozen file and the runner.
import { _electron, chromium, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Engine = 'electron' | 'chromium';
export const VIEWPORT = { width: 1440, height: 900 } as const;
const HOST = resolve('scripts', 'golden', 'electron-host.mjs');

export interface RefBrowser {
  engine: Engine;
  /** Chromium version string the pages were drawn with. */
  chromiumVersion: string;
  electronVersion: string | null;
  open(file: string): Promise<Page>;
  close(): Promise<void>;
}

/**
 * The frozen Blueprint source has no `<meta charset>` (the artifact host adds one when it publishes), so a file:// load
 * leaves the encoding to Chromium's detector, which sometimes picks windows-1252 and draws mojibake for "⌕" (FID-03 failed
 * that way on the golden runner). Such a reference is opened from a temporary copy that declares UTF-8 right after any
 * doctype (so the mode does not change); the frozen file is never changed.
 */
export function utf8Url(file: string): string {
  const html = readFileSync(resolve(file), 'utf8');
  if (/<meta[^>]+charset/i.test(html.slice(0, 1024))) return pathToFileURL(resolve(file)).toString();
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '';
  const copy = join(mkdtempSync(join(tmpdir(), 'foo-ref-')), 'ref.html');
  writeFileSync(copy, `${doctype}<meta charset="utf-8">${html.slice(doctype.length)}`, 'utf8');
  return pathToFileURL(copy).toString();
}

const allowed = (url: string) => /^(file|data|about|blob|devtools):/.test(url);

export async function openRefBrowser(engine: Engine, chromiumPath?: string): Promise<RefBrowser> {
  if (engine === 'chromium') {
    const exe = chromiumPath ?? process.env.FOO_CHROMIUM_PATH;
    const browser: Browser = await chromium.launch({
      ...(exe ? { executablePath: exe } : {}),
      args: ['--force-device-scale-factor=1', '--disable-gpu', '--font-render-hinting=none'],
    });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
    await context.route('**/*', (route) => (allowed(route.request().url()) ? route.continue() : route.abort()));
    return {
      engine,
      chromiumVersion: browser.version(),
      electronVersion: null,
      async open(file) {
        const page = await context.newPage();
        await page.goto(utf8Url(file), { waitUntil: 'load' });
        return page;
      },
      close: () => browser.close(),
    };
  }
  const userData = mkdtempSync(join(tmpdir(), 'foo-golden-'));
  const app: ElectronApplication = await _electron.launch({
    args: [HOST, '--force-device-scale-factor=1', '--disable-gpu', `--user-data-dir=${userData}`],
    colorScheme: 'light',
    env: { ...process.env, FOO_GOLDEN_USER_DATA: userData } as Record<string, string>,
  });
  const versions = await app.evaluate(() => ({ chrome: process.versions.chrome ?? '', electron: process.versions.electron ?? '' }));
  // One window, reused: every open() navigates it to the next reference file.
  const page = await app.firstWindow();
  await page.setViewportSize(VIEWPORT);
  return {
    engine,
    chromiumVersion: versions.chrome,
    electronVersion: versions.electron,
    async open(file) {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await page.goto(utf8Url(file), { waitUntil: 'load' });
      return page;
    },
    close: () => app.close(),
  };
}

/** Fonts loaded and two animation frames painted (§11.2.2 step 2). */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.fonts.ready.then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))),
  );
}

export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((th) => {
    document.documentElement.dataset.theme = th;
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

/** Normalised text nodes under `selector` (R1 input): whitespace collapsed, empty nodes dropped, document order. */
export async function textNodes(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && getComputedStyle(el).display === 'none') continue;
      const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }, selector);
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Box of `selector` relative to the box of `frameSelector` (frame pixels). */
export async function boxIn(page: Page, frameSelector: string, selector: string): Promise<Box | null> {
  return page.evaluate(
    ([f, s]) => {
      const frame = document.querySelector(f!);
      const els = frame ? frame.querySelectorAll(s!) : null;
      const el = els && els.length ? els[els.length - 1] : null;
      if (!frame || !el) return null;
      const a = frame.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { x: b.x - a.x, y: b.y - a.y, width: b.width, height: b.height };
    },
    [frameSelector, selector],
  );
}
