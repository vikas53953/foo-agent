// Spec: 06-2 §6.2 (Appearance → Visuals), 04 §13.5 (LiveStamp, Refresh → `kit:refresh`), 04-2 §21.7 (≤ 3 action chips,
// through the gates), CR-0022 picks 9, 15 and 16-18 (Keep, the Kept list, kept pages only in the sealed box), AT-352,
// AT-366, AT-367, AT-368, AT-369, X-180.
// foo-verify journey for R1 T7, real app on the seeded world with the fake AI: (1) the Visuals row in Appearance; (2) a
// Goa fares chart "Data as of 6:00 PM", Refresh, "6:25 PM"; (3) three action chips under a table reply, the link chip
// through C-26; (4) Keep the chart and a page, the Kept list, the kept page reopened in its sealed box. Light and dark.
// Sample data only (example.com, fake numbers).
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t7-output.journey.ts
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { ist } from '../../src/main/test/seed/writer';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const AS_OF = ist(2026, 10, 20, 18, 0);
const AS_OF_LATER = ist(2026, 10, 20, 18, 25);
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = (components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: 's1', components } });
const data = (path: string, value: unknown) => JSON.stringify({ updateDataModel: { surfaceId: 's1', path, value } });
const a2ui = (...lines: string[]) => `\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const series = (ys: number[]) => [{ label: 'Goa fares', points: ys.map((y, i) => ({ x: days[i]!, y })) }];
const stamp = (asOf: number) => ({ id: 'live', component: 'LiveStamp', asOf, refreshable: true });
const CHART = `Goa fares this week.\n\n${a2ui(
  create,
  comps([
    { id: 'root', component: 'Column', children: ['chart', 'live'] },
    { id: 'chart', component: 'LineChart', variant: 'line', title: 'Goa fares', unit: 'rupees', series: { path: '/fares' } },
    stamp(AS_OF),
  ]),
  data('/fares', series([4200, 3900, 4700, 4100, 3800])),
)}`;
const REFRESHED = `Fares again.\n\n${a2ui(comps([stamp(AS_OF_LATER)]), data('/fares', series([3100, 3000, 2900, 2800, 2700])))}`;
const ACTIONS = JSON.stringify([
  { kind: 'call', label: 'Call the restaurant', value: '+91 80 0000 0000' },
  { kind: 'link', label: 'See the menu', value: 'https://example.com/menu' },
  { kind: 'calendar', label: 'Add dinner to calendar', value: '2026-10-23T19:00' },
]);
const TABLE = `Example Bistro has a table for 4 on Fri at 7 PM.\nActions: ${ACTIONS}\nSuggestions: Book it | Other places`;
const PAGE = `Here is your planner.\n\n\`\`\`page\n<!doctype html><html><head><title>Food budget</title></head><body><h1>Food budget</h1><p>Rice ₹400</p><p>Vegetables ₹650</p></body></html>\n\`\`\``;

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(400);
  }
  await loc.first().waitFor();
}

async function send(page: Page, text: string) {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.bubbleMe).filter({ hasText: text }).waitFor();
}

const fooBubble = (page: Page, words: string) => page.getByTestId(TID.bubbleFoo).filter({ hasText: words });

async function shots(v: Verify, page: Page, name: string, selector?: string) {
  await setTheme(page, 'light');
  await settle(page);
  await v.shot(name, selector);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot(`${name}-dark`, selector);
  await setTheme(page, 'light');
}

const log = `[data-testid="${TID.threadLog}"]`;

async function openAppearance(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'appearance' } }),
  );
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      intake('goa fares', CHART),
      intake('I tapped Refresh on your s1 surface', REFRESHED),
      intake('table for 4', TABLE),
      intake('food budget', PAGE),
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');

  // 1. Appearance → Visuals: three choices, Balanced by default.
  await openAppearance(app);
  const visuals = page.getByTestId(TID.settingsRowAppearanceVisuals);
  await visuals.waitFor();
  const checked = await visuals.locator('[role="radio"][aria-checked="true"]').textContent();
  if (checked !== t('settings.appearance.visuals.balanced')) throw new Error(`Visuals default is ${checked}`);
  v.note(`Visuals row: ${JSON.stringify(await visuals.getByRole('radio').allTextContents())}, default "${checked}"`);
  await shots(v, page, 'visuals-setting');

  // 2. LiveStamp: "Data as of 6:00 PM", Refresh, then "6:25 PM" with the new fares.
  await openChat(page, 'foo');
  await send(page, 'show goa fares');
  const chart = fooBubble(page, 'Goa fares this week.');
  const live = chart.getByTestId(TID.kitLiveStamp);
  await showUp(page, live);
  const before = await live.textContent();
  await chart.scrollIntoViewIfNeeded();
  await shots(v, page, 'live-stamp', log);
  await chart.getByTestId(TID.kitLiveRefresh).click();
  await showUp(page, fooBubble(page, 'Fares again.'));
  for (let i = 0; i < 20 && (await live.getAttribute('data-as-of')) !== String(AS_OF_LATER); i++) await page.waitForTimeout(250);
  const after = await live.textContent();
  if (after === before || !after?.includes('6:25')) throw new Error(`Refresh left "${after}" (was "${before}")`);
  v.note(`LiveStamp: "${before}" → Refresh → "${after}"`);
  await shots(v, page, 'live-refreshed', log);

  // 3. Action chips: three accent chips beside the reply chips; a link opens only through the C-26 dialog.
  await send(page, 'table for 4 tomorrow');
  await showUp(page, fooBubble(page, 'Example Bistro has a table'));
  const chips = page.getByTestId(TID.bubbleActionChips).getByTestId(TID.bubbleActionChip);
  await chips.first().waitFor();
  const labels = await chips.allTextContents();
  if (labels.length !== 3) throw new Error(`expected 3 action chips, saw ${labels.length}`);
  if ((await fooBubble(page, 'Example Bistro').textContent())?.includes('Actions:')) throw new Error('the Actions line leaked');
  v.note(`action chips: ${JSON.stringify(labels)}; the "Actions:" line stays out of the bubble`);
  await shots(v, page, 'action-chips');
  await chips.filter({ hasText: 'See the menu' }).click();
  const dialog = page.getByTestId(TID.aiPageOpenLink);
  await dialog.waitFor();
  v.note(`link chip asks first: "${await dialog.getByRole('heading').first().textContent()}"`);
  await shots(v, page, 'action-link-dialog');
  await dialog.getByTestId(TID.dialogPrimary).click();
  const opened = await app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []);
  if (!opened.includes('https://example.com/menu')) throw new Error(`opened ${JSON.stringify(opened)}`);
  v.note(`after Open, main opened ${JSON.stringify(opened)} (the stored chip's URL)`);

  // 4. Keep the chart and a page; both list under Kept; the kept page reopens in the sealed box.
  await chart.scrollIntoViewIfNeeded();
  await chart.getByTestId(TID.kitKeep).click();
  await chart
    .getByTestId(TID.kitKeep)
    .filter({ hasText: t('kit.keep.done') })
    .waitFor();
  await send(page, 'food budget tool');
  const planner = fooBubble(page, 'Here is your planner.');
  await showUp(page, planner.getByTestId(TID.aiPageFrame));
  await planner.getByTestId(TID.kitKeep).click();
  await planner
    .getByTestId(TID.kitKeep)
    .filter({ hasText: t('kit.keep.done') })
    .waitFor();
  await shots(v, page, 'kept-buttons', log);
  if ((await page.getByTestId(TID.appPanel).count()) === 0) await page.getByTestId(TID.chatHeaderPanel).click();
  const rows = page.getByTestId(TID.filesKeptItem);
  await rows.nth(1).waitFor();
  const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  v.note(`Kept list, newest first: kinds ${JSON.stringify(kinds)}, rows ${JSON.stringify(await rows.allTextContents())}`);
  await rows.first().scrollIntoViewIfNeeded();
  await shots(v, page, 'kept-list');
  await rows.nth(0).locator('[data-action="open"]').click();
  const frame = page.getByTestId(TID.dialogKeptItem).getByTestId(TID.aiPageFrame);
  await frame.waitFor();
  const src = await frame.getAttribute('src');
  const sandbox = await frame.getAttribute('sandbox');
  if (!src?.startsWith('foo-page://') || sandbox !== 'allow-scripts') throw new Error(`kept page opened as ${src} ${sandbox}`);
  v.note(`kept page reopens in the sealed box: src ${src?.replace(/pg_[^/]+/, 'pg_…')}, sandbox "${sandbox}"`);
  await page.waitForTimeout(500);
  await shots(v, page, 'kept-page-open');
}
