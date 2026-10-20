// Spec: CR-0020 (the AI step): 06-1 §2.2 "Find your AI" reached the way a new user gets there, a first run with no AI chosen
// (FOO_TEST_FIRST_RUN=1), and 06-2 §6.1 the "Your AI" rows of Account & your AI. AT-005 (Claude and ChatGPT signed in → both
// tested with a real request, Claude pre-selected), AT-006 (nothing passes → the composer stays locked with "Connect your AI
// first, then we can talk."), AT-155 (ChatGPT picked, no helper → the maker's page opens, nothing installs, the waiting line,
// the flow continues within 5 s of the helper appearing), AT-155a (only claude-cli, codex-cli, gemini-cli open a maker page),
// AT-009 Settings half (a key that fails offers "Replace key"; the old value is never shown). The helpers are fakes in a
// stand-in home (FOO_TEST_AI_HOME, CR-0020 (b) pick 8); every test request goes to the fake AI (08-3 §22.3).
import { expect, test } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { addHelper, aiHome, finder, finderRow, firstRun } from './ai-step-world';
import { VERIFY_OK } from './fakeAi';

const row = finderRow;

test('AT-005: Claude and ChatGPT are both tested and Claude is pre-selected; Use saves it and opens chat', async () => {
  const { app, page } = await firstRun(aiHome(['claude', 'codex']));
  await expect(finder(page)).toBeVisible();
  await expect(page.getByTestId(TID.setupStepPill)).toHaveText(t('setup.step_pill.1'));
  await expect(row(page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await expect(row(page, 'codex-cli')).toHaveAttribute('data-state', 'works');
  await expect(row(page, 'gemini-cli')).toHaveAttribute('data-state', 'not_found');
  await expect(page.getByTestId(TID.composer)).toContainText(t('setup.composer.locked'));
  await expect(finder(page)).toContainText(t('setup.ai_finder.choose.many', { AI: 'Claude' }));
  await finder(page).getByTestId(TID.setupAiUse).click();
  await expect(finder(page)).toContainText('Using Claude');
  await expect(page.getByTestId(TID.setupStepPill)).toHaveText(t('setup.step_pill.2'));
  await expect(page.getByTestId(TID.composer)).not.toContainText(t('setup.composer.locked'));
  await app.close();
});

test('AT-006: no AI passes a test → the composer stays locked', async () => {
  const { app, page } = await firstRun(aiHome([]));
  await expect(finder(page)).toContainText(t('setup.ai_finder.nothing.question'), { timeout: 20_000 });
  await expect(page.getByTestId(TID.composer)).toContainText(t('setup.composer.locked'));
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'disabled');
  await app.close();
});

test('AT-155 / AT-155a: ChatGPT with no helper opens its maker page, installs nothing, and goes on when it appears', async () => {
  const home = aiHome([]);
  const { app, page } = await firstRun(home);
  await expect(finder(page)).toContainText(t('setup.ai_finder.nothing.question'), { timeout: 20_000 });
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="codex-cli"]`).click();
  await expect(finder(page)).toContainText(t('setup.ai_finder.maker_consent', { AI: 'ChatGPT', maker: 'OpenAI' }));
  await finder(page).getByTestId(TID.setupAiOpenPage).click();
  await expect(finder(page)).toContainText(t('setup.ai_finder.waiting_helper', { AI: 'ChatGPT' }));
  const opened = await app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []);
  expect(opened).toEqual(['https://developers.openai.com/codex/cli']);
  addHelper(home, 'codex');
  await expect(row(page, 'codex-cli')).toHaveAttribute('data-state', 'works', { timeout: 8_000 });
  await app.close();
});

test('Settings → Account & your AI: Using, Test now, Backup AI, and Change posts a new finder', async () => {
  const { app, page } = await firstRun(aiHome(['claude', 'codex']));
  await expect(row(page, 'codex-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await finder(page).getByTestId(TID.setupAiUse).click();
  await expect(finder(page)).toContainText('Using Claude');
  await page.keyboard.press('Control+,');
  await expect(page.getByTestId(TID.screenSettings)).toBeVisible();
  const using = page.getByTestId(TID.settingsRowAccountAiUsing);
  await expect(using).toContainText(t('settings.account.ai_using.value', { AI: 'Claude' }));
  await expect(using).toContainText('works');
  await using.getByRole('button', { name: t('settings.account.ai_using.test_now') }).click();
  await expect(using).toContainText('works');
  const backup = page.getByTestId(TID.settingsRowAccountAiBackup);
  await expect(backup).toContainText('ChatGPT');
  await expect(page.getByTestId(TID.settingsRowAccountAiPaid)).toContainText(t('settings.account.ai_paid.plan', { AI: 'Claude' }));
  await using.getByRole('button', { name: t('settings.account.ai_using.change') }).click();
  await expect(page.locator(`[data-testid="${TID.cardSetup}"][data-row-id="ai_finder"]`)).toHaveCount(2);
  await expect(finder(page)).toHaveAttribute('data-card-state', 'shown');
  await app.close();
});

const FAKE_KEY = 'sk-proj-FAKE0aistep0first0000000000000000';
const NEXT_KEY = 'sk-proj-FAKE0aistep0second000000000000000';

test('AT-009 (Settings half): a key that fails offers Replace key; a new key is tested; no key is ever shown', async () => {
  // The first key fails its test (the fake answers that verify with AI_KEY_INVALID); every later test passes.
  const { app, page } = await firstRun(aiHome([]), [{ match: { purpose: 'verify' }, error: 'AI_KEY_INVALID', once: true }, VERIFY_OK]);
  await expect(finder(page)).toContainText(t('setup.ai_finder.nothing.question'), { timeout: 20_000 });
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="key"]`).click();
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="openai-key"]`).click();
  const box = page.locator(`[data-testid="${TID.cardSecret}"]`).last();
  await expect(box).toHaveAttribute('data-card-state', 'asking');
  await box.getByTestId(TID.cardSecretField).fill(FAKE_KEY);
  await box.getByTestId(TID.cardSecretSave).click();
  await expect(box).toHaveAttribute('data-card-state', 'saved');
  await expect(row(page, 'openai-key')).toHaveAttribute('data-state', 'key_failed', { timeout: 20_000 });
  await expect(row(page, 'openai-key').getByTestId(TID.setupAiRowAction)).toHaveText(t('setup.ai_finder.action.replace_key'));
  expect(await page.content()).not.toContain(FAKE_KEY);

  // Replace key → a fresh box; the new key passes and is chosen.
  await row(page, 'openai-key').getByTestId(TID.setupAiRowAction).click();
  const again = page.locator(`[data-testid="${TID.cardSecret}"]`).last();
  await expect(again).toHaveAttribute('data-card-state', 'asking');
  await expect(again.getByTestId(TID.cardSecretField)).toHaveValue('');
  await again.getByTestId(TID.cardSecretField).fill(NEXT_KEY);
  await again.getByTestId(TID.cardSecretSave).click();
  await expect(row(page, 'openai-key')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await finder(page).getByTestId(TID.setupAiUse).click();
  await expect(finder(page)).toContainText('Using OpenAI key');

  // Settings: "How it's paid" names the key and its saved date; Replace key opens the dialog with an empty field.
  await page.keyboard.press('Control+,');
  const paid = page.getByTestId(TID.settingsRowAccountAiPaid);
  await expect(paid).toContainText('Uses your OpenAI key · saved');
  await paid.getByRole('button', { name: t('settings.account.ai_paid.replace') }).click();
  const dialog = page.getByTestId(TID.dialogReplaceKey);
  await expect(dialog).toContainText(t('dialog.replace_key.title', { maker: 'OpenAI' }));
  await expect(dialog.getByTestId(TID.cardSecretField)).toHaveValue('');
  await dialog.getByTestId(TID.cardSecretField).fill(FAKE_KEY);
  await dialog.getByTestId(TID.dialogPrimary).click();
  await expect(dialog).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain(FAKE_KEY);
  expect(html).not.toContain(NEXT_KEY);
  await app.close();
});
