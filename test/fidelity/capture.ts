// Spec: 11-fidelity §11.2.3 (drive the app into the drawn state: seed through test:seed, fake clock, real UI actions by test
// id, never hand-typed data), §11.2.4 (Tier R app side: the test writes { id, theme, png, texts, hlTexts, hl, anchors } with
// boxes in the captured image's pixels and anchors keyed like the reference JSON), §11.2.2 step 3 (animations disabled, caret
// hidden, CSS scale, fonts ready). Shared by the Blueprint capture specs (test/fidelity/bp) and the walkthrough step specs
// (test/fidelity/ux). Captures land in golden/out/app, where the golden lane's Tier R step compares them with golden/ref.
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedReply } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';

export const OUT = join('golden', 'out', 'app');
/** The frozen Blueprint and the generated manifest (scripts/golden-manifest.ts is an ES module with a CLI, so it is not imported here). */
const BP_FILE = join('spec', 'refs', 'bp', 'foo-blueprint-v2.html');
const MANIFEST = join('golden', 'manifest.json');
/** The fields of a golden/manifest.json UX entry the step specs read (scripts/golden-manifest.ts UxEntry). */
export interface UxStep {
  id: string;
  c: string;
  s: string;
  f: string;
  hl: string | null;
}
export const byTid = (id: string) => `[data-testid="${id}"]`;
export const SHOT = { animations: 'disabled', caret: 'hide', scale: 'css' } as const;
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
/** A fake microphone (Chromium's test device) for the recording states; the CI runners have no microphone. */
export const FAKE_MIC = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fonts ready and two animation frames (§11.2.2 step 2). */
export const settle = (page: Page) =>
  page.evaluate(() =>
    document.fonts.ready.then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))),
  );

/** Normalised text nodes under the element (same rule as the reference side, scripts/golden/browser.ts textNodes). */
export async function texts(page: Page, sel: string | null): Promise<string[]> {
  return page.evaluate((s) => {
    const root = s ? document.querySelector(s) : document.body;
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
  }, sel);
}

/** Forces the theme through the test channel and waits until the page has it (Linux CI has no desktop theme bridge). */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => window.__fooTest!.theme(t), theme);
  if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: theme });
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
  // Fades started by the switch must end before a picture or a colour is read.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/**
 * The Blueprint/walkthrough world: fake clock, the ux-world seed (built from the walkthrough's own state objects, X-129),
 * a reload so the window opens on it, 1280 × 800 content (§11.2.3 launch). Returns the seed's row ids.
 */
export async function openWorld(
  app: ElectronApplication,
  page: Page,
  at = '2026-10-16T09:41:00+05:30',
  set: 'ux-world' | 'ux-world-ch8-live' = 'ux-world',
): Promise<Record<string, string>> {
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const reply = await page.evaluate(
    async ([iso, s]) => {
      const t = window.__fooTest!;
      await t.clock.set(iso);
      return t.seed(s);
    },
    [at, set] as const,
  );
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1280, 800);
  return (reply as SeedReply).refs ?? {};
}

export async function windowSize(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await page.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [width, height]);
}

/** Opens a chat by its row in the chat list (the name cell, by test id). */
export async function openChat(page: Page, name: string): Promise<void> {
  await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) })
    .first()
    .click();
  await page.getByTestId(TID.threadLog).waitFor();
  await page.waitForFunction(([head, n]) => document.querySelector(`[data-testid="${head}"]`)?.textContent?.includes(n) ?? false, [
    TID.chatHeaderName,
    name,
  ] as const);
}

/**
 * Ctrl+M → the Memory page in its list state. The page's script loads on first open (CR-0021, P1 T10), so the key is proven
 * by the view changing at once (the page, its loading frame or its load error), and the page itself gets 20 s: with the
 * 5 s default a busy Windows runner sometimes had no page yet on first open (AT-303, BP-m6).
 */
export async function openMemory(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+m');
  await page
    .locator(`${byTid(TID.screenMemory)}, [data-page-loading], ${byTid(TID.screenError)}`)
    .first()
    .waitFor({ state: 'attached', timeout: 5_000 });
  if ((await page.getByTestId(TID.screenError).count()) > 0) throw new Error('the Memory page showed an error instead of its list');
  await page.locator(`${byTid(TID.screenMemory)}[data-state="list"]`).waitFor({ timeout: 20_000 });
  return page.getByTestId(TID.screenMemory);
}

/** No hover or focus ring in the picture: the drawings show the resting state. */
export async function rest(page: Page): Promise<void> {
  await page.mouse.move(640, 16);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

export const rowOf = (messageId: string) => `${byTid(TID.threadLog)} [data-message-id="${messageId}"]`;

/**
 * Scrolls the message log (programmatically, so the sticky date stays hidden, 03-shell-2 §3.6.5) until the row is in the
 * virtual list's DOM, then places it as the newest row sits: its bottom the same distance above the log's bottom as the last
 * row's when the log is at its end. That is the frame the walkthrough draws when that message is the latest one.
 */
export async function frameAt(page: Page, rowSel: string): Promise<void> {
  const log = byTid(TID.threadLog);
  const gap = await page.evaluate(async (l) => {
    const el = document.querySelector<HTMLElement>(l)!;
    el.scrollTop = el.scrollHeight;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    el.scrollTop = el.scrollHeight;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const bottoms = Array.from(el.querySelectorAll('[role="listitem"]')).map((r) => r.getBoundingClientRect().bottom);
    return el.getBoundingClientRect().bottom - Math.max(...bottoms);
  }, log);
  for (let i = 0; i < 80; i++) {
    const delta = await page.evaluate(
      ([l, s, g]) => {
        const el = document.querySelector<HTMLElement>(l as string)!;
        const row = el.querySelector(s as string);
        if (!row) {
          if (el.scrollTop <= 0) throw new Error(`${s as string} is not in the message log`);
          el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.75);
          return null;
        }
        const d = row.getBoundingClientRect().bottom - (el.getBoundingClientRect().bottom - (g as number));
        el.scrollTop += d;
        return d;
      },
      [log, rowSel, gap] as const,
    );
    if (delta !== null && Math.abs(delta) < 0.5) return;
    await settle(page);
  }
  throw new Error(`could not place ${rowSel} at the bottom of the log`);
}

export async function boxOf(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`${loc.toString()} is not on screen`);
  return b;
}

/** A step whose trace rows are all `pending` is not built yet, so Tier R has nothing to judge: its capture is not written. */
const pendingOnly = (id: string): boolean => {
  const rows = readFileSync(join('spec', 'trace.csv'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.split(','))
    .filter((f) => f.includes(id));
  return rows.length > 0 && rows.every((f) => f.at(-1) === 'pending');
};

const write = (name: string, capture: object, png: Buffer) => {
  if (pendingOnly(name.slice(0, name.lastIndexOf('.')))) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), png);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(capture, null, 2) + '\n');
};

/** Tier R app side for a Blueprint id: the element's picture, its texts, and one anchor named by the id (as the reference). */
export async function captureBp(page: Page, id: string, sel: string, theme: Theme): Promise<void> {
  const loc = page.locator(sel).first();
  const b = await boxOf(loc);
  const png = await loc.screenshot(SHOT);
  const name = `${id}.${theme}`;
  write(
    name,
    {
      id,
      theme,
      png: `${name}.png`,
      texts: await texts(page, sel),
      hlTexts: [],
      hl: null,
      anchors: { [id]: { x: 0, y: 0, width: b.width, height: b.height } },
    },
    png,
  );
}

/**
 * Tier R app side for a Blueprint id drawn as several rows of the thread (e.g. BP-MSG-02: answer bubbles, the action row
 * and the Thinking row): the box from the top of `first` to the bottom of `last`, the width of the message log; texts are
 * the text nodes inside that box.
 */
export async function captureBpRange(page: Page, id: string, first: string, last: string, theme: Theme): Promise<void> {
  const log = await boxOf(page.locator(byTid(TID.threadLog)));
  const top = await boxOf(page.locator(first).first());
  const bottom = await boxOf(page.locator(last).last());
  const clip = { x: log.x, y: top.y, width: log.width, height: bottom.y + bottom.height - top.y };
  const png = await page.screenshot({ ...SHOT, clip });
  const inside = await page.evaluate(
    ([l, c]) => {
      const root = document.querySelector(l as string);
      const box = c as { x: number; y: number; width: number; height: number };
      const out: string[] = [];
      if (!root) return out;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || getComputedStyle(el).display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= box.y || r.top >= box.y + box.height) continue;
        const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      }
      return out;
    },
    [byTid(TID.threadLog), clip] as const,
  );
  const name = `${id}.${theme}`;
  write(
    name,
    {
      id,
      theme,
      png: `${name}.png`,
      texts: inside,
      hlTexts: [],
      hl: null,
      anchors: { [id]: { x: 0, y: 0, width: clip.width, height: clip.height } },
    },
    png,
  );
}

/**
 * The words of one Blueprint message mini (`<h3>{panel}</h3>` in the frozen Blueprint's #messages section): the text of each
 * bubble of the given side, without its meta. The words a step types or the fake AI answers come from the reference.
 */
export function blueprintBubbles(panel: string, side: 'me' | 'foo'): string[] {
  const html = readFileSync(BP_FILE, 'utf8');
  const start = html.indexOf(`<h3>${panel}</h3>`);
  if (start === -1) throw new Error(`no "${panel}" panel in ${BP_FILE}`);
  const end = html.indexOf('</div>\n    <div class="panel">', start);
  const part = html.slice(start, end === -1 ? undefined : end);
  return [...part.matchAll(new RegExp(`<div class="b ${side}[^"]*"[^>]*>([^<]+)<span class="meta">`, 'g'))].map((m) => m[1]!.trim());
}

/** Tier R app side for a walkthrough step: the whole 1280 × 800 window, its texts, the hl element's texts and box. */
export async function captureUx(page: Page, id: string, hlSel: string, theme: Theme): Promise<void> {
  const hl = await boxOf(page.locator(hlSel).first());
  const png = await page.screenshot(SHOT);
  const name = `${id}.${theme}`;
  write(
    name,
    { id, theme, png: `${name}.png`, texts: await texts(page, null), hlTexts: await texts(page, hlSel), hl, anchors: { hl } },
    png,
  );
}

/** The step's walkthrough texts (c, s, f) from golden/manifest.json, which is generated from the frozen walkthrough. */
export function step(id: string): UxStep {
  const e = (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { ux: UxStep[] }).ux.find((u) => u.id === id);
  if (!e) throw new Error(`${id} is not in golden/manifest.json`);
  return e;
}

/** The words in "double quotes" in a walkthrough text (the frame's exact strings). */
export const quoted = (text: string): string[] => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

/**
 * Text drawn in one Blueprint composer state (the `CS` table in the frozen Blueprint, `[title, html, caption]`): the typed
 * words of a state come from the reference, never from the test (§11.2.3 data rule).
 */
export function blueprintComposerText(state: string): string {
  const html = readFileSync(BP_FILE, 'utf8');
  const row = new RegExp(`\\['${state}','((?:\\\\'|[^'])*)'`).exec(html);
  const pill = row && /<div class="pill f">([^<]+)<\/div>/.exec(row[1]!);
  if (!pill) throw new Error(`no typed text for the "${state}" composer state in ${BP_FILE}`);
  return pill[1]!;
}
