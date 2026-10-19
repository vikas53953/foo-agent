// Spec: 11-fidelity §11.2.4 (Tier R app side), CR-0010 (M6 fidelity rows BP-CARD-16, BP-SCR-09), 05-3 §5.17 (memory chip under
// a reply: "I’ll remember: {fact}" + Undo, `--bg-sunken`, `Brain` 16), 08-3 §12.4.2 (the chip is a `memory_chip` marker row,
// R-20), 06-2 §7 (the Memory page "What I know about you": search, + Add something, ⋯, filter chips, sections, rows).
// BP-CARD-16: the card gallery mini draws a foo bubble "Noted." and the chip "I'll remember: you're vegetarian on Tuesdays ·
// Undo". The chip comes from the real engine on the fake AI (08-3 §22.3): an intake `memory` remember whose <say> is the
// drawn "Noted.", so the marker row the engine writes sits under that reply; the capture runs from the bubble to the chip.
// BP-SCR-09: the screen gallery mini of the Memory page body, captured on the ux-world seed (Ctrl+M) before the chip's fact.
// Drawing-vs-app gaps (disputes go to a CR, never into code): the mini tints the chip accent where §5.17.1 says
// `--bg-sunken` / `--fg-2` (R3, as UX-10-02); the minis are drawn in 350px panels and screen thumbnails, so R2 boxes are
// disputed by construction (CR-0003 §b); the page mini's People / Preferences rows are its own sample, the seed's facts carry
// no kind and sit under FACTS (R1).
import { expect, test } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { launchWithFakeAi, VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import { settleSeededJobs } from '../../e2e/m4-start';
import { byTid, captureBp, captureBpRange, openChat, openWorld, rest, rowOf, setTheme, settle, THEMES, windowSize } from '../capture';

const ASK = 'remember I’m vegetarian on Tuesdays';
const FACT = "you're vegetarian on Tuesdays";
const NOTED = 'Noted.';
const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: `<say>${NOTED}</say><act>${JSON.stringify({ decision: { kind: 'memory', op: 'remember', text: FACT }, usedMemoryIds: [] })}</act>`,
  },
  { match: { purpose: 'memory_review' }, reply: `<act>${JSON.stringify({ ops: [{ op: 'nothing' }] })}</act>`, once: false },
];

test('M6 Blueprint captures for Tier R: BP-CARD-16 (memory chip under a reply) and BP-SCR-09 (Memory page), both themes', async () => {
  test.setTimeout(180_000);
  const { app } = await launchWithFakeAi(SCRIPT);
  const page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page, '2026-10-16T12:00:00+05:30'));
  await windowSize(app, page, 1280, 800);
  // BP-SCR-09 first, on the seed as it is
  await page.keyboard.press('Control+m');
  const screen = page.getByTestId(TID.screenMemory);
  await expect(screen).toHaveAttribute('data-state', 'list');
  await expect(screen).toContainText(t('screen.memory.title'));
  await expect(page.getByTestId(TID.memoryRow).first()).toBeVisible();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await captureBp(page, 'BP-SCR-09', byTid(TID.screenMemory), theme);
  }
  await setTheme(page, 'light');
  await screen.getByRole('button', { name: t('screen.memory.back') }).click();

  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);

  // BP-CARD-16
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  const chip = `${byTid(TID.threadMarker)}[data-state="memory"][data-kind="saved"]`;
  await expect(async () => {
    await page.evaluate(() => window.__fooTest!.clock.advance(250));
    await expect(page.locator(chip)).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator(chip)).toContainText(t('memory_chip.line.saved', { fact: FACT }));
  await expect(page.locator(chip).getByTestId(TID.threadMemoryUndo)).toHaveText(t('memory_chip.button.undo'));
  const chipRow = await page.locator(chip).evaluate((el) => el.closest('[data-message-id]')!.getAttribute('data-message-id')!);
  const reply = log.locator('[data-message-id]', { has: page.getByTestId(TID.bubbleFoo).filter({ hasText: NOTED }) });
  await expect(reply).toHaveCount(1);
  const replyRow = (await reply.getAttribute('data-message-id'))!;
  await log.evaluate((el) => (el.scrollTop = el.scrollHeight));
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await settle(page);
    await captureBpRange(page, 'BP-CARD-16', rowOf(replyRow), rowOf(chipRow), theme);
  }
  await setTheme(page, 'light');

  await app.close();
});
