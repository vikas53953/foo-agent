// Spec: 04 §13.7 (Capabilities card after foo's one sentence: rows from the app's own state, "Try it ›" fills the field and
// never sends, footer = the safety line), 08-4 §25.2 (intake tag `intent_capabilities`), CR-0024 F3, AT-425, AT-426, X-182.
// foo-verify journey for C1 T2, real app on the seeded world with the fake AI (Gmail not connected, WhatsApp not linked):
// (1) "what can you do" gets one sentence and then the card with email ("Connect Gmail to start"), price, compare, remind;
// (2) "Try it" on the price row fills the composer and sends nothing; (3) dark theme. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/c1-t2-voice.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { FakeLine, FakeTurn } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const ASK = 'what can you do';
const ONE_LINE = 'I take care of the small jobs on your computer, and I ask before I send, book or pay.';
const LINE: FakeLine = {
  match: { purpose: 'intake', promptIncludes: ASK },
  reply: `<say>${ONE_LINE}</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [], tags: ['intent_capabilities'] })}</act>`,
};

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(400);
  }
  await loc.first().waitFor();
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [LINE] });
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await settle(page);
  await v.shot('foo-chat-before');

  const log = page.getByTestId(TID.threadLog);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  const card = log.getByTestId(TID.kitCapabilities);
  await showUp(page, card);
  const reply = log.getByTestId(TID.bubbleFoo).filter({ hasText: ONE_LINE });
  if ((await reply.count()) !== 1) throw new Error('expected foo’s one sentence in one bubble');
  v.note(`asked "${ASK}": foo answered in one sentence: "${ONE_LINE}"`);

  const rows = card.getByTestId(TID.kitCapabilitiesRow);
  const keys = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
  if (JSON.stringify(keys) !== JSON.stringify(['email', 'price', 'compare', 'remind'])) throw new Error(`rows: ${JSON.stringify(keys)}`);
  const emailRow = (await rows.nth(0).innerText()).replace(/\s+/g, ' ');
  if (!emailRow.includes(t('kit.capabilities.email.hint_off'))) throw new Error(`email row: ${emailRow}`);
  v.note(`the card follows with rows ${keys.join(', ')}; the email row says "${t('kit.capabilities.email.hint_off')}"`);
  const footer = await card.evaluate((el) => (el.lastElementChild as HTMLElement).innerText.trim());
  if (footer !== t('kit.capabilities.safety')) throw new Error(`footer: ${footer}`);
  if ((await card.locator('a, [href]').count()) !== 0) throw new Error('the card links somewhere');
  v.note(`footer: "${footer}"; no ideas link line (the Ideas page is still a placeholder)`);
  await settle(page);
  await v.shot('capabilities-card');

  const mine = log.getByTestId(TID.bubbleMe);
  const sent = await mine.count();
  const intakes = () => (v.fakeTurns() as FakeTurn[]).filter((x) => x.purpose === 'intake').length;
  const turns = intakes();
  await rows.nth(1).getByTestId(TID.kitCapabilitiesTry).click();
  const field = page.getByTestId(TID.composerField);
  await page.waitForTimeout(300);
  const filled = (await field.innerText()).trim();
  if (filled !== t('kit.capabilities.price.fill')) throw new Error(`composer: ${filled}`);
  const focused = await field.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
  if (!focused) throw new Error('the composer is not focused');
  await advance(page, 5_000);
  await page.waitForTimeout(600);
  if ((await mine.count()) !== sent || intakes() !== turns) throw new Error('Try it sent something');
  v.note(
    `Try it on "${t('kit.capabilities.price.label')}" filled the field with "${filled}", focused it, and sent nothing (still ${sent} of my bubbles, ${turns} intake turn)`,
  );
  await settle(page);
  await v.shot('try-it-filled');

  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('try-it-filled');
}
