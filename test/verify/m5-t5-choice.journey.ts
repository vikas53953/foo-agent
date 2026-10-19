// Spec: 05-1 §5.3 Choice (3 rows, Best fit, Something else…, Skip, the folded "{question} → {answer}"; the 3-question stepper
// "1 of 3" with Back), §5.4 Option tiles, 08-4 §26.6 (typed "1" answers the newest open card). foo-verify journey for M5 T5:
// seeded cards in foo's chat (test:card.seed) on the ux-world, the typed answer through the real engine on the fake AI,
// light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t5-choice.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { envelope, VERIFY_OK } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { FLIGHTS, seed, STAYS, TRIP_STEPS } from '../e2e/m5-choice-seeds';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

async function seedCard(page: Page, payload: Record<string, unknown>, type: 'choice' | 'tiles' = 'choice'): Promise<Locator> {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), seed(payload, undefined, type));
  const card = page.locator(`[data-card-id="${r.cardId}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.waitFor();
  return card;
}

async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const stateOf = (card: Locator) => card.getAttribute('data-card-state');

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [VERIFY_OK, { match: { purpose: 'intake' }, reply: envelope('Okay.'), once: false }] });
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'foo');

  // 1. Tap: three rows, Best fit first; option 2 folds the card to "{question} → {answer}".
  const tapped = await seedCard(page, FLIGHTS);
  const rows = await tapped.getByTestId(TID.cardChoiceOption).count();
  v.note(
    `seeded Choice shows ${rows} rows; row 1 reads "${(await tapped.getByTestId(TID.cardChoiceOption).first().innerText()).replace(/\n/g, ' · ')}"`,
  );
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await v.shot(`choice-asking-${theme}`);
  }
  await setTheme(page, 'light');
  await tapped.getByTestId(TID.cardChoiceOption).nth(1).click();
  await until(async () => (await stateOf(tapped)) === 'answered', 'the tapped card to fold');
  v.note(`tap on option 2 → state answered, card reads "${(await tapped.innerText()).split('\n')[0]}"`);
  await settle(page);
  await v.shot('choice-answered');

  // 2. Typed "1" in the composer answers the newest open card through the engine (08-4 §26.6 rule 1).
  const typed = await seedCard(page, FLIGHTS);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await until(async () => (await stateOf(typed)) === 'answered', 'the typed answer to fold the card');
  v.note(`typed "1" → state answered, card reads "${(await typed.innerText()).split('\n')[0]}"`);

  // 3. Stepper: "1 of 3"; a tap advances to "2 of 3"; Back returns to "1 of 3".
  const stepper = await seedCard(page, TRIP_STEPS);
  const pager = stepper.getByTestId(TID.cardChoicePager);
  v.note(`stepper pager reads "${await pager.innerText()}"`);
  await stepper.getByTestId(TID.cardChoiceOption).first().click();
  await until(async () => (await pager.innerText()).includes('2'), 'the stepper to advance');
  v.note(`after a tap the pager reads "${await pager.innerText()}" and the question is "${(await stepper.innerText()).split('\n')[0]}"`);
  await settle(page);
  await v.shot('stepper-question-2');
  await stepper.getByTestId(TID.cardChoiceBack).click();
  await until(async () => (await pager.innerText()).includes('1'), 'Back to question 1');
  v.note(`Back → pager reads "${await pager.innerText()}"`);

  // 4. Option tiles, light and dark.
  const tiles = await seedCard(page, STAYS, 'tiles');
  v.note(`seeded tiles card shows ${await tiles.getByTestId(TID.cardTilesOption).count()} tiles`);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await tiles.scrollIntoViewIfNeeded();
    await rest(page);
    await settle(page);
    await v.shot(`tiles-${theme}`);
  }
  await setTheme(page, 'light');
  await page.locator(byTid(TID.cardTilesOption)).first().click();
  await until(async () => (await stateOf(tiles)) === 'answered', 'the tile pick to fold the card');
  v.note(`tile 1 tapped → state answered, card reads "${(await tiles.innerText()).split('\n')[0]}"`);
  await app.close();
}
