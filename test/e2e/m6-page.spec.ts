// Spec: 10-acceptance-1 §B AT-072 (every fact shows "You said" / "I guessed" with its reason, and a date), AT-073 (the C-3
// path from the Memory ⋯ menu: count in the title, "{app} stays connected"), 06-2 §7.3–§7.5 (rows, filters, search
// "no match" + Clear filters), 06-3 §14 C-3 / C-4 (typed FORGET gate), 03-2 §3.7.3.3 ("See all" and Ctrl+M open the page).
// Seeded ux-world facts and memory:list; the mutating confirms are checked up to the dialog and Cancel until T3 lands.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openPanelChat, startWorld } from './m4-start';

const SOURCE = /^(You said|I guessed · .+) · \d{1,2} [A-Z][a-z]{2}$/;

async function openFromMenu(page: Page): Promise<void> {
  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await expect(page.getByTestId(TID.screenMemory)).toHaveAttribute('data-state', 'list');
}

test('AT-072: every Memory row and right-shell tile shows You said / I guessed with a reason and a date', async () => {
  const { app, page } = await startWorld();
  // the right shell's "What I know" tiles
  await openPanelChat(page, 'foo');
  const tiles = page.getByTestId(TID.appPanelKnowFact);
  await expect(tiles.first()).toBeVisible();
  for (const tile of await tiles.all()) await expect(tile).toContainText(/You said|I guessed/);

  await openFromMenu(page);
  const rows = page.getByTestId(TID.memoryRow);
  expect(await rows.count()).toBeGreaterThan(10);
  const lines = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split('\n')[1] ?? ''));
  for (const line of lines) expect(line).toMatch(SOURCE);
  // the ux-world seed writes no kind, so its facts all sit under FACTS (empty sections are not drawn), then HELPERS' NOTES
  for (const s of ['facts', 'helpers'] as const)
    await expect(page.getByTestId(TID.screenMemory)).toContainText(t(`screen.memory.section.${s}`).toLocaleUpperCase());
  await expect(page.getByTestId(TID.memoryHelper)).toHaveCount(1);

  // the "You said" filter keeps only said rows
  await page.getByTestId(TID.memoryFilter).and(page.locator('[data-row-id="said"]')).click();
  const said = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split('\n')[1] ?? ''));
  expect(said.length).toBeGreaterThan(0);
  expect(said.length).toBeLessThan(lines.length);
  for (const line of said) expect(line).toMatch(/^You said · /);

  // search with no match → the no-match state; Clear filters brings every row back
  await page.getByTestId(TID.memorySearch).fill('zzqx');
  await expect(page.getByTestId(TID.screenMemory)).toHaveAttribute('data-state', 'filter_empty');
  await expect(page.getByTestId(TID.screenMemory)).toContainText(t('screen.memory.no_match.text', { query: 'zzqx' }));
  await page.getByRole('button', { name: t('screen.memory.no_match.clear') }).click();
  await expect(page.getByTestId(TID.memorySearch)).toHaveValue('');
  await expect(rows).toHaveCount(lines.length);
  await app.close();
});

test('AT-073: Forget everything from chats opens C-3 with the count and "stays connected"; Cancel keeps every fact', async () => {
  const { app, page } = await startWorld();
  await openFromMenu(page);
  const rows = page.getByTestId(TID.memoryRow);
  const all = await rows.count();
  await page.getByTestId(TID.memoryFilter).and(page.locator('[data-row-id="chat"]')).click();
  const fromChats = await rows.count();
  expect(fromChats).toBeGreaterThan(0);
  await page.getByTestId(TID.memoryFilter).and(page.locator('[data-row-id="all"]')).click();

  await page.getByTestId(TID.memoryMenu).click();
  await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_chats') }).click();
  const c3 = page.getByTestId(TID.dialogC03);
  await expect(c3).toHaveAttribute('role', 'alertdialog');
  // the count also takes the helpers' notes learned from chats (Trips · 2 notes), which the FACTS rows leave out
  const title = (await c3.getByRole('heading').textContent()) ?? '';
  const count = Number(/^Forget (\d+) things/.exec(title)?.[1]);
  expect(count).toBeGreaterThanOrEqual(fromChats);
  expect(title).toBe(t('dialog.c_03.title', { count, app: 'chats' }));
  await expect(c3).toContainText(t('dialog.c_03.body', { app: 'chats' }));
  await expect(c3.getByTestId(TID.dialogPrimary)).toHaveText(t('dialog.c_03.primary', { count }));
  await expect(c3.getByTestId(TID.dialogSecondary)).toBeFocused();
  await c3.getByTestId(TID.dialogSecondary).click();
  await expect(c3).toHaveCount(0);
  await expect(rows).toHaveCount(all);
  await app.close();
});

test('C-4: Forget everything stays disabled until FORGET is typed exactly; Ctrl+M opens the page', async () => {
  const { app, page } = await startWorld();
  await page.keyboard.press('Control+m');
  await expect(page.getByTestId(TID.screenMemory)).toHaveAttribute('data-state', 'list');
  await page.getByTestId(TID.memoryMenu).click();
  await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
  const c4 = page.getByTestId(TID.dialogC04);
  const primary = c4.getByTestId(TID.dialogPrimary);
  await expect(c4).toContainText(t('dialog.c_04.title'));
  await expect(primary).toBeDisabled();
  const field = c4.getByTestId(TID.dialogConfirmField);
  await field.fill('forget');
  await expect(primary).toBeDisabled();
  await field.press('Enter');
  await expect(c4).toBeVisible();
  await field.fill('FORGET');
  await expect(primary).toBeEnabled();
  await c4.getByTestId(TID.dialogSecondary).click();
  await expect(c4).toHaveCount(0);
  await app.close();
});
