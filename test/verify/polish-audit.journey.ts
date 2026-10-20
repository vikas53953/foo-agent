// Spec: 02 F7 (motion), 02-2 §F16 (empty states), 04 §12.3 (foo's reply). Polish audit "before" pictures of today's app.
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const ASK = 'Find me a good dentist near Koramangala open on Saturday';
const ANSWER = 'I found three dentists open on Saturday near Koramangala. The closest is 1.2 km away.';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [intake(ASK, ANSWER)] });
  await openWorld(app, page);
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await rest(page);
  await settle(page);
  await v.shot('foo-chat');
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await v.shot('foo-working');
  await page.waitForTimeout(2500);
  await v.shot('foo-replied');
  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await page.getByTestId(TID.screenMemory).waitFor();
  await settle(page);
  await v.shot('memory');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('memory');
}
