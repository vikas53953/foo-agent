// Spec: 10-1 AT-032 (3 options → exactly 3 rows plus "Something else…" and Skip, option 1 tagged "Best fit"), AT-035 (typed
// "2" or a 2️⃣ reaction folds the card exactly as a tap on option 2), AT-288 (3 questions: "1 of 3" pager, a tap advances
// after --m-card with no Next button, "Back" from question 2, keys 1–4 pick), 05-1 §5.3.1–§5.3.5, X-155. Cards are seeded
// rows in foo's chat (test:card.seed); typed answers run through the real engine on the fake AI (08-3 §22.3).
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld, windowSize } from '../fidelity/capture';
import { envelope, launchWithFakeAi, VERIFY_OK } from './fakeAi';
import { settleSeededJobs } from './m4-start';
import { FLIGHTS, seed, TRIP_STEPS } from './m5-choice-seeds';

async function start() {
  const { app } = await launchWithFakeAi([VERIFY_OK, { match: { purpose: 'intake' }, reply: envelope('Okay.'), once: false }]);
  const page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'foo');
  return { app, page };
}

async function seedCard(page: Page, payload: Record<string, unknown>) {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), seed(payload));
  const card = page.locator(`${byTid(TID.cardChoice)}[data-card-id="${r.cardId}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return { card, r };
}

const answeredText = `${String(FLIGHTS.question)} → 7:10 AM · Air India · ₹4,890`;

test('AT-032: 3 options → 3 rows, "Something else…" and Skip, option 1 tagged "Best fit"', async () => {
  const { app, page } = await start();
  const { card } = await seedCard(page, FLIGHTS);
  const rows = card.getByTestId(TID.cardChoiceOption);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-index', '1');
  await expect(rows.nth(0)).toContainText(t('cards.choice.tag'));
  await expect(rows.nth(1)).not.toContainText(t('cards.choice.tag'));
  await expect(card.getByTestId(TID.cardChoiceSomethingElse)).toHaveText(t('cards.choice.something_else'));
  await expect(card.getByTestId(TID.cardChoiceSkip)).toHaveText(t('cards.choice.skip'));
  await expect(card.getByTestId(TID.cardChoicePager)).toHaveCount(0);
  await expect(card.getByRole('radiogroup')).toHaveCount(1);
  // "Something else…" focuses the composer with "Tell me what you want instead" (05-1 §5.3.2).
  await card.getByTestId(TID.cardChoiceSomethingElse).click();
  await expect(page.getByTestId(TID.composerField)).toBeFocused();
  await expect(page.getByTestId(TID.composer)).toContainText(t('cards.choice.something_else_placeholder'));
  await app.close();
});

test('AT-035: typed "2", a 2️⃣ reaction and a tap on option 2 all fold the card the same way', async () => {
  const { app, page } = await start();
  // Tap.
  const tapped = await seedCard(page, FLIGHTS);
  await tapped.card.getByTestId(TID.cardChoiceOption).nth(1).click();
  await expect(tapped.card).toHaveAttribute('data-card-state', 'answered');
  const tapText = await tapped.card.innerText();
  expect(tapText).toContain(answeredText);

  // Typed "2" (the engine's typed hook, 08-2 §5.2).
  const typed = await seedCard(page, FLIGHTS);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(typed.card).toHaveAttribute('data-card-state', 'answered');
  expect(await typed.card.innerText()).toBe(tapText);
  await expect(typed.card).toContainText(answeredText);

  // A 2️⃣ reaction on the card's bubble (08-4 §26.6 rule 4).
  const reacted = await seedCard(page, FLIGHTS);
  await page.evaluate((id) => window.foo.invoke('message:react', { messageId: id, emoji: '2️⃣', on: true }), reacted.r.messageId);
  await expect(reacted.card).toHaveAttribute('data-card-state', 'answered');
  await expect(reacted.card).toContainText(answeredText);

  // Narrator: "You chose {answer}." on every one.
  for (const c of [tapped.card, typed.card, reacted.card])
    await expect(c).toHaveAttribute('aria-label', t('cards.choice.answered', { answer: '7:10 AM · Air India · ₹4,890' }));
  await app.close();
});

test('AT-288: a 3-question card shows "1 of 3", a tap advances with no Next button, Back from question 2, keys 1–4 pick', async () => {
  const { app, page } = await start();
  const { card } = await seedCard(page, TRIP_STEPS);
  const pager = card.getByTestId(TID.cardChoicePager);
  await expect(pager).toHaveText(t('cards.choice.pager', { k: 1, n: 3 }));
  await expect(card.getByTestId(TID.cardChoiceBack)).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Next$/u })).toHaveCount(0);

  await card.getByTestId(TID.cardChoiceOption).nth(0).click();
  await expect(pager).toHaveText(t('cards.choice.pager', { k: 2, n: 3 }));
  await expect(card).toContainText('Checked bag?');
  await expect(card.getByTestId(TID.cardChoiceBack)).toHaveText(t('cards.choice.back'));

  // Back returns to question 1; then the keys: focus a row and press 2 (question 1), 2 (question 2), 3 (question 3).
  await card.getByTestId(TID.cardChoiceBack).click();
  await expect(pager).toHaveText(t('cards.choice.pager', { k: 1, n: 3 }));
  await card.getByTestId(TID.cardChoiceOption).nth(0).focus();
  await page.keyboard.press('2');
  await expect(pager).toHaveText(t('cards.choice.pager', { k: 2, n: 3 }));
  await card.getByTestId(TID.cardChoiceOption).nth(0).focus();
  await page.keyboard.press('2');
  await expect(pager).toHaveText(t('cards.choice.pager', { k: 3, n: 3 }));
  await card.getByTestId(TID.cardChoiceOption).nth(0).focus();
  await page.keyboard.press('3');
  await expect(card).toHaveAttribute('data-card-state', 'answered');
  await expect(card).toContainText(`${String(FLIGHTS.question)} → 7:10 AM · Air India · ₹4,890`);
  await expect(card).toContainText('Checked bag? → Add 25 kg');
  await expect(card).toContainText('Seat? → Any');
  await app.close();
});
