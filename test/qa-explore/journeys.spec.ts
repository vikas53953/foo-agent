// Spec: 07-1 J1–J3 (first run), 06-1 §2.2–§2.3 (setup cards resume where you left off), 04 §15 (a reply cut off says so);
// Vikas 2026-10-26 "restart foo and verify persistence; interrupted operations". Multi-step journeys across a restart:
// quit during setup and during a reply, reopen, and check the user lands somewhere sensible with nothing lost or doubled.
import { expect, test } from '@playwright/test';
import { TID } from '../../src/shared/testids';
import { open, say, type World } from './world';

let w: World | undefined;
test.afterEach(async () => {
  await w?.stop();
  w = undefined;
});

async function reopen(first: World): Promise<World> {
  await first.stop();
  return open([], { reuse: first });
}

const cards = (w: World, row: string) => w.page.locator(`[data-testid="${TID.cardSetup}"][data-row-id="${row}"]`);

test('QA-X-J01 · quit on the Welcome card, reopen: one Welcome card, Let’s go still works', async () => {
  w = await open([], { firstRun: true });
  await w.page.getByTestId(TID.setupWelcomeStart).waitFor();
  w = await reopen(w);
  await w.page.waitForTimeout(1500);
  await w.page.screenshot({ path: test.info().outputPath('reopened.png') });
  await expect(w.page.getByTestId(TID.setupWelcomeStart), 'exactly one Let’s go').toHaveCount(1);
  await w.page.getByTestId(TID.setupWelcomeStart).click();
  await expect(w.page.getByTestId(TID.setupAiUse)).toBeVisible({ timeout: 20_000 });
});

test('QA-X-J02 · quit on the name card, reopen: setup resumes at the name, nothing doubled', async () => {
  w = await open([], { firstRun: true });
  await w.page.getByTestId(TID.setupWelcomeStart).click();
  await w.page.getByTestId(TID.setupAiUse).click({ timeout: 20_000 });
  await w.page.getByTestId(TID.setupNameField).waitFor();
  w = await reopen(w);
  await w.page.waitForTimeout(1500);
  await w.page.screenshot({ path: test.info().outputPath('reopened.png') });
  await expect(w.page.getByTestId(TID.setupNameField), 'the name card is back and usable').toBeVisible();
  expect(await cards(w, 'ai_finder').count(), 'the AI finder is not asked again').toBeLessThanOrEqual(1);
  await expect(w.page.getByTestId(TID.composerField)).toBeEditable();
});

test('QA-X-J03 · quit while foo is answering, reopen: the question is kept and the reply is not silently lost', async () => {
  w = await open(
    [
      {
        match: { purpose: 'intake', promptIncludes: 'QAX-J03' },
        chunks: [{ text: '<say>Part one. ' }, { text: 'Part two.</say>', delayMs: 20_000 }],
      },
    ],
    { firstRun: true },
  );
  await w.page.getByTestId(TID.setupWelcomeStart).click();
  await w.page.getByTestId(TID.setupAiUse).click({ timeout: 20_000 });
  await w.page.getByTestId(TID.setupSkipRest).click();
  await w.page.getByTestId(TID.composerField).fill('QAX-J03 tell me a long story');
  await w.page.keyboard.press('Enter');
  await w.page.waitForTimeout(1500);
  w = await reopen(w);
  await w.page.waitForTimeout(2500);
  await w.page.screenshot({ path: test.info().outputPath('reopened.png') });
  await expect(w.page.getByTestId(TID.bubbleMe).filter({ hasText: 'QAX-J03' }), 'my question survives').toHaveCount(1);
  // Either an answer, or a visible "cut off / try again" row: never a question left with no reply and no notice.
  const answered = await w.page
    .getByTestId(TID.bubbleFoo)
    .filter({ hasText: /Part one|Theek hai|cut off/i })
    .count();
  const thinking = await w.page.getByTestId(TID.threadThinking).count();
  expect(answered + thinking, 'an answer, a cut-off notice, or foo still thinking').toBeGreaterThan(0);
});

test('QA-X-J04 · name, face, theme and mute survive a restart', async () => {
  w = await open([say('QAX-J04', 'Hi!')], { firstRun: true });
  await w.page.getByTestId(TID.setupWelcomeStart).click();
  await w.page.getByTestId(TID.setupAiUse).click({ timeout: 20_000 });
  await w.page.getByTestId(TID.setupNameField).fill('Asha');
  await w.page.getByTestId(TID.setupNameDone).click();
  await w.page.locator('[data-testid="thread-log"] [role=radio]').nth(1).click({ timeout: 10_000 });
  await w.page.getByText('Use this face').click();
  await w.page.getByTestId(TID.cardChoiceOption).nth(0).click({ timeout: 10_000 });
  await w.page.getByTestId(TID.sidebarFooterSettings).click();
  await w.page.getByTestId(TID.settingsNavAppearance).click();
  await w.page.getByRole('radio', { name: 'Dark' }).click();
  await w.page.getByTestId(TID.screenBack).click();
  await w.page.getByTestId(TID.chatHeaderMore).click();
  await w.page.getByTestId(TID.chatHeaderMenuMute).click();
  await w.page.getByText('For 8 hours').click();
  const face = await w.page.getByTestId(TID.chatHeaderAvatar).innerText();
  w = await reopen(w);
  await w.page.waitForTimeout(1500);
  await expect(w.page.getByTestId(TID.chatHeader)).toContainText('Asha');
  await expect(w.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await w.page.getByTestId(TID.chatlistRow).first().getAttribute('aria-label')).toContain('muted');
  expect(await w.page.getByTestId(TID.chatHeaderAvatar).innerText()).toBe(face);
});
