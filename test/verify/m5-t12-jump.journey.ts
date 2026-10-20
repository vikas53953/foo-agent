// Spec: 05-1 §0 keyboard table / 09 §9.17.1 [X-09, X-21] (Ctrl+J anywhere in a chat: focus jumps to the oldest card in this
// chat that needs the user; none → Narrator "Nothing needs you here.").
// foo-verify journey for M5 T12, real app on the seeded world: Trips has nothing waiting → the live region reads the line and
// focus stays in the typing box; a Choice and a newer Stuck card are seeded → Ctrl+J lands on the Choice row; foo's chat →
// Ctrl+J lands on its pending Payment card (the oldest gated card there).
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t12-jump.journey.ts
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { FLIGHTS } from '../e2e/m5-choice-seeds';
import { openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const STUCK: CardSeedRequest = {
  type: 'stuck',
  state: 'asking',
  payload: {
    whatsWrong: 'The site keeps showing the same page.',
    spentLine: '₹4 so far',
    suggestion: 'open the page for you',
    allowOtherWay: true,
  },
};

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? '');
const spoken = (page: Page) => page.getByTestId(TID.appAnnouncer).getByRole('status').textContent();

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await setTheme(page, 'light');
  await openChat(page, 'Trips');
  const chatId = await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText('Trips', { exact: true }) })
    .first()
    .getAttribute('data-chat-id');
  await rest(page);
  await settle(page);
  const field = page.getByTestId(TID.composerField);

  await field.focus();
  await page.keyboard.press('Control+j');
  await page.waitForTimeout(300);
  const none = await spoken(page);
  v.note(`Trips, nothing waiting: live region "${none}", focus on ${await focused(page)}`);
  if (none !== 'Nothing needs you here.') throw new Error(`expected "Nothing needs you here.", got "${none}"`);
  await v.shot('trips-nothing-waiting');

  const seed = (req: CardSeedRequest) => page.evaluate((s) => window.__fooTest!.cardSeed(s), { ...req, chatId: chatId! });
  const choice = await seed({ type: 'choice', state: 'asking', payload: FLIGHTS });
  await page.evaluate(() => window.__fooTest!.clock.advance(60_000));
  await seed(STUCK);
  await field.focus();
  await settle(page);
  v.note(`before Ctrl+J: focus on ${await focused(page)}`);
  await v.shot('before-ctrl-j');
  await page.keyboard.press('Control+j');
  const row = page.locator(`[data-testid="${TID.threadLog}"] [data-message-id="${choice.messageId}"]`);
  await row.waitFor();
  await page.waitForFunction((id) => document.activeElement?.getAttribute('data-message-id') === id, choice.messageId);
  v.note(`after Ctrl+J: focus on ${await focused(page)} (the older Choice, not the newer Stuck card)`);
  await v.shot('after-ctrl-j');

  await openChat(page, 'foo');
  await field.focus();
  await page.keyboard.press('Control+j');
  await page.waitForTimeout(800);
  v.note(`foo chat, after Ctrl+J: focus on ${await focused(page)}`);
  await v.shot('foo-after-ctrl-j');
}
