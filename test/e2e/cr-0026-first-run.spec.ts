// Spec: CR-0026 (first run option A): 06-1 §2.1 Welcome ("Hi, I'm foo." and [ Let's go ] → step 1), §2.2 → step 2, §2.3
// Card 2a (name, "{Name} it is.", the header updates), Card 2b (face; "Use this face" puts it on foo's chat), Card 2c (the
// vibe line), then setup is complete: the step pill goes, "+ New helper" unlocks, and foo's hello offers three things to try.
// §2.0 "Skip the rest" applies the defaults and completes setup the same way.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finder, firstRun } from './ai-step-world';

const setupCard = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`[data-testid="${TID.cardSetup}"][data-row-id="${id}"]`).last();

test('CR-0026: Welcome → your AI → name → face → vibe → a warm hello; setup completes', async () => {
  const { app, page } = await firstRun(aiHome(['claude']), undefined, { stayOnWelcome: true });
  await expect(page.getByTestId(TID.setupWelcomeTitle)).toHaveText(t('setup.welcome.title'));
  await expect(page.getByTestId(TID.setupStepPill)).toHaveCount(0);
  await page.getByTestId(TID.setupWelcomeStart).click();

  await expect(page.getByTestId(TID.setupStepPill)).toHaveText(t('setup.step_pill.1'));
  await expect(page.getByTestId(TID.setupWelcomeTitle)).toHaveCount(0);
  await finder(page).getByTestId(TID.setupAiUse).click({ timeout: 30_000 });

  await expect(page.getByTestId(TID.setupStepPill)).toHaveText(t('setup.step_pill.2'));
  await expect(page.getByTestId(TID.setupSkipRest)).toBeVisible();
  const name = setupCard(page, 'name');
  await expect(name).toContainText(t('setup.name.question'));
  await name.getByTestId(TID.setupNameField).fill('Sunny');
  await name.getByTestId(TID.setupNameDone).click();
  await expect(page.getByTestId(TID.thread).getByText(t('setup.name.reply', { name: 'Sunny' }))).toBeVisible();
  await expect(page.getByTestId(TID.chatHeaderName)).toHaveText('Sunny');

  const face = setupCard(page, 'face');
  await expect(face.getByTestId(TID.setupFaceTile)).toHaveCount(4);
  await face.locator(`[data-testid="${TID.setupFaceTile}"][data-index="3"]`).click();
  await expect(face.locator(`[data-testid="${TID.setupFaceTile}"][data-index="3"]`)).toHaveAttribute('data-state', 'selected');
  await face.getByTestId(TID.setupFaceUse).click();
  await expect(setupCard(page, 'face')).toContainText(t('setup.face.question'));

  const vibe = page.locator(`[data-testid="${TID.cardChoice}"]`).last();
  await expect(vibe).toContainText(t('setup.vibe.question'));
  await vibe.getByTestId(TID.cardChoiceOption).first().click();
  await expect(page.getByTestId(TID.thread).getByText(t('setup.vibe.line.calm_funny'))).toBeVisible();
  await expect(page.getByTestId(TID.thread).getByText(t('setup.hello.line', { name: 'Sunny' }))).toBeVisible();
  await expect(page.getByTestId(TID.composerSuggestions)).toContainText(t('setup.hello.try_1'));

  await expect(page.getByTestId(TID.setupStepPill)).toHaveCount(0);
  await expect(page.getByTestId(TID.sidebarNewHelper)).toBeEnabled();
  await app.close();
});

test('CR-0026: "Skip the rest" in step 2 keeps the defaults and completes setup', async () => {
  const { app, page } = await firstRun(aiHome(['claude']));
  await finder(page).getByTestId(TID.setupAiUse).click({ timeout: 30_000 });
  await expect(setupCard(page, 'name')).toContainText(t('setup.name.question'));
  await page.getByTestId(TID.setupSkipRest).click();
  await expect(page.getByTestId(TID.thread).getByText(t('setup.skip_rest.reply'))).toBeVisible();
  await expect(page.getByTestId(TID.thread).getByText(t('setup.hello.line', { name: 'foo' }))).toBeVisible();
  await expect(setupCard(page, 'name')).toContainText(t('setup.card.skipped', { question: t('setup.name.question') }));
  await expect(page.getByTestId(TID.setupStepPill)).toHaveCount(0);
  await expect(page.getByTestId(TID.sidebarNewHelper)).toBeEnabled();
  await app.close();
});

test('CR-0026: a name with no letter is refused with the field error', async () => {
  const { app, page } = await firstRun(aiHome(['claude']));
  await finder(page).getByTestId(TID.setupAiUse).click({ timeout: 30_000 });
  const name = setupCard(page, 'name');
  await name.getByTestId(TID.setupNameField).fill('!!!');
  await name.getByTestId(TID.setupNameDone).click();
  await expect(name.getByTestId(TID.setupNameError)).toHaveText(t('setup.name.error.no_letter'));
  await app.close();
});
