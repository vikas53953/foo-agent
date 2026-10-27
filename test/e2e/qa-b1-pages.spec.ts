// Spec: AT-450, CR-0060 (X-217, the batch-1 QA explore fixes); 06-1 §2.3 (Card 2b face keeps its colour), §4.2 (foo profile),
// 06-2 §6.0–§6.11 (every Settings page), 06-3 §19 (keyboard shortcuts sheet), 03-shell-1 §3.4 (chat-list preview), 04 §5
// (hover toolbar). The second bug-finder sweep on the batch-1 build: every page the app can open shows something, every item
// in the sidebar and chat menus does something, every listed shortcut does something, the hover buttons stay inside the
// chat, a picked face keeps its colour, and the chat list never shows an empty "Draft:". Each finding is listed by name.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finderRow } from './ai-step-world';
import { VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

const BATCH_1 = 'install,ai,name,chat,settings';
const LONG =
  'Here is a long answer that fills the bubble across the whole width of the chat pane, so the hover React and More ' +
  'buttons have to find room beside it. It keeps going for a while so it wraps onto several lines and reaches the edge.';
const TABLE =
  '| Train | Leaves | Arrives | Class | Fare | Seats left |\n|---|---|---|---|---|---|\n' +
  '| Shatabdi Express 12002 | 06:00 New Delhi | 14:05 Bhopal | Chair car | ₹1,255 | 42 available |\n' +
  '| Rajdhani Express 12430 | 20:50 New Delhi | 07:40 Lucknow | Third AC | ₹2,110 | 8 available |';
const say = (text: string): Omit<FakeLine, 'match'> => ({ chunks: [{ text: `<say>${text}</say>` }] });
const LINES: FakeLine[] = [
  VERIFY_OK,
  { match: { purpose: 'intake', promptIncludes: 'edited ask' }, ...say('Answer to the edit.') },
  { match: { purpose: 'intake', promptIncludes: 'table please' }, ...say(TABLE) },
  { match: { purpose: 'intake' }, ...say(LONG) },
];

const out = () => process.env.QA_EVIDENCE_DIR;
async function shot(page: Page, name: string) {
  const dir = out();
  if (!dir) return;
  mkdirSync(join(dir, 'shots'), { recursive: true });
  await page.screenshot({ path: join(dir, 'shots', `QA-B1-083-${name}.png`) });
}
const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);
const byTid = (id: string) => `[data-testid="${id}"]`;

/** What the user can see, read with no menu open: words, open dialogs, the view, pressed states and the clipboard. */
async function visible(app: ElectronApplication, page: Page): Promise<string> {
  const dom = await page.evaluate(() => {
    const states = Array.from(document.querySelectorAll('[data-state],[aria-pressed],[aria-checked],[data-page]'))
      .map(
        (e) =>
          `${e.getAttribute('data-testid') ?? ''}:${e.getAttribute('data-state') ?? ''}${e.getAttribute('aria-pressed') ?? ''}${e.getAttribute('aria-checked') ?? ''}${e.getAttribute('data-page') ?? ''}`,
      )
      .join('|');
    const open = document.querySelectorAll('[role=dialog],[role=alertdialog],[role=listbox],[popover]:popover-open').length;
    // Where the caret is counts too: Ctrl+Shift+F only moves it to the chat-list search.
    const focus = document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '';
    return `${document.body.innerText}\n${states}\n${open}\n${window.devicePixelRatio}\n${focus}`;
  });
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  return `${dom}\n${clip}`;
}

/**
 * `visible` once foo's face has stopped listening: it drops from "listening" 5 s after the last key (LISTEN_MS; to resting,
 * or to asleep in quiet hours), and that change is nobody's menu item.
 */
async function settled(app: ElectronApplication, page: Page): Promise<string> {
  await expect
    .poll(() => page.locator('[data-state="listening"]').count(), { timeout: 8_000 })
    .toBe(0)
    .catch(() => undefined);
  return visible(app, page);
}

/** Words on the open page other than its title and back button. */
const pageWords = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const root = document.querySelector(s) as HTMLElement | null;
    if (!root) return -1;
    const all = root.innerText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return all.length;
  }, sel);

async function backToChat(page: Page) {
  const away = async () =>
    !(await page.getByTestId(TID.composerField).isVisible()) ||
    (await page.locator('[role=dialog],[role=alertdialog],[role=menu]').count()) > 0;
  for (let i = 0; i < 4 && (await away()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

test('AT-450 QA-B1-083 · bug-finder sweep: every page shows something, every menu item and shortcut works, nothing leaves the chat', async () => {
  test.setTimeout(300_000);
  const findings: string[] = [];
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, LINES.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: script,
    FOO_TEST_FIRST_RUN: '1',
    FOO_TEST_AI_HOME: aiHome(['claude']),
    FOO_FEATURES: BATCH_1,
  });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));

  // 1. Setup the long way: a name, face 3, a talk style. The face keeps its tile's colour (F03).
  await page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  const use = page.getByTestId(TID.setupAiUse);
  if (await use.count()) await use.first().click();
  await page.getByTestId(TID.setupNameField).fill('Sunny');
  await page.getByTestId(TID.setupNameDone).click();
  const tile = page.locator(`${byTid(TID.setupFaceTile)}[data-index="3"]`);
  await tile.click();
  const tileColour = await tile
    .locator('span')
    .first()
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.getByTestId(TID.setupFaceUse).click();
  const vibe = page.locator(byTid(TID.cardChoice)).last();
  await vibe.getByTestId(TID.cardChoiceOption).nth(1).click();
  await expect(page.getByTestId(TID.composerField)).toBeEnabled({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const headerColour = await page.getByTestId(TID.chatHeaderAvatar).evaluate((e) => {
    const el = (e.querySelector('[style*="background"]') as HTMLElement | null) ?? (e as HTMLElement);
    return getComputedStyle(el).backgroundColor;
  });
  if (headerColour !== tileColour) findings.push(`face 3 lost its colour: the tile was ${tileColour}, the header shows ${headerColour}`);
  const bubbleFace = page.getByTestId(TID.thread).getByTestId(TID.bubbleSender).last();
  if (!(await bubbleFace.count())) findings.push("foo's bubbles show no face to check the colour on");
  else {
    const c = await bubbleFace.evaluate((e) => {
      const el = (e.querySelector('[style*="background"]') as HTMLElement | null) ?? (e.firstElementChild as HTMLElement);
      return getComputedStyle(el).backgroundColor;
    });
    if (c !== tileColour) findings.push(`face 3 lost its colour in the chat: the tile was ${tileColour}, foo's bubbles show ${c}`);
  }
  await shot(page, '1-setup');

  // 2. A wide reply (a table): its hover buttons stay inside the chat pane (F05).
  const sendAndWait = async (text: string, expectText: string) => {
    await page.getByTestId(TID.composerField).fill(text);
    await page.keyboard.press('Enter');
    const b = page.getByTestId(TID.thread).getByTestId(TID.bubbleFoo).filter({ hasText: expectText });
    await expect.poll(async () => (await advance(page, 500), b.count()), { timeout: 30_000 }).toBeGreaterThan(0);
    await advance(page, 2_000);
    return b.last();
  };
  for (const [ask, words] of [
    ['tell me a long thing', 'Here is a long answer'],
    ['table please', 'Shatabdi'],
  ] as const) {
    const foo = await sendAndWait(ask, words);
    await foo.hover();
    await page.waitForTimeout(300);
    const pane = await page.getByTestId(TID.thread).boundingBox();
    for (const id of [TID.bubbleToolbarReact, TID.bubbleToolbarMore]) {
      // The hovered bubble's own buttons (every bubble keeps its toolbar in the page, faded out).
      const b = await foo
        .locator('xpath=ancestor::*[@data-message-id][1]')
        .getByTestId(id)
        .first()
        .boundingBox()
        .catch(() => null);
      if (!b) findings.push(`${id} does not show when the reply "${words}" is hovered`);
      else if (pane && (b.x < pane.x || b.x + b.width > pane.x + pane.width + 0.5))
        findings.push(
          `${id} is drawn outside the chat pane on "${words}" (x ${Math.round(b.x)}–${Math.round(b.x + b.width)}, pane ends ${Math.round(pane.x + pane.width)})`,
        );
    }
    await shot(page, `2-hover-${ask.split(' ')[0]}`);
    await page.mouse.move(0, 0);
  }

  // 2b. Editing your last message tells foo, and its answer under it changes (F20, 04 §6.2).
  const mine = page.getByTestId(TID.thread).getByTestId(TID.bubbleMe).last();
  const fooBubbles = page.getByTestId(TID.thread).getByTestId(TID.bubbleFoo);
  const fooBefore = await fooBubbles.count();
  await mine.hover();
  await page.waitForTimeout(250);
  await mine.locator('xpath=ancestor::*[@data-message-id][1]').getByTestId(TID.bubbleToolbarMore).click();
  await page.getByTestId(TID.bubbleMenuEdit).click();
  await page.getByTestId(TID.composerField).fill('edited ask');
  await page.keyboard.press('Enter');
  const edited = page.getByTestId(TID.thread).getByTestId(TID.bubbleFoo).filter({ hasText: 'Answer to the edit.' });
  for (let i = 0; i < 20 && !(await edited.count()); i++) await advance(page, 500);
  if (!(await edited.count())) findings.push("edit: foo never hears the edited message (its answer under it didn't change)");
  else if ((await fooBubbles.count()) !== fooBefore)
    findings.push('edit: foo posted a second answer instead of writing the one under the edited message again');
  await advance(page, 2_000);
  await page.mouse.move(0, 0);

  // 3. Leaving the chat with an empty message box never leaves "Draft:" with nothing after it (F08).
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.screenSettings).waitFor();
  await page.waitForTimeout(800);
  const previews = await page.getByTestId(TID.chatlistRowPreview).allInnerTexts();
  for (const p of previews)
    if (p.trim().startsWith(t('chatlist.row.preview.draft')) && p.trim().length <= t('chatlist.row.preview.draft').length + 1)
      findings.push(`the chat list shows an empty draft ("${p.trim()}")`);

  // 4. Every Settings page in the nav shows more than its title (F07).
  const nav = page.locator(`${byTid(TID.screenSettings)} nav button`);
  for (let i = 0; i < (await nav.count()); i++) {
    const item = nav.nth(i);
    const id = (await item.getAttribute('data-testid')) ?? `nav ${i}`;
    await item.click();
    await page.waitForTimeout(300);
    const words = await pageWords(page, `${byTid(TID.screenSettings)} main`);
    if (words <= 1) findings.push(`empty Settings page: ${id} shows only its title`);
    await shot(page, `4-${id}`);
  }
  await backToChat(page);

  // 5. foo's profile, from the header face, shows foo and lets you change the name, face and talk style (F06, F13).
  await page.getByTestId(TID.chatHeaderAvatar).click();
  await page.waitForTimeout(500);
  const profileWords = await pageWords(page, byTid(TID.screenFooProfile));
  if (profileWords <= 0) findings.push('open profile: the page is blank');
  else {
    const text = await page.getByTestId(TID.screenFooProfile).innerText();
    if (!text.includes('Sunny')) findings.push("open profile: foo's name is not on its profile");
    if (!(await page.getByTestId(TID.profileRowName).count())) findings.push('open profile: no way to change the name');
    if (!(await page.getByTestId(TID.profileRowFace).count())) findings.push('open profile: no way to change the face');
    if (!(await page.getByTestId(TID.profileRowVibe).count())) findings.push('open profile: no way to change how foo talks');
    else {
      // Each change lands where the user looks: the name in the chat list, the talk style picked.
      await page.getByTestId(TID.profileRowName).locator('input').fill('Raju');
      await page
        .getByTestId(TID.profileRowName)
        .getByRole('button', { name: t('profile.foo.save') })
        .click();
      await page.waitForTimeout(500);
      const list = (await page.getByTestId(TID.chatlistRowName).allInnerTexts()).join(' ');
      if (!list.includes('Raju')) findings.push(`profile: the new name does not reach the chat list ("${list}")`);
      await page.getByTestId(TID.profileRowVibe).getByText(t('setup.vibe.option.warm')).click();
      await page.waitForTimeout(400);
      if (
        !(await page
          .getByTestId(TID.profileRowVibe)
          .getByRole('radio', { name: t('setup.vibe.option.warm') })
          .isChecked())
      )
        findings.push('profile: picking "Warm and chatty" does not stick');
    }
  }
  await shot(page, '5-profile');
  await backToChat(page);

  // 6. Every item in the sidebar ⋯ menu and the chat ⋯ menu does something the user can see.
  for (const [where, button] of [
    ['sidebar', TID.sidebarMore],
    ['chat', TID.chatHeaderMore],
  ] as const) {
    await page.getByTestId(button).click();
    const items = await page
      .locator('[role=menuitem]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? e.textContent ?? ''));
    await page.keyboard.press('Escape');
    for (const id of items) {
      if (id === TID.sidebarMenuQuit) continue; // quitting ends the run
      await backToChat(page);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      const before = await settled(app, page);
      await page.getByTestId(button).click();
      await page.getByTestId(id).click();
      await page.waitForTimeout(600);
      // A sub-menu counts as doing something only when its parent's items stay visible (F09).
      const sub = await page.locator('[role=menu]').count();
      if (sub > 1) {
        const covered = await page.evaluate(() => {
          const menus = Array.from(document.querySelectorAll('[role=menu]')).map((m) => m.getBoundingClientRect());
          const [a, b] = [menus[0]!, menus[menus.length - 1]!];
          return a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
        });
        if (covered) findings.push(`${where} menu: ${id} opens its sub-menu on top of the menu`);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        continue;
      }
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      if ((await visible(app, page)) === before) findings.push(`dead ${where} menu item: ${id} changed nothing on screen`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  }
  await backToChat(page);

  // 7. Ctrl+/ shows the shortcuts, and every shortcut it lists that opens something does (F15).
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(400);
  const keys: string[] = [];
  const sheet = page.getByTestId(TID.dialogShortcuts);
  if (!(await sheet.count())) findings.push('Ctrl+/ shows no keyboard shortcuts');
  else {
    const rows = await sheet.getByTestId(TID.dialogShortcutsRow).count();
    if (!rows) findings.push('the keyboard shortcuts sheet lists nothing');
    // Every key the sheet lists that can be pressed alone (the row's `data-press`).
    for (const k of await sheet
      .locator(`${byTid(TID.dialogShortcutsRow)}[data-press]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-press') ?? '')))
      if (k) keys.push(k);
    if (!keys.length) findings.push('the keyboard shortcuts sheet lists no key that can be pressed');
    await shot(page, '7-shortcuts');
  }
  await backToChat(page);
  for (const key of keys) {
    await backToChat(page);
    await page.mouse.move(0, 0);
    // Pressed from the message box, where the user's hands are (a field must not swallow a listed shortcut).
    await page.getByTestId(TID.composerField).click();
    const before = await settled(app, page);
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    if ((await visible(app, page)) === before) findings.push(`shortcut ${key} does nothing`);
    if (key === 'Control+=') await page.keyboard.press('Control+0');
    if (key === 'Control+Shift+u') await page.keyboard.press('Control+Shift+u');
  }
  await backToChat(page);

  // 8. Clear messages… → [ Clear messages ] empties the chat (06-3 C-1); the chat stays in the list.
  await page.getByTestId(TID.chatHeaderMore).click();
  await page.getByTestId(TID.chatHeaderMenuClear).click();
  const c01 = page.getByTestId(TID.dialogC01);
  if (!(await c01.count())) findings.push('Clear messages… opens no confirm');
  else {
    await c01.getByTestId(TID.dialogPrimary).click();
    await page.waitForTimeout(800);
    const left = await page
      .getByTestId(TID.thread)
      .locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleMe)}`)
      .count();
    if (left) findings.push(`Clear messages left ${left} message(s) in the chat`);
    if (!(await page.getByTestId(TID.chatlistRow).count())) findings.push('Clear messages removed the chat from the list');
    await shot(page, '8-cleared');
  }

  const unique = [...new Set(findings)];
  if (out()) writeFileSync(join(out()!, 'QA-B1-083-findings.json'), JSON.stringify(unique, null, 2));
  expect(unique, `bug-finder sweep findings:\n${unique.join('\n')}`).toEqual([]);
  await app.close();
});
