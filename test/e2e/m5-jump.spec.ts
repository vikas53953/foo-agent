// Spec: 05-1 §0 keyboard table / 09 §9.17.1 [X-09, X-21]: Ctrl+J anywhere in a chat moves focus to the oldest card in this
// chat that needs the user; with none, Narrator reads "Nothing needs you here." (02-3 §F25.2 `app-announcer`). Cards are
// seeded through test:card.seed (CR-0009) on the X-10 clock; fake words only (public repo).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import { launch } from './launch';
import { FLIGHTS } from './m5-choice-seeds';

const T = Date.parse('2026-10-16T09:41:00+05:30');

const CHOICE: CardSeedRequest = { type: 'choice', state: 'asking', payload: FLIGHTS };
const ANSWERED: CardSeedRequest = { type: 'choice', state: 'answered', payload: FLIGHTS };
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

let app: ElectronApplication;
let page: Page;
let chatId: string;

// "Trips" has no card waiting on the user in the seeded world (foo's own chat holds a pending Payment card).
test.beforeAll(async () => {
  app = await launch();
  page = await app.firstWindow();
  await openWorld(app, page);
  await openChat(page, 'Trips');
  chatId = (await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText('Trips', { exact: true }) })
    .first()
    .getAttribute('data-chat-id'))!;
});
test.afterAll(async () => app?.close());

const seed = (req: CardSeedRequest) => page.evaluate((s) => window.__fooTest!.cardSeed(s), { ...req, chatId });
const rowOfMessage = (messageId: string) => page.locator(`${byTid(TID.threadLog)} [data-message-id="${messageId}"]`);

test('Ctrl+J with nothing waiting: Narrator "Nothing needs you here." and focus stays put', async () => {
  await seed(ANSWERED);
  const field = page.getByTestId(TID.composerField);
  await field.focus();
  await page.keyboard.press('Control+j');
  await expect(page.getByTestId(TID.appAnnouncer).getByRole('status')).toHaveText('Nothing needs you here.');
  await expect(field).toBeFocused();
});

test('Ctrl+J jumps to the oldest card that needs you, not the newest', async () => {
  await page.evaluate((at) => window.__fooTest!.clock.set(at), new Date(T + 60_000).toISOString());
  const oldest = await seed(CHOICE);
  await page.evaluate((at) => window.__fooTest!.clock.set(at), new Date(T + 120_000).toISOString());
  await seed(STUCK);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.press('Control+j');
  const row = rowOfMessage(oldest.messageId);
  await expect(row).toBeFocused();
  await expect(row.locator(`[data-card-id="${oldest.cardId}"]`)).toBeVisible();
});
