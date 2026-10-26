// Spec: AT-453, CR-0063 (X-220, the batch-1 day-one fixes F21, F22); 02-2 §F15.9 (the living face, asleep in quiet hours),
// 03-shell-2 §3.6.2.1 (status row 11 "Quiet until {time}"), 03-shell-2 §3.6.5 (the unread divider), CR-0054 (feature
// switches). A batch-1 foo set up at 22:30 (the runner's zone, IST on Vikas's PC), inside the default quiet hours (22:00 to 07:00): it is never asleep, no
// "Quiet until" shows, and no "new message" divider stays on screen during or after setup. Each finding is listed by name.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { windowSize } from '../fidelity/capture';
import { aiHome, finderRow } from './ai-step-world';
import { VERIFY_OK } from './fakeAi';
import { launch, testDirs } from './launch';

const BATCH_1 = 'install,ai,name,chat,settings';

/**
 * 22:30 on 26 Oct in the zone foo will use (`locale.timeZone` defaults to the PC's zone, the same one this test runs in), so
 * the window's clock is inside the default quiet hours from its first paint whatever zone the runner has.
 */
function eveningHere(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const guess = Date.UTC(2026, 9, 26, 22, 30);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const shownAsUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return new Date(guess - (shownAsUtc - guess)).toISOString();
}

/** What a fresh batch-1 foo must not show at this point; each problem named with where it was seen. */
async function look(page: Page, where: string, findings: string[]): Promise<void> {
  const asleep = page.locator(`[data-mood="asleep"]`);
  if (await asleep.count()) findings.push(`${where}: foo's face is asleep`);
  const status = page.getByTestId(TID.chatHeaderStatus);
  if ((await status.count()) && /quiet until/i.test(await status.first().innerText()))
    findings.push(`${where}: the header says "Quiet until"`);
  if (await page.getByTestId(TID.threadUnreadDivider).count()) findings.push(`${where}: a "new message" divider is on screen`);
}

test('AT-453 QA-B1-085 · day one at 22:30: foo is awake, no "Quiet until", no "new message" divider during or after setup', async () => {
  test.setTimeout(180_000);
  const findings: string[] = [];
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, JSON.stringify(VERIFY_OK) + '\n');
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: script,
    FOO_TEST_AI_HOME: aiHome(['claude']),
    FOO_FEATURES: BATCH_1,
    FOO_TEST_FIRST_RUN: '1',
    FOO_TEST_NOW: eveningHere(),
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1440, 900);
  // A few renderer ticks so a quiet-hours face or status line would have shown.
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await look(page, 'welcome', findings);

  await page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  const use = page.getByTestId(TID.setupAiUse);
  if (await use.count()) await use.first().click();
  await page.getByTestId(TID.setupNameField).fill('Sunny');
  await look(page, 'name step', findings);
  await page.getByTestId(TID.setupNameDone).click();
  await page.locator(`[data-testid="${TID.setupFaceTile}"][data-index="2"]`).click();
  await page.getByTestId(TID.setupFaceUse).click();
  await look(page, 'face step', findings);
  await page.getByTestId(TID.cardChoice).last().getByTestId(TID.cardChoiceOption).nth(1).click();
  await expect(page.getByTestId(TID.composerField)).toBeEnabled({ timeout: 20_000 });
  await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
  await look(page, 'after setup', findings);
  await app.close();

  expect(findings, findings.join('\n')).toEqual([]);
});
