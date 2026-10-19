// Spec: 11-fidelity §11.2.4 (Tier R app side), §11.12 M4 fidelity exit (BP-CARD-02/12/15/18/19/20, X-161; SV-19, SV-20,
// SV-31), 05-1 §5.2 Checklist, 05-3 §5.12 Plan, §5.15–§5.16 Proof, §5.19 Stuck, §5.20 Error, §5.21 Spend cap. The cards come
// from the `m4-cards` seed set (the ux-world plus one of each M4 card in the Errands chat, no engine: M4-tickets T5 demo).
// The minis are drawn in 350px panels, so R2 boxes are disputed by construction (CR-0003 §b); R3 and R4 count. Captures land
// in golden/out/app; the golden lane's Tier R step compares them with golden/ref/bp.
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { launch } from '../../e2e/launch';
import { byTid, captureBp, openChat, rest, setTheme, settle, THEMES, windowSize } from '../capture';
import { checkSpecValues, readRows } from '../spec-values';

/** Blueprint id → the card in the Errands chat (08-0 §C test ids). */
const BP_TO_CARD: Record<string, string> = {
  'BP-CARD-02': byTid(TID.cardChecklist),
  'BP-CARD-12': byTid(TID.cardPlan),
  'BP-CARD-15': byTid(TID.threadProofChip),
  'BP-CARD-18': byTid(TID.cardStuck),
  // The first Error card in the chat is the error variant (the recovery card comes after it).
  'BP-CARD-19': byTid(TID.cardError),
  'BP-CARD-20': byTid(TID.cardSpendCap),
};

async function openCards(page: Page): Promise<void> {
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await page.evaluate(async () => {
    const t = window.__fooTest!;
    await t.clock.set('2026-10-16T09:41:00+05:30');
    return t.seed('m4-cards');
  });
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
}

test('M4 Blueprint captures for Tier R: BP-CARD-02, BP-CARD-12, BP-CARD-15, BP-CARD-18, BP-CARD-19, BP-CARD-20, both themes, and SV-19 / SV-20 / SV-31', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await openCards(page);
  await windowSize(app, page, 1280, 800);
  await openChat(page, 'Errands');

  for (const [id, sel] of Object.entries(BP_TO_CARD)) {
    const loc = page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded();
    await expect(loc).toBeVisible();
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await rest(page);
      await settle(page);
      await captureBp(page, id, sel, theme);
    }
    await setTheme(page, 'light');
  }

  // SV-19 has no machine form in spec-values.json (two widths): the standard card is `--card-w` = 440px (02 F5).
  const widths = await page
    .locator(`${byTid(TID.cardPlan)}, ${byTid(TID.cardStuck)}, ${byTid(TID.cardSpendCap)}`)
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(widths.length).toBe(3);
  for (const w of widths) expect(Math.abs(w - 440)).toBeLessThanOrEqual(0.5);

  // SV-31 is the full-motion value: a low-end machine starts in Basic motion (Settings.ts, X-150), where --m-card is --m-basic.
  await page.evaluate(() => (document.documentElement.dataset.motion = 'full'));
  const rows = readRows().filter((r) => r.id === 'SV-20' || r.id === 'SV-31');
  const results = await checkSpecValues(page, { theme: 'light', rows });
  expect(results.filter((r) => !r.ok)).toEqual([]);
  await app.close();
});
