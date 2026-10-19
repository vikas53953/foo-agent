// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts
// by hand, then the Tier R capture), CR-0020 (the AI step runs UX-02 before its owner M12 completes the chapter), 06-1 §2.2
// (the finder card, its rows, the choice block, the key box and the cap note), 06-1 §2.0 (the "Step n of 4" pill, the locked
// composer), 08-2 §6.6 (one tiny real request per AI). A first run (FOO_TEST_FIRST_RUN=1) with fake helpers in a stand-in home
// and the fake AI answering every test; the tests are held on the fake clock so "Testing…" can be captured.
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - UX-02-01: the five Looking rows last only until the engine answers detection (about a second on a first start), so the
//   step's words are checked from the first frame but no picture is taken (a timed picture would be flaky).
// - UX-02-02: the drawing shows an "OpenAI key" row offering a secret box; the app draws a key row only for a key found on this
//   PC (06-1 §2.2 row 4) and offers the box on "Your own key" (row 5).
// - UX-02-05: the drawing's Details panel ("Using Claude") is not opened; the card summary and the pill are captured.
// - UX-02-08: the paste catcher is the M2 composer's (04-2 §22.4, AT-007); it is not captured again here.
// - The walkthrough draws chapter 2 inside onboarding with the welcome card above (M12); a first run here opens on the finder
//   (CR-0020 (b) pick 1).
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { aiHome, finder, finderRow, firstRun } from '../../e2e/ai-step-world';
import { VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import { byTid, captureUx, quoted, rest, setTheme, settle, step, THEMES } from '../capture';

const HOLD_MS = 5_000;
const HELD_VERIFY: FakeLine = { match: { purpose: 'verify' }, reply: 'ready', delayMs: HOLD_MS, once: false };
const FINDER = `${byTid(TID.cardSetup)}[data-row-id="ai_finder"]`;
const FAKE_KEY = 'sk-proj-FAKE0ux020key00000000000000000000';

async function shoot(page: Page, id: string, sel: string): Promise<void> {
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

test('UX-02 · Find your AI: Claude and ChatGPT found, tested and chosen (UX-02-01…05), light and dark', async () => {
  test.setTimeout(180_000);
  const { app, page } = await firstRun(aiHome(['claude', 'codex']), [HELD_VERIFY]);

  await test.step('UX-02-01 · a card with five rows, each Looking…; the pill says Step 1 of 4', async () => {
    await expect(finder(page)).toBeVisible();
    await expect(page.getByTestId(TID.setupStepPill)).toHaveText(t('setup.step_pill.1'));
    await expect(finder(page)).toContainText(t('setup.ai_finder.lead'));
    // f: it installs nothing (AT-155a): no maker page was opened.
    expect(await app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? [])).toEqual([]);
  });

  await test.step('UX-02-02 · Claude and ChatGPT say Testing…; Gemini and the local AI are not here', async () => {
    await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'testing', { timeout: 20_000 });
    await expect(finderRow(page, 'codex-cli')).toHaveAttribute('data-state', 'testing');
    await expect(finderRow(page, 'gemini-cli')).toHaveAttribute('data-state', 'not_found');
    await expect(finderRow(page, 'ollama')).toHaveAttribute('data-state', 'not_found');
    await expect(finderRow(page, 'own-key')).toContainText(t('setup.ai_finder.action.add_key'));
    await shoot(page, 'UX-02-02', `${FINDER} [data-row-id="claude-cli"]`);
  });

  await test.step('UX-02-03 · two green ✓ works; the message box reads "Connect your AI first, then we can talk."', async () => {
    await page.evaluate((n) => window.__fooTest!.clock.advance(n), HOLD_MS);
    await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'works');
    await expect(finderRow(page, 'codex-cli')).toHaveAttribute('data-state', 'works');
    // The drawn words, from the walkthrough: "✓ works" and the locked composer line.
    const [worksWord, locked] = quoted(step('UX-02-03').s);
    await expect(finderRow(page, 'claude-cli')).toContainText(worksWord!.replace('✓ ', ''));
    await expect(page.getByTestId(TID.composer)).toContainText(locked!);
    await shoot(page, 'UX-02-03', byTid(TID.composer));
  });

  await test.step('UX-02-04 · "I\'ll use Claude…" with Use Claude / Pick another and the plan note', async () => {
    await expect(finder(page)).toContainText(t('setup.ai_finder.choose.many', { AI: 'Claude' }));
    await expect(finder(page).getByTestId(TID.setupAiUse)).toHaveText(t('setup.ai_finder.choose.use', { AI: 'Claude' }));
    await expect(finder(page).getByTestId(TID.setupAiPickAnother)).toBeVisible();
    await expect(finder(page)).toContainText(t('setup.ai_finder.note.plan', { AI: 'Claude' }));
    await shoot(page, 'UX-02-04', `${FINDER} ${byTid(TID.setupAiUse)}`);
  });

  await test.step('UX-02-05 · "✓ Using Claude (your AI)"; the pill moves to Step 2 of 4', async () => {
    await finder(page).getByTestId(TID.setupAiUse).click();
    await expect(finder(page)).toHaveAttribute('data-card-state', 'answered');
    await expect(finder(page)).toContainText(t('setup.ai_finder.chosen', { AI: 'Claude' }));
    await expect(page.getByTestId(TID.setupStepPill)).toHaveText(t('setup.step_pill.2'));
    await expect(page.getByTestId(TID.composer)).not.toContainText(t('setup.composer.locked'));
    await shoot(page, 'UX-02-05', FINDER);
  });
  await app.close();
});

test('UX-02 · Find your AI: nothing found, then your own key (UX-02-06, 07, 09), light and dark', async () => {
  test.setTimeout(180_000);
  const { app, page } = await firstRun(aiHome([]), [VERIFY_OK]);

  await test.step('UX-02-06 · "I couldn\'t find an AI on this PC yet. Which one do you use?" with sign-ins and a key', async () => {
    await expect(finder(page)).toContainText(t('setup.ai_finder.nothing.question'), { timeout: 20_000 });
    for (const key of ['chatgpt', 'claude', 'gemini', 'key'] as const)
      await expect(finder(page).getByTestId(TID.cardChoiceOption)).toContainText([t(`setup.ai_finder.nothing.${key}`)]);
    await shoot(page, 'UX-02-06', `${FINDER} ${byTid(TID.cardChoice)}`);
  });

  await test.step('UX-02-07 · the OpenAI key box: masked, with Save securely', async () => {
    await finder(page)
      .locator(`${byTid(TID.cardChoiceOption)}[data-option="key"]`)
      .click();
    await finder(page)
      .locator(`${byTid(TID.cardChoiceOption)}[data-option="openai-key"]`)
      .click();
    const box = page.getByTestId(TID.cardSecret).last();
    await expect(box).toHaveAttribute('data-card-state', 'asking');
    await expect(box).toContainText(t('setup.ai_finder.key.lead', { maker: 'OpenAI' }));
    await expect(box.getByTestId(TID.cardSecretField)).toHaveAttribute('type', 'password');
    await shoot(page, 'UX-02-07', byTid(TID.cardSecret));
  });

  await test.step('UX-02-09 · "Saved securely" and OpenAI key ✓ works, with the ₹1,000 cap line', async () => {
    const box = page.getByTestId(TID.cardSecret).last();
    await box.getByTestId(TID.cardSecretField).fill(FAKE_KEY);
    await box.getByTestId(TID.cardSecretSave).click();
    await expect(box).toHaveAttribute('data-card-state', 'saved');
    await expect(finderRow(page, 'openai-key')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
    await expect(finder(page)).toContainText('₹1,000');
    expect(await page.content()).not.toContain(FAKE_KEY);
    await shoot(page, 'UX-02-09', `${FINDER} [data-row-id="openai-key"]`);
  });
  await app.close();
});
