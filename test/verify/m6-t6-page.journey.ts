// Spec: 06-2 §7.1–§7.5 (Memory page rows, source lines, filters, search "no match"), 06-3 §14 C-3 / C-4, 03-2 §3.7.3.3
// (the ⋯ menu entry). foo-verify journey for M6 T6: open Memory from the sidebar ⋯ menu on the ux-world seed, check the
// sections and source lines, a filter, the no-match state, C-3's count and C-4's typed FORGET gate, light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m6-t6-page.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await setTheme(page, 'light');
  const screen = page.getByTestId(TID.screenMemory);
  const rows = page.getByTestId(TID.memoryRow);
  const state = () => screen.getAttribute('data-state');

  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await screen.and(page.locator('[data-state="list"]')).waitFor();
  const lines = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split('\n')[1] ?? ''));
  const bad = lines.filter((l) => !/^(You said|I guessed · .+) · \d{1,2} [A-Z][a-z]{2}$/.test(l));
  if (bad.length) throw new Error(`rows without a source line: ${bad.join(' | ')}`);
  v.note(`⋯ → Memory opens "${t('screen.memory.title')}" with ${lines.length} rows, each with a source line ("${lines[0]}")`);
  await rest(page);
  await settle(page);
  await v.shot('memory-page');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('memory-page');
  await setTheme(page, 'light');

  await page.getByTestId(TID.memoryFilter).and(page.locator('[data-row-id="said"]')).click();
  const said = await rows.count();
  if (!(said > 0 && said < lines.length)) throw new Error(`"You said" filter kept ${said} of ${lines.length}`);
  v.note(`"You said" chip keeps ${said} of ${lines.length} rows`);
  await settle(page);
  await v.shot('memory-filter-said');

  await page.getByTestId(TID.memorySearch).fill('zzqx');
  await screen.and(page.locator('[data-state="filter_empty"]')).waitFor();
  v.note(`search "zzqx" → state ${await state()}, "${t('screen.memory.no_match.text', { query: 'zzqx' })}"`);
  await settle(page);
  await v.shot('memory-no-match');
  await page.getByRole('button', { name: t('screen.memory.no_match.clear') }).click();
  await screen.and(page.locator('[data-state="list"]')).waitFor();
  if ((await rows.count()) !== lines.length) throw new Error('Clear filters did not bring every row back');
  v.note('Clear filters → every row back');

  await page.getByTestId(TID.memoryMenu).click();
  await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_chats') }).click();
  const c3 = page.getByTestId(TID.dialogC03);
  await c3.waitFor();
  v.note(`C-3: "${await c3.getByRole('heading').textContent()}"`);
  await settle(page);
  await v.shot('memory-c3', byTid(TID.dialogC03));
  await c3.getByTestId(TID.dialogSecondary).click();

  await page.getByTestId(TID.memoryMenu).click();
  await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
  const c4 = page.getByTestId(TID.dialogC04);
  const primary = c4.getByTestId(TID.dialogPrimary);
  await c4.getByTestId(TID.dialogConfirmField).fill('forget');
  if (await primary.isEnabled()) throw new Error('C-4 primary enabled for "forget"');
  await settle(page);
  await v.shot('memory-c4-locked', byTid(TID.dialogC04));
  await c4.getByTestId(TID.dialogConfirmField).fill('FORGET');
  if (!(await primary.isEnabled())) throw new Error('C-4 primary still disabled for "FORGET"');
  v.note('C-4: "forget" keeps Forget everything disabled; "FORGET" enables it');
  await settle(page);
  await v.shot('memory-c4-ready', byTid(TID.dialogC04));
  await c4.getByTestId(TID.dialogSecondary).click();
}
