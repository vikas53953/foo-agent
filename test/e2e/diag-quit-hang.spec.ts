// Spec: AT-451 (the batch-1 re-test sweep), 08-1 §2.3 (quit). TEMPORARY diagnostic, removed before merge: on windows-latest
// AT-451 hung for its whole 240 s and then the worker's teardown hung too (run 40425089090 shard 3), which points at
// app.close() never seeing the app's process close. This runs the same sweep 6 times; launch.ts logs what is still
// running when a close takes over 20 s. It asserts nothing.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { windowSize } from '../fidelity/capture';
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

const ROUNDS = 6;

for (let round = 1; round <= ROUNDS; round++)
  test(`DIAG · the batch-1 re-test sweep, round ${round}, timing every app.close()`, async () => {
    test.skip(process.platform !== 'win32', 'Windows only');
    test.setTimeout(240_000);
    const findings: string[] = [];
    const dirs = testDirs();
    const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
    mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
    writeFileSync(script, LINES.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const env = { FOO_FAKE_AI: script, FOO_TEST_AI_HOME: aiHome(['claude']), FOO_FEATURES: BATCH_1 };
    let app = await launch(dirs, [], { ...env, FOO_TEST_FIRST_RUN: '1' });
    let page = await app.firstWindow();
    // Every step is bounded, so a stuck one fails with its own line and call log instead of the whole test's timeout.
    page.setDefaultTimeout(30_000);
    await page.getByTestId(TID.titlebarStrip).waitFor();
    // At L the details panel opens by default (03-shell-2 §3.7.1): the width where QA saw an empty one open during setup.
    await windowSize(app, page, 1440, 900);
    const panelDuringSetup = await opens(page.getByTestId(TID.appPanel));

    // 1. The welcome card's "Privacy details" opens what leaves this PC, with only batch-1 services (F07, 06-1 §2.1).
    await page.getByTestId(TID.setupPrivacyDetails).click();
    const privacy = page.getByTestId(TID.dialogPrivacy);
    if (!(await opens(privacy))) findings.push('setup: "Privacy details" opens nothing');
    else {
      const words = await privacy.innerText();
      if (!words.includes(t('privacy.leaves.nothing_else'))) findings.push('setup privacy: no "Nothing else leaves this PC." line');
      if (/job details/i.test(words)) findings.push('setup privacy: says "job details" though batch 1 has no jobs');
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
    // The chat details panel has nothing to show in batch 1 (no Kept section, F17), so it never opens: not on its own during
    // setup, not from a header toggle, not from Ctrl+Shift+D, and the shortcuts sheet does not list the key (X-218 item 9).
    if (panelDuringSetup || (await page.getByTestId(TID.appPanel).count()))
      findings.push('an empty details panel opened on its own during setup');
    if (await page.getByTestId(TID.chatHeaderPanel).count()) findings.push('the chat header shows a Details toggle for an empty panel');
    await page.keyboard.press('Control+Shift+d');
    if (await opens(page.getByTestId(TID.appPanel))) {
      findings.push('Ctrl+Shift+D opens an empty details panel');
      await page.getByTestId(TID.appPanelClose).click();
    }
    await page.keyboard.press('Control+/');
    if (await opens(page.getByTestId(TID.dialogShortcuts))) {
      if (await page.locator(`[data-testid="${TID.dialogShortcutsRow}"][data-row-id="details"]`).count())
        findings.push('the shortcuts sheet lists Ctrl+Shift+D though the details panel is empty');
      await page.keyboard.press('Escape');
    } else findings.push('Ctrl+/ opens no shortcuts sheet');

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
    page.setDefaultTimeout(30_000);
    await page.getByTestId(TID.titlebarStrip).waitFor();
    const row = page.getByTestId(TID.chatlistRow).first();
    if (await row.count()) await row.click();
    const kept = page.getByTestId(TID.bubbleActionsBad).last();
    await kept.waitFor({ state: 'attached', timeout: 20_000 });
    if ((await kept.getAttribute('aria-pressed')) !== 'true') findings.push('👍 / 👎 is lost after a restart');
    await app.close();
    console.log(`DIAG round ${round} findings: ${findings.join(' | ') || 'none'}`);
  });
