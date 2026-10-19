// Spec: 11-fidelity §11.2.4 (Tier R app side), CR-0009 M5 fidelity exit (BP-CARD-08 Secret box, BP-CARD-09 paste catcher;
// the minis are drawn in 350px panels, so R2 boxes are disputed by construction; R3 and R4 count), SV-27 (`--line-input` on the
// Secret box field), 05-2 §5.8.1, 04-2 §22.4. Both are reached the user's way: a made-up key typed in foo's chat opens the
// paste catcher (BP-CARD-09); "Move to secret box" posts the Secret box with the key masked in its field (BP-CARD-08).
// Captures land in golden/out/app; the golden lane's Tier R step compares them with golden/ref/bp.
import { expect, test } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { settleSeededJobs } from '../../e2e/m4-start';
import { launch } from '../../e2e/launch';
import { byTid, captureBp, openChat, openWorld, rest, setTheme, settle, THEMES, windowSize } from '../capture';
import { checkSpecValues, readRows } from '../spec-values';

const KEY = 'sk-proj-FAKE0t2bp0capture00000000000000';

test('M5 Blueprint captures for Tier R: BP-CARD-08, BP-CARD-09, both themes, and SV-27', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1280, 800);
  await openChat(page, 'foo');

  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(KEY);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await captureBp(page, 'BP-CARD-09', byTid(TID.composerPaste), theme);
  }
  await setTheme(page, 'light');

  await page.getByTestId(TID.composerPasteMove).click();
  const sel = byTid(TID.cardSecret);
  await expect(page.locator(sel).last().getByTestId(TID.cardSecretField)).toHaveValue(KEY);
  // The card is captured at rest: the moved-in field keeps its value but not the focus ring.
  await page.locator(sel).last().getByTestId(TID.cardSecretField).blur();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await captureBp(page, 'BP-CARD-08', sel, theme);
    // SV-27 is `pending: M5` in spec-values.json until close-out flips it; measured here on the Secret box field.
    const rows = readRows()
      .filter((r) => r.id === 'SV-27')
      .map((r) => ({ ...r, pending: undefined }));
    const results = await checkSpecValues(page, { theme, rows });
    expect(results.filter((r) => !r.ok)).toEqual([]);
  }
  await app.close();
});
