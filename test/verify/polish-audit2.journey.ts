// Spec: 02-2 §F16 (empty states), 06-3 §14 (confirms). Polish audit "before" pictures, part 2.
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({});
  await openWorld(app, page);
  await setTheme(page, 'light');
  await page.getByTestId(TID.sidebarSearchField).click();
  await page.keyboard.type('dentsit');
  await page.waitForTimeout(800);
  await v.shot('search-empty');
  await page.getByTestId(TID.sidebarSearchClear).click();
  await page.getByTestId(TID.sidebarMore).click();
  await page.waitForTimeout(300);
  await v.shot('menu-open');
  await page.keyboard.press('Escape');
  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await page.getByTestId(TID.screenMemory).waitFor();
  await page.getByTestId(TID.memoryRowForget).first().click();
  await page.waitForTimeout(400);
  await v.shot('confirm-dialog');
  await page.keyboard.press('Escape');
  await openChat(page, 'Trips');
  await setTheme(page, 'dark');
  await rest(page);
  await settle(page);
  await v.shot('trips-dark');
}
