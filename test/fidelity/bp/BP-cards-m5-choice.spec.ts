// Spec: 11-fidelity §11.2.4 (Tier R app side), CR-0009 (M5 fidelity rows BP-CARD-03, BP-CARD-04, SV-21, SV-22), 05-1 §5.3 Choice,
// §5.4 Option tiles. The cards are seeded rows (test:card.seed) in foo's chat on the ux-world, worded as the Blueprint's
// card gallery minis draw them ("Which flight time works?" with two flights and "Something else…"; "Pick a stay · 12–14 Dec"
// with Taj, W Goa and Ronil and their prices). The minis are drawn in 350px panels without the card's Skip, time label or
// facts, so R2 boxes and the extra words are disputed by construction (CR-0003 §b, as the M4 card captures); R3 and R4
// count. Captures land in golden/out/app; the golden lane's Tier R step compares them with golden/ref/bp.
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { launch } from '../../e2e/launch';
import { SUBSCRIPTIONS } from '../../e2e/m5-choice-seeds';
import { byTid, captureBp, openChat, openWorld, rest, setTheme, settle, THEMES, windowSize } from '../capture';
import { checkSpecValues, readRows } from '../spec-values';

const base = { purpose: 'job', multi: false, aiReversible: false, reversible: false, livePrices: true };
const BP_CHOICE = {
  ...base,
  question: 'Which flight time works?',
  options: [
    { id: 'o1', label: '10:15 AM · IndiGo · ₹5,240', bestFit: true },
    { id: 'o2', label: '7:10 AM · Air India · ₹4,890' },
  ],
};
const BP_TILES = {
  ...base,
  question: 'Pick a stay · 12–14 Dec',
  options: [
    { id: 'o1', label: 'Taj', detail: '₹7,300', bestFit: true, photoRef: 'media/stay-1.jpg' },
    { id: 'o2', label: 'W Goa', detail: '₹7,950', photoRef: 'media/stay-2.jpg' },
    { id: 'o3', label: 'Ronil', detail: '₹4,100', photoRef: 'media/stay-3.jpg' },
  ],
};

async function seed(page: Page, type: 'choice' | 'tiles', payload: Record<string, unknown>): Promise<string> {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), { type, state: 'asking', payload });
  return `[data-card-id="${r.cardId}"]`;
}

test('M5 Blueprint captures for Tier R: BP-CARD-03, BP-CARD-04, both themes, and SV-21 / SV-22', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1280, 800);
  await openChat(page, 'foo');

  const shots: [string, string][] = [
    ['BP-CARD-03', `${byTid(TID.cardChoice)}${await seed(page, 'choice', BP_CHOICE)}`],
    ['BP-CARD-04', `${byTid(TID.cardTiles)}${await seed(page, 'tiles', BP_TILES)}`],
  ];
  for (const [id, sel] of shots) {
    const loc = page.locator(sel);
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
  // §5.4.1: at 600 wide the three tiles sit in one row.
  const tops = await page
    .locator(`${shots[1]![1]} ${byTid(TID.cardTilesOption)}`)
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  // SV-21 / SV-22 on the Choice card's Primary "Done" (multi-select, a row ticked so it is enabled).
  const multi = page.locator(await seed(page, 'choice', SUBSCRIPTIONS));
  await multi.scrollIntoViewIfNeeded();
  await multi.getByTestId(TID.cardChoiceOption).first().click();
  const rows = readRows().filter((r) => r.id === 'SV-21' || r.id === 'SV-22');
  const results = await checkSpecValues(page, { theme: 'light', rows });
  expect(results.filter((r) => !r.ok)).toEqual([]);
  expect(results).toHaveLength(2);
  await app.close();
});
