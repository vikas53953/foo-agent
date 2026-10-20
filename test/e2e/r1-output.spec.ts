// Spec: 10-acceptance-2 §C.9 AT-352 (LiveStamp: "Data as of {time}" shows; Refresh sends `kit:refresh`), AT-366 (Visuals =
// Mostly words: the same question answers without kit pieces or AI pages unless the user asks for one), AT-367 (reply chips
// fill the composer; ≤ 3 action chips act through the gates; none after an approval or payment card), AT-368 (Refresh
// updates the surface's data model and "Data as of"), AT-369 (Keep saves a `kept_items` row listed in the chat's Files tab;
// a kept AI page reopens only in the sealed box; no `.html` file is written); 04 §13.5, 04-2 §21.7, 06-2 §6.2, CR-0022
// picks 8, 9, 15, X-180. R1 T7: the real app on the fake AI (08-3 §22.3); sample data only (example.com, fake numbers).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { ist } from '../../src/main/test/seed/writer';
import { openChat, openWorld } from '../fidelity/capture';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import type { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';
import { say } from './m9-booking-world';

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
const chart = (asOf: number) =>
  comps([
    { id: 'root', component: 'Column', children: ['chart', 'live'] },
    { id: 'chart', component: 'LineChart', variant: 'line', title: 'Goa fares', unit: 'rupees', series: { path: '/fares' } },
    stamp(asOf),
  ]);
const CHART_REPLY = `Goa fares this week.\n\n${a2ui(create, chart(AS_OF), data('/fares', series([4200, 3900, 4700, 4100, 3800])))}`;
const REFRESHED = `Fares again.\n\n${a2ui(comps([stamp(AS_OF_LATER)]), data('/fares', series([3100, 3000, 2900, 2800, 2700])))}`;
const PAGE = '<!doctype html><html><head><title>Food budget</title></head><body><h1>Food budget</h1><p>Rice ₹400</p></body></html>';

let app: ElectronApplication;
let page: Page;
let dirs: ReturnType<typeof testDirs>;

test.afterEach(async () => app?.close());

const advance = (ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(HOLD_MS + 100);
    await page.waitForTimeout(300);
  }
  await expect(loc.first()).toBeVisible();
}

async function start(lines: FakeLine[]) {
  const r = await launchWithFakeAi([VERIFY_OK, ...lines]);
  app = r.app;
  dirs = r.dirs;
  page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
}

const fooBubble = (words: string) => page.getByTestId(TID.bubbleFoo).filter({ hasText: words });

async function setVisuals(label: string) {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'appearance' } }),
  );
  const row = page.getByTestId(TID.settingsRowAppearanceVisuals);
  await row.getByRole('radio', { name: label }).click();
  await expect(row.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
  await openChat(page, 'foo');
}

test('AT-366 · Visuals = Mostly words: the same question answers without kit pieces or AI pages unless the user asks for one', async () => {
  const WORDS = 'Goa fares this week run from ₹3,800 to ₹4,700.';
  // The fake answers by script, so it answers the first ask in words and the second with a chart; what the app owns is the
  // level it sends: Mostly words tells the AI not to draw unless asked, and leaves the catalog out.
  await start([intake('how are goa fares', WORDS), intake('how are goa fares', CHART_REPLY)]);
  await setVisuals(t('settings.appearance.visuals.words'));
  await say(page, 'how are goa fares');
  await showUp(fooBubble(WORDS));
  await expect(fooBubble(WORDS).getByTestId(TID.kitSurface)).toHaveCount(0);
  const wordsTurn = system(fakeTurns(dirs).filter((x) => x.purpose === 'intake').at(-1)!);
  expect(wordsTurn).toContain('The user chose "Mostly words"');
  expect(wordsTurn).toContain('Do not write ```a2ui or ```page blocks unless the user asks');
  expect(wordsTurn).not.toContain('Components:');

  // Balanced (the default) → the same question may draw the chart, and the catalog is in the prompt again.
  await setVisuals(t('settings.appearance.visuals.balanced'));
  await say(page, 'how are goa fares');
  await showUp(fooBubble('Goa fares this week.').getByTestId(TID.kitLineChart));
  const balanced = system(fakeTurns(dirs).filter((x) => x.purpose === 'intake').at(-1)!);
  expect(balanced).toContain('Components:');
  expect(balanced).not.toContain('The user chose "Mostly words"');
});

/** The system prompt the fake recorded beside the prompt (08-3 §22.3 turns.jsonl). */
const system = (turn: object) => String((turn as { system?: unknown }).system ?? '');


test('AT-352 · LiveStamp shows "Data as of {time}" and Refresh sends kit:refresh', async () => {
  await start([intake('show goa fares', CHART_REPLY), intake('I tapped Refresh on your s1 surface', REFRESHED)]);
  await say(page, 'show goa fares');
  const bubble = fooBubble('Goa fares this week.');
  const live = bubble.getByTestId(TID.kitLiveStamp);
  await showUp(live);
  // 02 F19.3: "6:00 PM" in the user's zone (the seeded world is Asia/Kolkata).
  await expect(live).toContainText('Data as of 6:00 PM');
  await live.getByTestId(TID.kitLiveRefresh).click();
  // The tap reaches the engine as kit.refresh: the AI is asked again for this surface.
  await expect.poll(() => fakeTurns(dirs).some((x) => x.prompt.includes('I tapped Refresh on your s1 surface'))).toBe(true);
});

test('AT-368 · Refresh updates the surface data model and "Data as of"', async () => {
  await start([intake('show goa fares', CHART_REPLY), intake('I tapped Refresh on your s1 surface', REFRESHED)]);
  await say(page, 'show goa fares');
  const bubble = fooBubble('Goa fares this week.');
  const live = bubble.getByTestId(TID.kitLiveStamp);
  await showUp(live);
  const before = await bubble.getByTestId(TID.kitLineChart).innerHTML();
  await live.getByTestId(TID.kitLiveRefresh).click();
  await showUp(fooBubble('Fares again.'));
  // The first surface redraws from the later reply (AT-355 rule): new asOf, new points.
  await expect(live).toHaveAttribute('data-as-of', String(AS_OF_LATER));
  await expect(live).toContainText('Data as of 6:25 PM');
  await expect.poll(() => bubble.getByTestId(TID.kitLineChart).innerHTML()).not.toBe(before);
});

test('AT-367 · reply chips fill the composer; up to 3 action chips act through the gates; none after an approval card', async () => {
  const actions = JSON.stringify([
    { kind: 'call', label: 'Call Toit', value: '+91 80 0000 0000' },
    { kind: 'link', label: 'See the menu', value: 'https://example.com/menu' },
    { kind: 'calendar', label: 'Add dinner to calendar', value: '2026-10-23T19:00' },
    { kind: 'map', label: 'Open map', value: 'Toit, Indiranagar' },
  ]);
  const reply = `Toit has a table for 4 on Fri at 7 PM.\nActions: ${actions}\nSuggestions: Book it | Other places`;
  await start([intake('table for 4 at toit', reply), intake('Add dinner to calendar', 'I’ll ask you before adding it.')]);
  await say(page, 'table for 4 at toit');
  await showUp(fooBubble('Toit has a table for 4'));
  await expect(fooBubble('Toit has a table for 4')).not.toContainText('Actions:');
  const row = page.getByTestId(TID.bubbleActionChips);
  await expect(row.getByTestId(TID.bubbleActionChip)).toHaveCount(3);
  await expect(row.getByTestId(TID.bubbleActionChip)).toHaveText(['Call Toit', 'See the menu', 'Add dinner to calendar']);
  // Action chips are accent; reply chips stay grey and only fill the field.
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const colour = await row
    .getByTestId(TID.bubbleActionChip)
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(colour).toBe(
    await page.evaluate((hex) => {
      const el = document.createElement('i');
      el.style.color = hex;
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    }, accent),
  );
  await page.getByTestId(TID.composerSuggestionChip).filter({ hasText: 'Book it' }).click();
  await expect(page.getByTestId(TID.composerField)).toHaveText('Book it');
  await page.getByTestId(TID.composerField).press('Control+a');
  await page.getByTestId(TID.composerField).press('Delete');

  // A link opens only after C-26, and main opens the stored chip's own URL.
  await row.getByTestId(TID.bubbleActionChip).filter({ hasText: 'See the menu' }).click();
  const dialog = page.getByTestId(TID.aiPageOpenLink);
  await expect(dialog).toContainText(t('page.open_link.title', { domain: 'example.com' }));
  await dialog.getByTestId(TID.dialogPrimary).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []))
    .toContain('https://example.com/menu');

  // A calendar chip adds something for the user: it is sent to foo as the user's words (the gate decides), never done here.
  await row.getByTestId(TID.bubbleActionChip).filter({ hasText: 'Add dinner to calendar' }).click();
  await showUp(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Add dinner to calendar, Fri 23 Oct, 7:00 PM' }));

  // After an approval card the row is gone.
  const fields = { verb: 'book', payee: 'Toit', siteDomain: 'example.com', partySize: 4, amountPaise: 0, irreversible: false };
  const req: CardSeedRequest = {
    type: 'approval',
    state: 'PENDING',
    payload: {
      variant: 'standard',
      approvalId: '',
      verb: 'book',
      title: 'Book this table?',
      impact: 'Toit, Indiranagar · Fri 23 Oct, 7:00 PM · 4 people',
      fields,
      scopes: ['once'],
      hardLimit: true,
      expiresAt: AS_OF + 3_600_000,
    },
    approval: { fields: fields as never, hardLimit: true, expiresAt: AS_OF + 3_600_000 },
  };
  await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
  await expect(page.getByTestId(TID.bubbleActionChips)).toHaveCount(0);
});

test('AT-369 · Keep saves a kept_items row listed in the chat Files tab; a kept page reopens only in the sealed box; no .html file is written', async () => {
  const pageReply = `Here is your planner.\n\n\`\`\`page\n${PAGE}\n\`\`\``;
  await start([intake('show goa fares', CHART_REPLY), intake('food budget tool', pageReply)]);
  await say(page, 'show goa fares');
  const chartBubble = fooBubble('Goa fares this week.');
  await showUp(chartBubble.getByTestId(TID.kitLineChart));
  await chartBubble.getByTestId(TID.kitKeep).click();
  await expect(chartBubble.getByTestId(TID.kitKeep)).toHaveText(t('kit.keep.done'));

  await say(page, 'food budget tool');
  const pageBubble = fooBubble('Here is your planner.');
  await showUp(pageBubble.getByTestId(TID.aiPageFrame));
  await pageBubble.getByTestId(TID.kitKeep).click();
  await expect(pageBubble.getByTestId(TID.kitKeep)).toHaveText(t('kit.keep.done'));

  // The chat's kept list, newest first.
  // The chat's details panel opens on its own on a wide window; otherwise its toggle opens it.
  if ((await page.getByTestId(TID.appPanel).count()) === 0) await page.getByTestId(TID.chatHeaderPanel).click();
  const rows = page.getByTestId(TID.filesKeptItem);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Food budget');
  await expect(rows.nth(1)).toContainText('Goa fares');

  // Files under {DATA}\kept: the A2UI JSON, the .foopage blob and the PNG snapshots; never .html.
  const kept = readdirSync(join(dirs.FOO_DATA_DIR, 'kept'));
  expect(kept.filter((f) => f.endsWith('.json'))).toHaveLength(1);
  expect(kept.filter((f) => f.endsWith('.foopage'))).toHaveLength(1);
  expect(kept.filter((f) => f.endsWith('.png'))).toHaveLength(2);
  expect(kept.filter((f) => /\.html?$/i.test(f))).toEqual([]);

  // Open: the kept page is served in the sealed box again (foo-page://, sandbox scripts only).
  await rows.nth(0).locator('[data-action="open"]').click();
  const view = page.getByTestId(TID.dialogKeptItem);
  const frame = view.getByTestId(TID.aiPageFrame);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frame).toHaveAttribute('src', /^foo-page:\/\/pg_/);
  await expect(view.getByTestId(TID.aiPage)).toHaveAttribute('data-state', 'kept');
  await view.getByTestId(TID.dialogSecondary).click();

  // The kept surface reopens in foo's own renderer.
  await rows.nth(1).locator('[data-action="open"]').click();
  await expect(page.getByTestId(TID.dialogKeptItem).getByTestId(TID.kitLineChart)).toBeVisible();
  await page.getByTestId(TID.dialogKeptItem).getByTestId(TID.dialogPrimary).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as { __fooShownInFolder?: string[] }).__fooShownInFolder ?? []))
    .toEqual([expect.stringMatching(/kept[\\/]ki_[^\\/]+\.json$/)]);
});
