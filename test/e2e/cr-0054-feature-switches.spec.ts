// Spec: CR-0054 (X-211): a batch-1 build (install, ai, name, chat, settings) shows no entry point of a feature it left off:
// no New helper, no menu rows for groups, memory, routines, ideas or activity; no Doing now, Using, Know or Spent in the
// details panel; only the batch-1 settings pages; the + menu keeps Emoji only; an empty composer shows Send, not the mic.
import { expect, test } from '@playwright/test';
import { TID } from '../../src/shared/testids';
import { openPanelChat } from './m4-start';
import { launch, testDirs } from './launch';
import { openWorld, windowSize } from '../fidelity/capture';

test('CR-0054: a batch-1 build hides every entry point of a feature it left off', async () => {
  const app = await launch(testDirs(), [], { FOO_FEATURES: 'install,ai,name,chat,settings' });
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);

  await expect(page.getByTestId(TID.sidebarNewHelper)).toHaveCount(0);
  await page.getByTestId(TID.sidebarMore).click();
  for (const tid of [
    'sidebarMenuNewHelper',
    'sidebarMenuNewGroup',
    'sidebarMenuMemory',
    'sidebarMenuRoutines',
    'sidebarMenuIdeas',
    'sidebarMenuActivity',
  ] as const)
    await expect(page.getByTestId(TID[tid])).toHaveCount(0);
  await expect(page.getByTestId(TID.sidebarMenuSettings)).toBeVisible();
  await expect(page.getByTestId(TID.sidebarMenuQuit)).toBeVisible();
  await page.keyboard.press('Escape');

  await openPanelChat(page, 'foo');
  for (const tid of ['appPanelDoing', 'appPanelUsing', 'appPanelKnow', 'appPanelSpent'] as const)
    await expect(page.getByTestId(TID[tid])).toHaveCount(0);

  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'send');
  await page.getByTestId(TID.composerAttach).click();
  await expect(page.getByTestId(TID.composerAttachMenuEmoji)).toBeVisible();
  for (const tid of ['composerAttachMenuFiles', 'composerAttachMenuScreenshot', 'composerAttachMenuSecret'] as const)
    await expect(page.getByTestId(TID[tid])).toHaveCount(0);
  await page.keyboard.press('Escape');

  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'account' } }),
  );
  await page.getByTestId(TID.screenSettings).waitFor();
  const nav = await page.locator('[data-testid^="settings-nav-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(nav).toEqual(['settings-nav-account', 'settings-nav-appearance', 'settings-nav-shortcuts', 'settings-nav-about']);
  await app.close();
});

test('CR-0054: with every feature on (no list) the same entry points show', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await expect(page.getByTestId(TID.sidebarNewHelper)).toBeVisible();
  await openPanelChat(page, 'foo');
  await expect(page.getByTestId(TID.appPanelDoing)).toBeVisible();
  await expect(page.getByTestId(TID.appPanelSpent)).toBeVisible();
  await app.close();
});
