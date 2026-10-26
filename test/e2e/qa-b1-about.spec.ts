// Spec: AT-451, CR-0061 (X-218, the batch-1 QA re-test fixes F24, F25, F07) and AT-452, CR-0062 (X-219, 👍 / 👎 kept on
// this PC, F16); 03-shell-1 §3.4.6 (preview strips markdown), 06-2 §6.11 (About), 06-1 §2.1 (Privacy details), 06-3 §16
// (What's new), §18.2 (Send a report), 04 §17.1 (👍). The re-test sweep on the batch-1 build: a table answer reads as words
// in the chat list, the header has no private toggle while `private` is off, About has its batch-1 rows and each opens its
// dialog, a report is saved as a zip, and 👍 is still pressed after a restart. Each finding is listed by name.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finderRow } from './ai-step-world';
import { VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

const BATCH_1 = 'install,ai,name,chat,settings';
const TABLE = 'Two plans:\n| Plan | Price | Data |\n|---|:---:|---|\n| Airtel | ₹649 | 75 GB |\n| Jio | ₹599 | 60 GB |';
const LINES: FakeLine[] = [VERIFY_OK, { match: { purpose: 'intake' }, chunks: [{ text: `<say>${TABLE}</say>` }] }];

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);
/** The dialogs load on first use, so give one a moment to appear. */
const opens = (l: Locator) =>
  l.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  );

test('AT-451 QA-B1-084 · re-test sweep: table preview, no private toggle, About rows open, report saved, 👍 / 👎 kept after restart', async () => {
  test.setTimeout(240_000);
  const findings: string[] = [];
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, LINES.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const env = { FOO_FAKE_AI: script, FOO_TEST_AI_HOME: aiHome(['claude']), FOO_FEATURES: BATCH_1 };
  let app = await launch(dirs, [], { ...env, FOO_TEST_FIRST_RUN: '1' });
  let page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();

  // 1. The welcome card's "Privacy details" opens what leaves this PC, with only batch-1 services (F07, 06-1 §2.1).
  await page.getByTestId(TID.setupPrivacyDetails).click();
  const privacy = page.getByTestId(TID.dialogPrivacy);
  if (!(await opens(privacy))) findings.push('setup: "Privacy details" opens nothing');
  else {
    const words = await privacy.innerText();
    if (!words.includes(t('privacy.leaves.nothing_else'))) findings.push('setup privacy: no "Nothing else leaves this PC." line');
    for (const off of ['privacy.leaves.voice', 'privacy.leaves.search', 'privacy.leaves.browsing'] as const)
      if (words.includes(t(off).slice(0, 12))) findings.push(`setup privacy: lists ${off} though that feature is off`);
    await privacy.getByTestId(TID.dialogPrimary).click();
  }

  // 2. Setup: a name, a face, a talk style.
  await page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  const use = page.getByTestId(TID.setupAiUse);
  if (await use.count()) await use.first().click();
  await page.getByTestId(TID.setupNameField).fill('Sunny');
  await page.getByTestId(TID.setupNameDone).click();
  await page.locator(`[data-testid="${TID.setupFaceTile}"][data-index="2"]`).click();
  await page.getByTestId(TID.setupFaceUse).click();
  await page.getByTestId(TID.cardChoice).last().getByTestId(TID.cardChoiceOption).nth(1).click();
  await expect(page.getByTestId(TID.composerField)).toBeEnabled({ timeout: 20_000 });

  // 3. No private-chat toggle while `private` is off (F25).
  if (await page.getByTestId(TID.chatHeaderPrivateToggle).count()) findings.push('the chat header shows a private toggle in batch 1');

  // 4. A table answer: the chat list reads its cells, never raw | or --- (F24).
  await page.getByTestId(TID.composerField).fill('compare two plans');
  await page.keyboard.press('Enter');
  const answer = page.getByTestId(TID.thread).getByTestId(TID.bubbleFoo).filter({ hasText: 'Airtel' });
  await expect.poll(async () => (await advance(page, 500), answer.count()), { timeout: 30_000 }).toBeGreaterThan(0);
  await advance(page, 2_000);
  await expect.poll(() => page.getByTestId(TID.chatlistRowPreview).first().innerText()).toContain('Airtel');
  const preview = await page.getByTestId(TID.chatlistRowPreview).first().innerText();
  if (/\||-{3}/.test(preview)) findings.push(`the chat-list preview shows raw table markdown: "${preview}"`);

  // 5. 👍 on the answer (F16).
  const good = page.getByTestId(TID.bubbleActionsGood).last();
  await answer.last().hover();
  await good.click();
  await expect(good).toHaveAttribute('aria-pressed', 'true');
  // Then 👎 with a chip: the popover opens, the vote turns over to 👎 (kept below too).
  const bad = page.getByTestId(TID.bubbleActionsBad).last();
  await bad.click();
  const pop = page.getByTestId(TID.bubbleFeedback);
  if (!(await opens(pop))) findings.push('👎 opens no "What went wrong?" popover');
  else {
    await pop.getByTestId(TID.bubbleFeedbackChip).first().click();
    await pop.getByTestId(TID.bubbleFeedbackSend).click();
    await expect(bad).toHaveAttribute('aria-pressed', 'true');
  }

  // 6. Settings → About: the version and the four batch-1 rows; no Updates or Repair row (F07).
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.screenSettings).waitFor();
  await page.getByTestId(TID.settingsNavAbout).click();
  if (
    !(await page
      .getByTestId(TID.settingsRowAboutVersion)
      .isVisible()
      .catch(() => false))
  )
    findings.push('About: no version line');
  for (const absent of [TID.settingsRowAboutUpdate, TID.settingsRowAboutRepair])
    if (await page.getByTestId(absent).count()) findings.push(`About shows ${absent}, which has nothing behind it yet`);
  const rows = [
    [TID.settingsRowAboutWhatsNew, TID.dialogWhatsNew],
    [TID.settingsRowAboutLeaves, TID.dialogPrivacy],
    [TID.settingsRowAboutLicences, TID.dialogLicences],
  ] as const;
  for (const [row, dialog] of rows) {
    const r = page.getByTestId(row);
    if (!(await r.count())) {
      findings.push(`About has no ${row}`);
      continue;
    }
    await r.click();
    const d = page.getByTestId(dialog);
    if (!(await opens(d))) {
      findings.push(`${row} opens nothing`);
      continue;
    }
    if ((await d.innerText()).split('\n').filter((l) => l.trim()).length < 3) findings.push(`${dialog} is empty`);
    await d.getByTestId(TID.dialogPrimary).click();
    await expect(d).toHaveCount(0);
  }

  // 7. Send a report: the preview shows the log, Save report writes a zip under {OUT}\reports\.
  await page.getByTestId(TID.settingsRowAboutReport).click();
  const report = page.getByTestId(TID.dialogReport);
  await expect(report.getByTestId(TID.dialogPrimary)).toBeEnabled({ timeout: 10_000 });
  const text = await report.getByTestId(TID.dialogReportPreview).inputValue();
  if (!text.startsWith('foo ')) findings.push(`report preview has no header line: "${text.slice(0, 40)}"`);
  await report.getByRole('button', { name: t('report.dialog.add_note') }).click();
  await report.getByTestId(TID.dialogReportNote).fill('The table looked fine.');
  await report.getByTestId(TID.dialogPrimary).click();
  const reports = join(dirs.FOO_OUT_DIR, 'reports');
  await expect
    .poll(() => (existsSync(reports) ? readdirSync(reports).filter((f) => /^foo-report-.*\.zip$/.test(f)).length : 0), {
      timeout: 10_000,
    })
    .toBe(1);
  await page.keyboard.press('Escape');

  // 8. Restart: the vote is still pressed on the answer (F16).
  await app.close();
  app = await launch(dirs, [], env);
  page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const row = page.getByTestId(TID.chatlistRow).first();
  if (await row.count()) await row.click();
  const kept = page.getByTestId(TID.bubbleActionsBad).last();
  await kept.waitFor({ state: 'attached', timeout: 20_000 });
  if ((await kept.getAttribute('aria-pressed')) !== 'true') findings.push('👍 / 👎 is lost after a restart');
  await app.close();

  expect(findings, findings.join('\n')).toEqual([]);
});
