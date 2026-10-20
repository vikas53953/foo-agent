// Spec: 04 §13.6 (an AI page in the sealed box: status line first, then the frame from `foo-page://{pageId}`; no network;
// openLink always the C-26 dialog; requestAction goes to foo as if the user typed it), CR-0022 AT-357..AT-362, X-180.
// foo-verify journey for R1 T5, real app on the seeded world with the fake AI: (1) "make me a tool to plan next month's
// food budget" shows "Building your page…" and then the page; (2) its "Check prices online" button tries a fetch, which
// fails inside the box; (3) "Open the menu" shows the C-26 question; (4) "Save budget" sends foo the line and foo answers.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t5-page.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { intake, type FakeTurn } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const ASK = "make me a tool to plan next month's food budget";
const SAY = 'Here is a small food budget planner.';
const SAVE = 'Save my food budget of Rs 12,000 for November';
const ANSWER = 'I will save that budget once you say so.';

const TOOL = [
  '<!doctype html><html><head><style>',
  'body{font-family:sans-serif;margin:12px;color:#222}button{margin:4px 8px 4px 0;padding:6px 10px}',
  'td{padding:2px 12px 2px 0}#out{color:#555}',
  '</style></head><body>',
  '<h2>November food budget</h2>',
  '<table><tr><td>Groceries</td><td>Rs 6,000</td></tr><tr><td>Vegetables</td><td>Rs 2,500</td></tr>',
  '<tr><td>Eating out</td><td>Rs 3,500</td></tr><tr><td><b>Total</b></td><td><b>Rs 12,000</b></td></tr></table>',
  '<p><button id="check">Check prices online</button><button id="menu">Open the menu</button><button id="save">Save budget</button></p>',
  '<p id="out">Ready.</p>',
  '<script>',
  'var n = 0;',
  'function fooCall(method, params) { parent.postMessage({ jsonrpc: "2.0", id: ++n, method: method, params: params }, "*"); }',
  'document.getElementById("check").onclick = function () {',
  '  fetch("https://example.com/prices.txt").then(function () { out.textContent = "Fetched prices"; },',
  '    function () { out.textContent = "Could not reach the internet from this page"; });',
  '};',
  'document.getElementById("menu").onclick = function () { fooCall("openLink", { url: "https://example.com/menu" }); };',
  `document.getElementById("save").onclick = function () { fooCall("requestAction", { text: "${SAVE}" }); };`,
  'var out = document.getElementById("out");',
  'fooCall("reportSize", { height: document.body.scrollHeight + 24 });',
  '</script></body></html>',
].join('\n');

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, 1_600);
    await page.waitForTimeout(400);
  }
  await loc.first().waitFor({ state: 'attached' });
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      {
        match: { purpose: 'intake', promptIncludes: 'food budget' },
        chunks: [
          { text: `<say>${SAY}\n\n\`\`\`page\n\n` },
          {
            text: `${TOOL}\n\`\`\`</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`,
            delayMs: 30_000,
          },
        ],
      },
      intake('Save my food budget', ANSWER),
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await settle(page);

  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: SAY });
  const block = bubble.getByTestId(TID.aiPage);
  await showUp(page, block);
  const state = await block.getAttribute('data-state');
  const status = (await block.getByTestId(TID.aiPageStatus).textContent())?.trim();
  if (state !== 'building' || status !== t('page.state.building')) throw new Error(`first view was ${state} "${status}"`);
  v.note(`first view: state ${state}, status line "${status}", frames ${await block.getByTestId(TID.aiPageFrame).count()}`);
  await settle(page);
  await v.shot('building');

  for (let i = 0; i < 40 && (await block.getAttribute('data-state')) !== 'ready'; i++) {
    await advance(page, 1_600);
    await page.waitForTimeout(300);
  }
  const frameEl = block.getByTestId(TID.aiPageFrame);
  await frameEl.waitFor();
  v.note(
    `ready: state ${await block.getAttribute('data-state')}, sandbox="${await frameEl.getAttribute('sandbox')}", src ${(await frameEl.getAttribute('src'))?.replace(/pg_[0-9a-f-]+/, 'pg_…')}`,
  );
  const tool = page.frameLocator(`[data-testid="${TID.aiPageFrame}"]`);
  await tool.locator('#save').waitFor();
  await page.waitForTimeout(500);
  v.note(`frame height ${Math.round((await frameEl.boundingBox())!.height)}px (cap 600)`);
  await bubble.scrollIntoViewIfNeeded();
  await v.shot('page-ready');
  await setTheme(page, 'dark');
  await v.shot('page-ready');
  await setTheme(page, 'light');

  // A fetch from inside the box fails; main logs the denied load.
  await tool.locator('#check').click();
  const out = tool.locator('#out');
  for (let i = 0; i < 20 && (await out.textContent()) === 'Ready.'; i++) await page.waitForTimeout(200);
  const fetched = await out.textContent();
  if (fetched !== 'Could not reach the internet from this page') throw new Error(`fetch inside the page: ${fetched}`);
  v.note(`"Check prices online" inside the page: "${fetched}"`);

  // openLink: the C-26 question first; Cancel opens nothing.
  await tool.locator('#menu').click();
  const dialog = page.getByTestId(TID.aiPageOpenLink);
  await dialog.waitFor();
  v.note(`"Open the menu": dialog "${(await dialog.getByRole('heading').first().textContent())?.trim()}"`);
  await v.shot('open-link');
  await dialog.getByTestId(TID.dialogSecondary).click();
  const opened = await app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []);
  v.note(`after Cancel, links opened: ${opened.length}`);

  // requestAction: foo gets the line as if typed and answers through its normal turn.
  await tool.locator('#save').click();
  await page.getByTestId(TID.bubbleMe).filter({ hasText: SAVE }).waitFor();
  const answer = page.getByTestId(TID.bubbleFoo).filter({ hasText: ANSWER });
  await showUp(page, answer);
  const turns = (v.fakeTurns() as FakeTurn[]).filter((x) => x.purpose === 'intake' && x.prompt.includes(SAVE));
  if (!turns.length) throw new Error('foo was never asked about the budget');
  v.note(`"Save budget": your bubble "${SAVE}", foo's turn saw it (${turns.length} intake), foo answered "${ANSWER}"`);
  await settle(page);
  await v.shot('after-save');
}
