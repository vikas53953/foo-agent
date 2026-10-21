// Spec: 10-acceptance-2 §C.10 AT-425 (a reply tagged `intent_capabilities` posts the one-sentence reply and the card; rows
// follow 04 §13.7 order and connection state; Try it fills the field and sends nothing), AT-426 (the safety line always
// shows; while the Ideas page is a placeholder no ideas link line shows); 04 §13.7, 08-4 §25.2, CR-0024 F3 and §(e) 1, 2, 4,
// X-182. C1 T2: the real app on the fake AI, in the fake world (Gmail not connected, WhatsApp not linked).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { fakeTurns, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import { settleSeededJobs } from './m4-start';
import { say } from './m9-booking-world';
import { openChat, openWorld } from '../fidelity/capture';

const HOLD_MS = 1500;
const ASK = 'what can you do';
const ONE_LINE = 'I take care of the small jobs on your computer, and I ask before I send, book or pay.';

/** A FOO/1 intake reply tagged `intent_capabilities` (08-4 §25.2). */
const capabilitiesLine = (prompt: string, sentence: string): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: prompt },
  reply: `<say>${sentence}</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [], tags: ['intent_capabilities'] })}</act>`,
});

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator, count = 1) {
  for (let i = 0; i < 60 && (await loc.count()) < count; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(300);
  }
  await expect(loc).toHaveCount(count);
}

async function start(lines: FakeLine[]) {
  const { app, dirs } = await launchWithFakeAi([VERIFY_OK, ...lines]);
  const page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  return { app, page, dirs };
}

const intakes = (dirs: Parameters<typeof fakeTurns>[0]) => fakeTurns(dirs).filter((x) => x.purpose === 'intake').length;

test('AT-425 · "what can you do" posts the one-sentence reply and then the Capabilities card; rows follow the connection state; Try it fills the field and sends nothing', async () => {
  const { app, page, dirs } = await start([{ ...capabilitiesLine(ASK, ONE_LINE), once: false }]);
  try {
    const log = page.getByTestId(TID.threadLog);
    await say(page, ASK);
    const cards = log.getByTestId(TID.kitCapabilities);
    await showUp(page, cards);
    const reply = log.getByTestId(TID.bubbleFoo).filter({ hasText: ONE_LINE });
    await expect(reply).toHaveCount(1);
    // The reply's words are the AI's one sentence; the card comes after it, built by the app.
    const order = await page.evaluate(
      ([bubble, card]) => {
        const b = document.querySelector(`[data-testid="${bubble}"]`)!;
        const c = document.querySelector(`[data-testid="${card}"]`)!;
        return b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING ? 'card after reply' : 'card first';
      },
      [TID.bubbleFoo, TID.kitCapabilities],
    );
    expect(order).toBe('card after reply');
    await expect(reply).not.toContainText(t('kit.capabilities.price.label'));

    // Fake world: Gmail not connected, WhatsApp not linked → email (with the connect hint), price, compare, remind.
    const card = cards.first();
    const rows = card.getByTestId(TID.kitCapabilitiesRow);
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))).toEqual(['email', 'price', 'compare', 'remind']);
    await expect(rows.nth(0)).toContainText(t('kit.capabilities.email.label'));
    await expect(rows.nth(0)).toContainText(t('kit.capabilities.email.hint_off'));
    await expect(rows.nth(1)).toContainText(t('kit.capabilities.price.label'));
    await expect(rows.nth(1)).toContainText(t('kit.capabilities.price.hint'));
    await expect(card.getByTestId(TID.kitCapabilitiesTry)).toHaveText(Array(4).fill(t('kit.capabilities.try')));
    await expect(card.locator('[data-icon]')).toHaveCount(4);
    expect(await card.locator('[data-icon]').evaluateAll((els) => els.map((e) => e.getAttribute('data-icon')))).toEqual([
      'Mail',
      'Money',
      'Search',
      'Clock',
    ]);

    // Try it: the row's sentence fills the composer, focused; nothing is sent and the engine gets no new turn.
    const mine = log.getByTestId(TID.bubbleMe);
    const sentBefore = await mine.count();
    const turnsBefore = intakes(dirs);
    await rows.nth(1).getByTestId(TID.kitCapabilitiesTry).click();
    const field = page.getByTestId(TID.composerField);
    await expect(field).toHaveText(t('kit.capabilities.price.fill'));
    await expect(field).toBeFocused();
    await advance(page, 5_000);
    await page.waitForTimeout(500);
    await expect(mine).toHaveCount(sentBefore);
    expect(intakes(dirs)).toBe(turnsBefore);

    // Another row replaces the words, like a suggestion chip.
    await rows.nth(3).getByTestId(TID.kitCapabilitiesTry).click();
    await expect(field).toHaveText(t('kit.capabilities.remind.fill'));

    // Asking again posts a fresh card; the older one keeps its rows.
    await field.press('Control+a');
    await field.press('Delete');
    await say(page, ASK);
    await showUp(page, cards, 2);
    await expect(cards.first().getByTestId(TID.kitCapabilitiesRow)).toHaveCount(4);
    await expect(cards.nth(1).getByTestId(TID.kitCapabilitiesRow)).toHaveCount(4);
  } finally {
    await app.close();
  }
});

test('AT-426 · the Capabilities footer always shows the safety line, and no ideas link line while the Ideas page is a placeholder', async () => {
  const { app, page } = await start([capabilitiesLine(ASK, ONE_LINE)]);
  try {
    await say(page, ASK);
    const card = page.getByTestId(TID.threadLog).getByTestId(TID.kitCapabilities);
    await showUp(page, card);
    await expect(card).toContainText(t('kit.capabilities.safety'));
    // The safety line is the card's last line, under the rows.
    const last = await card.evaluate((el) => (el.lastElementChild as HTMLElement).innerText.trim());
    expect(last).toBe(t('kit.capabilities.safety'));
    await expect(card.locator('a, [href]')).toHaveCount(0);
    await expect(card).not.toContainText('ideas');
    await expect(card.getByRole('button')).toHaveCount(4);
  } finally {
    await app.close();
  }
});
