// Accessibility sweep across what M1–M9, P1 and R1 built (10-acceptance-2 ART-26a "every surface passes axe in light and
// dark", 09 §9.12 themes): the chats with the most card kinds in the ux-world seed, the Settings screen and the Memory
// screen, each with axe-core in light and dark. The per-milestone specs audit their own surfaces; this one keeps the
// whole app honest as later work lands. Runs on the ux-world seed (08-3 §22.9); no AI is reached.
// Legacy mode: axe's default run opens a blank page for frame results, which Electron does not support.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, windowSize } from '../fidelity/capture';
import { launch } from './launch';
import { settleSeededJobs } from './m4-start';

const byTid = (id: string) => `[data-testid="${id}"]`;

async function settle(page: Page): Promise<void> {
  // Theme fades and entry motion must finish (or be cancelled): axe reads colours, and a mid-fade frame is not what
  // the user sees.
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
}

async function audit(page: Page, where: string): Promise<string[]> {
  const out: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => window.__fooTest!.theme(t), theme);
    if (process.platform !== 'win32') await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await settle(page);
    const r = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
    for (const v of r.violations) out.push(`${where} · ${theme} · ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }
  return out;
}

test('every main screen passes axe in light and dark: chats with cards, Settings, Memory', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const refs = await openWorld(app, page);
    await settleSeededJobs(page, refs);
    await windowSize(app, page, 1440, 900);
    const found: string[] = [];
    for (const chat of ['foo', 'Trips', 'Money', 'Family group']) {
      await openChat(page, chat);
      found.push(...(await audit(page, `chat ${chat}`)));
    }
    await page.getByTestId(TID.sidebarMore).click();
    await page.getByTestId(TID.sidebarMenuSettings).click();
    await expect(page.locator(byTid(TID.screenSettings))).toBeVisible({ timeout: 15_000 });
    found.push(...(await audit(page, 'Settings')));
    await page.keyboard.press('Escape');
    await page.getByTestId(TID.sidebarMore).click();
    await page.getByTestId(TID.sidebarMenuMemory).click();
    await expect(page.locator(byTid(TID.screenMemory))).toBeVisible({ timeout: 15_000 });
    found.push(...(await audit(page, 'Memory')));
    expect(found).toEqual([]);
  } finally {
    await app.close();
  }
});
