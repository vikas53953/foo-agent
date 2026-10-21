// Spec: CR-0025 (Find your AI on a real PC): a helper app its maker refuses as out of date reads "needs an update" with
// [ Test again ], never "slow to answer" (pick 5); helper apps are tested one after another in ladder order (pick 3); a saved
// AI key removed from its Secret box drops its row (pick 7). Fakes in a stand-in home; every test goes to the fake AI.
import { expect, test } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finder, finderRow, firstRun } from './ai-step-world';
import { VERIFY_OK } from './fakeAi';

test('CR-0025: an out-of-date helper says "needs an update"; after the update, Test again makes it work', async () => {
  // Claude is tested first (ladder order, one at a time), so it gets the refusal; ChatGPT then passes.
  const { app, page } = await firstRun(aiHome(['claude', 'codex']), [
    { match: { purpose: 'verify' }, error: 'AI_CLI_INCOMPATIBLE', once: true },
    VERIFY_OK,
  ]);
  const claude = finderRow(page, 'claude-cli');
  await expect(claude).toHaveAttribute('data-state', 'needs_update', { timeout: 20_000 });
  await expect(claude).toContainText(t('setup.ai_finder.status.needs_update'));
  await expect(claude).not.toContainText(t('setup.ai_finder.status.slow'));
  await expect(finderRow(page, 'codex-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await expect(finder(page)).toContainText(t('setup.ai_finder.choose.one', { AI: 'ChatGPT' }));
  await claude.getByTestId(TID.setupAiRowAction).click();
  await expect(claude).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await expect(finder(page)).toContainText(t('setup.ai_finder.choose.many', { AI: 'Claude' }));
  await app.close();
});

const FAKE_KEY = 'fake-key-cr0025-remove-not-real';

test('CR-0025: removing a saved AI key from its Secret box drops its row from the finder', async () => {
  const { app, page } = await firstRun(aiHome([]));
  await expect(finder(page)).toContainText(t('setup.ai_finder.nothing.question'), { timeout: 20_000 });
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="key"]`).click();
  await finder(page).locator(`[data-testid="${TID.cardChoiceOption}"][data-option="anthropic-key"]`).click();
  const box = page.locator(`[data-testid="${TID.cardSecret}"]`).last();
  await box.getByTestId(TID.cardSecretField).fill(FAKE_KEY);
  await box.getByTestId(TID.cardSecretSave).click();
  await expect(finderRow(page, 'anthropic-key')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await box.getByTestId(TID.cardSecretRemove).click();
  await page.getByTestId(TID.dialogPrimary).click();
  await expect(finderRow(page, 'anthropic-key')).toHaveCount(0, { timeout: 10_000 });
  await app.close();
});
