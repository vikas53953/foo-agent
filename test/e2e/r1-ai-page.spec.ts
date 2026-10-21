// Spec: 10-acceptance-2 §C.9 AT-357 (a fetch, an image URL or a navigation inside the page fails; main logs the denied
// request), AT-358 (`sandbox="allow-scripts"` only: no same-origin, popups or forms), AT-359 (over 512 KB: "This page is too
// big to open"; height stops at 600px and the page scrolls inside), AT-360 (other sources, bad schema and > 10 calls per
// second refused; every call logged through `page:rpc`), AT-361 (`requestAction` through the gate; `openLink` always C-26;
// secret text refused and the Secret box posts), AT-362 (the status line shows before the page is ready); 04 §13.6,
// CR-0022 (pick 13: requestAction and openLink only on the user's tap, one C-26 dialog at a time), X-180. Every reply comes from the fake AI (08-3 §22.3); the page is sample HTML on example.com links only.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Frame, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld } from '../fidelity/capture';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import type { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

/** The sample tool: a tall page whose script exposes `fooCall(method, params)` (JSON-RPC 2.0 over postMessage). */
const TOOL = [
  '<!doctype html><html><head><style>body{font-family:sans-serif;margin:8px}</style></head><body>',
  // The test sets `window.next` to a call, then taps Go: the call goes out on the user's tap (CR-0022 pick 13).
  '<button id="go" onclick="window.last = fooCall(window.next[0], window.next[1])">Go</button>',
  '<h1>Food budget</h1><div style="height:900px">November plan</div>',
  '<script>',
  'var n = 0;',
  'function fooCall(method, params) {',
  '  return new Promise(function (resolve) {',
  '    var id = ++n;',
  '    function on(e) { if (e.data && e.data.id === id) { removeEventListener("message", on); resolve(e.data); } }',
  '    addEventListener("message", on);',
  '    parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");',
  '  });',
  '}',
  'window.fooCall = fooCall;',
  // Report the height whenever layout changes (the first report can come before the frame has its width).
  'new ResizeObserver(function () { fooCall("reportSize", { height: document.documentElement.scrollHeight }); }).observe(document.body);',
  '</script></body></html>',
].join('\n');

const BUILDING_PROMPT = 'plan next month food budget';
const BUILDING_SAY = 'Here is a small tool for your food budget.';
const BIG_PROMPT = 'make a huge page';
const ACTION = 'Save budget of Rs 12000 for November';
const SECRET = 'my key is sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

/** The tool streams: the fence opens in the first piece and closes in the second, so the status line shows first. */
const streamedTool: FakeLine = {
  match: { purpose: 'intake', promptIncludes: BUILDING_PROMPT },
  chunks: [
    // The release gate shows a line once whitespace follows its break (08-4 §25.5 item 2), so the fence line is released
    // here and the HTML waits for the second piece.
    { text: `<say>${BUILDING_SAY}\n\n\`\`\`page\n\n` },
    { text: `${TOOL}\n\`\`\`</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`, delayMs: 30_000 },
  ],
};

let app: ElectronApplication;
let page: Page;
let dirs: ReturnType<typeof testDirs>;

const advance = (ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);
const log = () =>
  readdirSync(join(dirs.FOO_DATA_DIR, 'logs'))
    .filter((f) => /^app-.*\.log$/.test(f))
    .map((f) => readFileSync(join(dirs.FOO_DATA_DIR, 'logs', f), 'utf8'))
    .join('\n');
const lines = (re: RegExp) =>
  log()
    .split('\n')
    .filter((l) => re.test(l));

async function until(loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(1_600);
    await page.waitForTimeout(300);
  }
  await loc.first().waitFor({ state: 'attached' });
}

async function send(text: string) {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.bubbleMe).filter({ hasText: text }).first().waitFor();
}

/** The ready tool's frame (Playwright reaches into the sandboxed frame; foo's own code never does). */
async function toolFrame(): Promise<Frame> {
  const ready = page.getByTestId(TID.bubbleFoo).filter({ hasText: BUILDING_SAY }).getByTestId(TID.aiPage);
  await expect(ready).toHaveAttribute('data-state', 'ready');
  await page.getByTestId(TID.aiPageFrame).first().waitFor();
  for (let i = 0; i < 50; i++) {
    const f = page.frames().find((x) => x.url().startsWith('foo-page://'));
    if (f && (await f.evaluate(() => typeof (window as { fooCall?: unknown }).fooCall === 'function').catch(() => false))) return f;
    await page.waitForTimeout(100);
  }
  throw new Error('page frame never loaded');
}

type Reply = { result?: object; error?: { data: { reason: string } } };
const call = (f: Frame, method: string, params: object) =>
  f.evaluate(([m, p]) => (window as unknown as { fooCall: (m: string, p: object) => Promise<Reply> }).fooCall(m, p), [
    method,
    params,
  ] as const);
/** The same call, made from the user's tap on the page's Go button. */
async function tap(f: Frame, method: string, params: object): Promise<Reply> {
  await f.evaluate(([m, p]) => ((window as unknown as { next: unknown }).next = [m, p]), [method, params] as const);
  await f.locator('#go').click();
  return f.evaluate(() => (window as unknown as { last: Promise<Reply> }).last);
}

test.beforeAll(async () => {
  const run = await launchWithFakeAi([
    VERIFY_OK,
    streamedTool,
    intake(BIG_PROMPT, `This one is too big.\n\n\`\`\`page\n<!doctype html><p>${'x'.repeat(530_000)}</p>\n\`\`\``),
    intake(ACTION, 'I will save that budget once you say so.'),
  ]);
  app = run.app;
  dirs = run.dirs;
  page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
});

test.afterAll(async () => {
  await app?.close();
});

test('AT-362 AI page first view: the status line shows before the page is ready', async () => {
  await send(`make me a tool to ${BUILDING_PROMPT}`);
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: BUILDING_SAY });
  await until(bubble);
  const block = bubble.getByTestId(TID.aiPage);
  await until(block);
  await expect(block).toHaveAttribute('data-state', 'building');
  await expect(block.getByTestId(TID.aiPageStatus)).toHaveText(t('page.state.building'));
  await expect(block.getByTestId(TID.aiPageFrame)).toHaveCount(0);
  for (let i = 0; i < 40 && (await block.getAttribute('data-state')) !== 'ready'; i++) {
    await advance(1_600);
    await page.waitForTimeout(300);
  }
  await expect(block).toHaveAttribute('data-state', 'ready');
  await expect(block.getByTestId(TID.aiPageFrame)).toHaveCount(1);
  await expect(block.getByTestId(TID.aiPageStatus)).toHaveCount(0);
});

test('AT-358 AI page sandbox: allow-scripts only; no same-origin, popups or forms', async () => {
  const f = await toolFrame();
  await expect(page.getByTestId(TID.aiPageFrame).first()).toHaveAttribute('sandbox', 'allow-scripts');
  const inside = await f.evaluate(() => {
    let parentDoc = 'blocked';
    try {
      parentDoc = String(window.parent.document.title);
    } catch {
      // a cross-origin parent: the frame has no same-origin
    }
    const popup = window.open('https://example.com/');
    return { origin: window.origin, parentDoc, popup: popup === null };
  });
  expect(inside).toEqual({ origin: 'null', parentDoc: 'blocked', popup: true });
  // A form submit is blocked by the sandbox (no allow-forms) and form-action 'none': the frame stays on its document.
  await f.evaluate(() => {
    const form = document.createElement('form');
    form.action = 'https://example.com/submit';
    form.method = 'post';
    document.body.appendChild(form);
    form.submit();
  });
  await page.waitForTimeout(500);
  expect(page.frames().some((x) => x.url().startsWith('foo-page://'))).toBe(true);
  expect(page.frames().some((x) => x.url().includes('example.com'))).toBe(false);
});

test('AT-359 AI page caps: height stops at 600px and the page scrolls inside', async () => {
  const f = await toolFrame();
  const frameEl = page.getByTestId(TID.aiPageFrame).first();
  await expect.poll(async () => (await frameEl.boundingBox())?.height ?? 0).toBeGreaterThan(590);
  expect((await frameEl.boundingBox())!.height).toBeLessThanOrEqual(602);
  const scroll = await f.evaluate(() => ({ full: document.documentElement.scrollHeight, view: window.innerHeight }));
  expect(scroll.full).toBeGreaterThan(scroll.view);
});

test('AT-360 AI page bridge: other sources, bad schema and more than 10 calls per second are refused; every call is logged', async () => {
  const f = await toolFrame();
  const logged = lines(/PAGE_RPC|IPC_REJECTED.*page:rpc/).length;
  // A message posted by foo's own window (not the frame) is ignored: nothing reaches main.
  await page.evaluate(() => window.postMessage({ jsonrpc: '2.0', id: 1, method: 'draftMessage', params: { text: 'from elsewhere' } }, '*'));
  await page.waitForTimeout(500);
  expect(lines(/PAGE_RPC|IPC_REJECTED.*page:rpc/).length).toBe(logged);
  await expect(page.getByTestId(TID.composerField)).not.toContainText('from elsewhere');

  const bad = await call(f, 'deleteEverything', { all: true });
  expect(bad.error?.data.reason).toBe('schema');
  await page.waitForTimeout(1_100); // a fresh second: the host's own gate counts the bad call too

  const burst = await f.evaluate(() => {
    const w = window as unknown as { fooCall: (m: string, p: object) => Promise<Reply> };
    return Promise.all(Array.from({ length: 12 }, () => w.fooCall('reportSize', { height: 100 })));
  });
  expect(burst.filter((r) => r.error?.data.reason === 'rate').length).toBeGreaterThanOrEqual(2);
  // Every call from the frame (the bad one and all 12) left one line in the tech log.
  await expect.poll(() => lines(/PAGE_RPC|IPC_REJECTED.*page:rpc/).length - logged).toBe(13);
  expect(lines(/PAGE_RPC.*refused: rate/).length).toBeGreaterThanOrEqual(2);
});

test("AT-361 AI page actions: without the user's tap a page cannot send a message or open a link (CR-0022 pick 13)", async () => {
  const f = await toolFrame();
  await page.waitForTimeout(1_100);
  const mine = await page.getByTestId(TID.bubbleMe).count();
  // The page acts on its own, on a timer well after any tap (Playwright's evaluate counts as a tap for 5 s, so the
  // calls go out 5.5 s later from the page's own timer).
  await f.evaluate(() => {
    const w = window as unknown as { fooCall: (m: string, p: object) => Promise<Reply>; later: Promise<Reply[]> };
    w.later = new Promise((resolve) =>
      setTimeout(
        () =>
          void Promise.all([
            w.fooCall('requestAction', { text: 'Send Rs 500 to example.com' }),
            w.fooCall('openLink', { url: 'https://example.com/promo' }),
          ]).then(resolve),
        5_500,
      ),
    );
  });
  await page.waitForTimeout(6_500);
  const later = await f.evaluate(() => (window as unknown as { later: Promise<Reply[]> }).later);
  expect(later.map((r) => r.error?.data.reason)).toEqual(['declined', 'declined']);
  await page.waitForTimeout(500);
  await expect(page.getByTestId(TID.bubbleMe)).toHaveCount(mine);
  await expect(page.getByTestId(TID.aiPageOpenLink)).toHaveCount(0);
});

test('AT-361 AI page actions: requestAction goes through the gate; openLink always shows C-26; secret text refused, Secret box posts', async () => {
  const f = await toolFrame();
  await page.waitForTimeout(1_100); // a fresh second for the rate

  // openLink: the C-26 dialog first; Open hands the link to app:openExternal (source ai_page).
  expect((await tap(f, 'openLink', { url: 'https://example.com/menu' })).result).toEqual({});
  const dialog = page.getByTestId(TID.aiPageOpenLink);
  await expect(dialog).toContainText(t('page.open_link.title', { domain: 'example.com' }));
  // One dialog at a time: a second link while it is open is declined, and the dialog keeps naming the first.
  const second = await f.evaluate(() =>
    (window as unknown as { fooCall: (m: string, p: object) => Promise<Reply> }).fooCall('openLink', { url: 'https://shop.example.com/' }),
  );
  expect(second.error?.data.reason).toBe('declined');
  await expect(dialog).toContainText(t('page.open_link.title', { domain: 'example.com' }));
  await expect(dialog).not.toContainText('shop.example.com');
  await dialog.getByTestId(TID.dialogPrimary).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []))
    .toContain('https://example.com/menu');
  // A link the page never offered is refused by main.
  const direct = await page.evaluate(() => window.foo.invoke('app:openExternal', { target: 'ai_page', url: 'https://example.com/other' }));
  expect(direct.ok).toBe(false);

  // Secret text: refused, the composer stays empty, a Secret box posts in the chat.
  const secrets = await page.getByTestId(TID.cardSecret).count();
  expect((await call(f, 'draftMessage', { text: SECRET })).error?.data.reason).toBe('secret');
  await expect(page.getByTestId(TID.cardSecret)).toHaveCount(secrets + 1);
  await expect(page.getByTestId(TID.composerField)).not.toContainText('sk-proj');

  // draftMessage fills the composer and never sends.
  expect((await call(f, 'draftMessage', { text: 'Groceries 6000' })).result).toEqual({});
  await expect(page.getByTestId(TID.composerField)).toContainText('Groceries 6000');
  await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Groceries 6000' })).toHaveCount(0);
  // A page never replaces words already in the composer.
  expect((await call(f, 'draftMessage', { text: 'Rent 9000' })).result).toEqual({});
  await expect(page.getByTestId(TID.composerField)).toContainText('Groceries 6000');
  await expect(page.getByTestId(TID.composerField)).not.toContainText('Rent 9000');
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');

  // requestAction: sent as if typed, so foo's turn (and its gate) sees it like any message.
  expect((await tap(f, 'requestAction', { text: ACTION })).result).toEqual({});
  await page.getByTestId(TID.bubbleMe).filter({ hasText: ACTION }).waitFor();
  // One tap, one act: a second call on the same tap is declined and nothing more is sent. A pointerdown foo's window sees on
  // the page's own frame (a tap landing while the row moves) is still the page's tap, not one in foo.
  await page.getByTestId(TID.aiPageFrame).first().dispatchEvent('pointerdown');
  expect((await tap(f, 'requestAction', { text: 'Send it again' })).error?.data.reason).toBe('declined');
  await until(page.getByTestId(TID.bubbleFoo).filter({ hasText: 'I will save that budget once you say so.' }));
  expect(fakeTurns(dirs).some((x) => x.purpose === 'intake' && x.prompt.includes(ACTION))).toBe(true);
});

// Last: the page tries to leave, and the denied navigation leaves its frame on an error page.
test('AT-357 AI page sealed: a fetch, an image URL and a navigation inside the page fail; main logs the denied request', async () => {
  const f = await toolFrame();
  const denied = () => lines(/PAGE_REQUEST_DENIED/).length;
  const start = denied();
  const out = await f.evaluate(async () => {
    const fetched = await fetch('https://example.com/data.json').then(
      () => 'loaded',
      () => 'failed',
    );
    const img = await new Promise<string>((resolve) => {
      const i = new Image();
      i.onload = () => resolve('loaded');
      i.onerror = () => resolve('failed');
      i.src = 'https://example.com/pixel.png';
    });
    return { fetched, img };
  });
  expect(out).toEqual({ fetched: 'failed', img: 'failed' });
  await expect.poll(denied, { timeout: 10_000 }).toBeGreaterThanOrEqual(start + 2);
  const before = denied();
  await f.evaluate(() => {
    window.location.href = 'https://example.com/elsewhere';
  });
  await expect.poll(denied, { timeout: 10_000 }).toBeGreaterThan(before);
  expect(page.frames().some((x) => x.url().includes('example.com'))).toBe(false);
});

// After the tool tests: the new reply pushes the tool's bubble out of the message list's window.
test('AT-359 AI page caps: a page over 512 KB shows "This page is too big to open"', async () => {
  await send(BIG_PROMPT);
  const big = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'This one is too big.' }).getByTestId(TID.aiPage);
  await until(big);
  await expect(big).toHaveAttribute('data-state', 'failed');
  await expect(big.getByTestId(TID.aiPageStatus)).toHaveText(t('page.state.too_large'));
  await expect(big.getByTestId(TID.aiPageFrame)).toHaveCount(0);
});
