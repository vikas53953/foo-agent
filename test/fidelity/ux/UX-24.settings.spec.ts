// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id), CR-0020 (the AI step
// runs UX-24-02 before its owner M13 completes the Settings chapter), 06-2 §6.0 (Settings frame), §6.1 (the "Your AI" rows:
// Using with its status line, Test now, Change; Backup AI). A first run on fake helpers chooses Claude with ChatGPT as backup,
// then Ctrl+, opens Settings on Account & your AI.
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - The drawing's Account page starts with the YOU rows (name, start with Windows); this step builds only the YOUR AI rows
//   (CR-0020 (b)), so the section sits at the top of the page.
// - "checked 2 min ago": the test has just run, so the line reads "checked just now".
import { expect, test } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { aiHome, finder, finderRow, firstRun } from '../../e2e/ai-step-world';
import { byTid, captureUx, rest, setTheme, settle, THEMES } from '../capture';

test('UX-24 · Settings: Account & your AI (UX-24-02), light and dark', async () => {
  test.setTimeout(120_000);
  const { app, page } = await firstRun(aiHome(['claude', 'codex']));
  await expect(finderRow(page, 'codex-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await finder(page).getByTestId(TID.setupAiUse).click();
  await expect(finder(page)).toHaveAttribute('data-card-state', 'answered');

  await test.step('UX-24-02 · Using: Claude (your AI) · ✓ works · Test now · Change; Backup AI: ChatGPT', async () => {
    await page.keyboard.press('Control+,');
    await expect(page.getByTestId(TID.screenSettings)).toHaveAttribute('data-page', 'account');
    await expect(page.getByTestId(TID.settingsNavAccount)).toHaveAttribute('aria-current', 'page');
    const using = page.getByTestId(TID.settingsRowAccountAiUsing);
    await expect(using).toContainText(t('settings.account.ai_using.value', { AI: 'Claude' }));
    await expect(using).toContainText('✓ works');
    await expect(using.getByRole('button', { name: t('settings.account.ai_using.test_now') })).toBeEnabled();
    await expect(using.getByRole('button', { name: t('settings.account.ai_using.change') })).toBeVisible();
    await expect(page.getByTestId(TID.settingsRowAccountAiBackup)).toContainText('ChatGPT');
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureUx(page, 'UX-24-02', `${byTid(TID.settingsRowAccountAiUsing)} button`, theme);
    }
  });
  await app.close();
});
