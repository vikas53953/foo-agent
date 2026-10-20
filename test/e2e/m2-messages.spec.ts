// Spec: 10-acceptance-2 §E PERF-04 (fling from bottom to top and back in the 5,000-message chat with mixed bubbles, cards
// and images: ≤ 1 % of frames over 16.7 ms; DOM message nodes bounded by the virtualised list), §D ART-26a (axe on every
// surface and state, light and dark: here the M2 bubbles, cards, the bubble menu and the reaction picker; 04 §1–§19,
// 05-3 §5.22–§5.24), §D ART-21a (time scan of the rendered thread, "except bubble meta"), 11-fidelity FID-14 (SV-01…SV-09,
// SV-26 bubble times). spec/trace.csv routes these ids to this file (CR-0003). Runs on the perf and ux-world seeds (08-3
// §22.9) in Electron.
// Legacy mode: axe's default run opens a blank page for frame results, which Electron does not support (Target.createTarget).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { renderedTimeFlags, type RenderedString } from '../articles/scan';
import { checkSpecValues, readRows, type SvResult } from '../fidelity/spec-values';
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

/** Starts recording every frame's duration (rAF to rAF). */
async function startFrames(page: Page): Promise<void> {
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
}

/** Stops recording and returns the frame durations. */
async function stopFrames(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    return w.__frames.slice(1);
  });
}

/** Scrolls the log with wheel flings until it reaches the end, measuring every frame meanwhile. */
async function fling(page: Page, dir: -1 | 1): Promise<number[]> {
  const log = page.getByTestId(TID.threadLog);
  const box = (await log.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await startFrames(page);
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel(0, dir * 1200);
    const edge = await log.evaluate((el, d) => (d < 0 ? el.scrollTop <= 0 : el.scrollHeight - el.scrollTop - el.clientHeight < 2), dir);
    const loading = await page.getByTestId(TID.threadLoadOlder).count();
    if (edge && !loading) break;
  }
  return stopFrames(page);
}

/**
 * Controls for PERF-04, logged and not asserted: the same frame counter in the same window and run, (a) with no input at
 * all and (b) with the fling's wheel events and round trips sent to the chat header, which does not scroll. Long frames
 * there are the machine's (runner, software GPU), not the list's; the evidence a PERF CR would need.
 */
async function controlFrames(page: Page, wheels: number): Promise<{ idle: number[]; header: number[] }> {
  await startFrames(page);
  await page.waitForTimeout(5_000);
  const idle = await stopFrames(page);
  const head = (await page.getByTestId(TID.chatHeader).boundingBox())!;
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  const log = page.getByTestId(TID.threadLog);
  await startFrames(page);
  for (let i = 0; i < wheels; i++) {
    await page.mouse.wheel(0, -1200);
    await log.evaluate((el) => el.scrollTop);
    await page.getByTestId(TID.threadLoadOlder).count();
  }
  return { idle, header: await stopFrames(page) };
}

const share = (frames: number[]) =>
  `${frames.length} frames, over ${FRAME_MS} ms: ${frames.filter((f) => f > FRAME_MS).length} (${(
    (100 * frames.filter((f) => f > FRAME_MS).length) /
    Math.max(1, frames.length)
  ).toFixed(1)} %), p50 ${[...frames].sort((a, b) => a - b)[Math.floor(frames.length / 2)]?.toFixed(1)} ms`;

const logOf = (page: Page) => page.getByTestId(TID.threadLog);
const rowsInDom = (page: Page) => page.locator(`${byTid(TID.threadLog)} [data-index]`).count();

test('PERF-04 · fling scroll through the 5,000-message chat holds 60 fps and keeps the DOM bounded', async () => {
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
  const control = await controlFrames(page, 200);
  console.log(`PERF-04 control, no input: ${share(control.idle)}`);
  console.log(`PERF-04 control, 200 wheels on the chat header: ${share(control.header)}`);
  console.log(`PERF-04 fling: ${share(frames)}`);
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

test('ART-26a · bubbles, cards, the bubble menu and the reaction picker pass axe in light and dark', async () => {
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
    // The list is virtual (Article 28): rows above the window are not in the DOM until scrolled near. Row heights settle
    // and the live Trips job re-renders the list while we walk, so a found row can leave the DOM again before Playwright
    // reaches it: centre it in the same frame it is found, and walk again until it stays visible.
    await expect(async () => {
      await logOf(page).evaluate(async (log, id) => {
        const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const row = () => log.querySelector(`[data-testid="${id}"]`);
        log.scrollTop = 0;
        await frames();
        // Down from the oldest row, then back up: a new row from the live job can snap the list past the one we want.
        for (const dir of [1, -1]) {
          for (let i = 0, still = 0; i < 400 && !row() && still < 6; i++) {
            const before = log.scrollTop;
            log.scrollTop = before + dir * log.clientHeight * 0.3;
            await frames();
            still = log.scrollTop === before ? still + 1 : 0;
          }
        }
        row()?.scrollIntoView({ block: 'center' });
        await frames();
      }, tid);
      await expect(el).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
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

/** Every rendered string of the message log: each bubble's text (its meta taken out), each meta, every other text node. */
async function threadStrings(page: Page): Promise<RenderedString[]> {
  return page.getByTestId(TID.threadLog).evaluate((log) => {
    const out: { text: string; meta: boolean }[] = [];
    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
    for (const el of Array.from(log.querySelectorAll('[data-meta]'))) out.push({ text: norm(el.textContent), meta: true });
    for (const el of Array.from(log.querySelectorAll('[data-copy]'))) {
      if (el.parentElement?.closest('[data-copy]')) continue;
      const copy = el.cloneNode(true) as Element;
      copy.querySelectorAll('[data-meta]').forEach((m) => m.remove());
      out.push({ text: norm(copy.textContent), meta: false });
    }
    const walker = document.createTreeWalker(log, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('[data-copy], [data-meta]')) continue;
      const text = norm(n.textContent);
      if (text) out.push({ text, meta: false });
    }
    return out.filter((s) => s.text);
  });
}

test('ART-21a · the rendered thread shows every clock time with its weekday, day and month; bubble meta is exempt', async () => {
  test.setTimeout(120_000);
  const { app, page } = await start('ux-world');
  await openChat(page, 'foo');
  const strings: RenderedString[] = [];
  // Walk foo's chat from the newest row to the first, collecting what the virtual list renders on the way.
  for (let i = 0; i < 200; i++) {
    strings.push(...(await threadStrings(page)));
    const top = await logOf(page).evaluate((el) => {
      el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.75);
      return el.scrollTop;
    });
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    if (top <= 0 && !(await page.getByTestId(TID.threadLoadOlder).count())) break;
  }
  strings.push(...(await threadStrings(page)));
  const unique = [...new Map(strings.map((s) => [`${s.meta}|${s.text}`, s])).values()];
  console.log(`ART-21a: ${unique.length} rendered strings (${unique.filter((s) => s.meta).length} bubble meta, exempt)`);
  expect(unique.some((s) => s.meta)).toBe(true);
  expect(renderedTimeFlags(unique)).toEqual([]);
  await app.close();
});

/** SV-01 (prose): the corners that are not tails are 18px; the tails (data-tl/-tr/-br/-bl, 04 §1.4) are 6px. */
async function corners(page: Page): Promise<SvResult> {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const sel = ['bubble-me', 'bubble-foo', 'bubble-helper'].map((id) => `[data-testid="${id}"][data-pos]`).join(', ');
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const cs = getComputedStyle(el);
      const at = { tl: cs.borderTopLeftRadius, tr: cs.borderTopRightRadius, br: cs.borderBottomRightRadius, bl: cs.borderBottomLeftRadius };
      for (const [k, v] of Object.entries(at)) {
        const want = el.hasAttribute(`data-${k}`) ? '6px' : '18px';
        if (v !== want) out.push(`${el.dataset.testid} ${el.dataset.pos} ${k} ${v} ≠ ${want}`);
      }
    }
    return { out, n: document.querySelectorAll(sel).length };
  });
  return {
    id: 'SV-01',
    ok: bad.n > 0 && bad.out.length === 0,
    expected: '18px non-tail corners (tail corners 6px)',
    measured: bad.n ? (bad.out.length ? bad.out.join('; ') : `${bad.n} bubbles, all equal`) : 'element not found',
  };
}

/** SV-08 (prose): a bubble is at most 72 % of the column and 620px; a rich one at most 680px. */
async function widths(page: Page): Promise<SvResult> {
  const r = await page.evaluate(() => {
    const out: string[] = [];
    const sel = ['bubble-me', 'bubble-foo', 'bubble-helper'].map((id) => `[data-testid="${id}"][data-pos]`).join(', ');
    const all = Array.from(document.querySelectorAll<HTMLElement>(sel));
    for (const el of all) {
      const column = el.closest('[role="list"]')!.getBoundingClientRect().width;
      const w = el.getBoundingClientRect().width;
      const max = el.dataset.rich ? 680 : Math.min(0.72 * column, 620);
      if (w > max + 0.5) out.push(`${el.dataset.testid}${el.dataset.rich ? ' rich' : ''} ${w} > ${max}`);
    }
    return { out, n: all.length };
  });
  return {
    id: 'SV-08',
    ok: r.n > 0 && r.out.length === 0,
    expected: '≤ 72 % of the column and ≤ 620px (rich ≤ 680px)',
    measured: r.n ? (r.out.length ? r.out.join('; ') : `${r.n} bubbles within`) : 'element not found',
  };
}

test('FID-14 spec values for the M2 messages: SV-01 to SV-09 and SV-26 (bubble times), light and dark', async () => {
  test.setTimeout(120_000);
  const { app, page } = await start('ux-world');
  const rows = readRows();
  const pick = (...ids: string[]) => rows.filter((r) => ids.includes(r.id));
  const results: SvResult[] = [];

  // foo's chat: the chapter 8 scene has foo's two-bubble run, the Punjabi answer and the rich answer.
  await openChat(page, 'foo');
  const pa = page.locator(`${byTid(TID.bubbleFoo)}[lang="pa"]`).first();
  await logOf(page).evaluate(async (el) => {
    for (let i = 0; i < 40 && !el.querySelector('[data-testid="bubble-foo"][lang="pa"]'); i++) {
      el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.5);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }
  });
  await pa.scrollIntoViewIfNeeded();
  await expect(pa).toBeVisible();
  results.push(
    ...(await checkSpecValues(page, { theme: 'light', rows: pick('SV-03', 'SV-04', 'SV-05', 'SV-06', 'SV-07', 'SV-09', 'SV-26') })),
  );
  results.push(await corners(page), await widths(page));
  await page.evaluate(() => window.__fooTest!.theme('dark'));
  if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settle(page);
  const dark = await checkSpecValues(page, { theme: 'dark', rows: pick('SV-04', 'SV-05', 'SV-26') });
  results.push(...dark.map((r) => ({ ...r, note: 'dark' })));
  await page.evaluate(() => window.__fooTest!.theme('light'));
  if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Trips: the user's run (one photo, then a grid of three) for the tail of the last bubble of a run.
  await openChat(page, 'Trips');
  const image = page.getByTestId(TID.bubbleImage).first();
  await logOf(page).evaluate(async (el) => {
    for (let i = 0; i < 60 && !el.querySelector('[data-testid="bubble-me"][data-pos="last"]'); i++) {
      el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.5);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }
  });
  await image.scrollIntoViewIfNeeded();
  results.push(...(await checkSpecValues(page, { theme: 'light', rows: pick('SV-02') })));
  results.push({ ...(await corners(page)), note: 'Trips' }, { ...(await widths(page)), note: 'Trips' });

  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'fid-14-m2-messages.json'), JSON.stringify(results, null, 2) + '\n');
  expect(results.filter((r) => !r.ok)).toEqual([]);
  await app.close();
});
