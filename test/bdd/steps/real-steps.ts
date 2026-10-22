// Production-only BDD steps. These deliberately do not call window.__fooTest or fake-AI helpers.
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { TID } from '../../../src/shared/testids';
import { test } from './real-fixture';
import type { RealBddRun } from './real-fixture';

const { Given, When, Then } = createBdd(test);

async function openFooChat(page: RealBddRun['page']): Promise<void> {
  await page.getByTestId(TID.chatlistRow).filter({ hasText: 'foo' }).first().click();
  await expect(page.getByTestId(TID.chatHeaderName)).toHaveText('foo');
}

Given('foo starts the production chat with an idle real profile', async ({ realRun }) => {
  await expect(realRun.page.getByTestId(TID.setupWelcomeTitle)).toHaveCount(0);
  await expect(realRun.page.getByTestId(TID.chatlistRow).filter({ hasText: 'foo' }).first()).toBeVisible({ timeout: 15_000 });
});

When('the user sends a benign production chat message', async ({ realRun }) => {
  await openFooChat(realRun.page);
  const prompt = 'Reply with one short sentence confirming this real BDD smoke.';
  await realRun.page.getByTestId(TID.composerField).fill(prompt);
  await realRun.page.keyboard.press('Enter');
  await expect(realRun.page.getByTestId(TID.bubbleMe).filter({ hasText: prompt })).toBeVisible();
});

Then('foo returns a completed production response', async ({ realRun }) => {
  const reply = realRun.page.getByTestId(TID.bubbleFoo).last();
  await expect(reply).toBeVisible({ timeout: 60_000 });
  await expect(reply).toContainText(/\S+/u);
  await expect(realRun.page.getByTestId(TID.threadThinking)).toHaveCount(0);
});

When('the user sends thanks in the idle production chat', async ({ realRun }) => {
  await openFooChat(realRun.page);
  realRun.fooCountBefore = await realRun.page.getByTestId(TID.bubbleFoo).count();
  await realRun.page.getByTestId(TID.composerField).fill('thanks!');
  await realRun.page.keyboard.press('Enter');
  const row = realRun.page.getByTestId(TID.bubbleMe).filter({ hasText: 'thanks!' }).last();
  await expect(row).toBeVisible();
  await expect(row.getByTestId(TID.bubbleReaction)).toContainText(/(?:👍|❤️)/u);
});

Then('foo reacts without posting a production reply', async ({ realRun }) => {
  await expect(realRun.page.getByTestId(TID.bubbleFoo)).toHaveCount(realRun.fooCountBefore ?? 0, { timeout: 10_000 });
  await expect(realRun.page.getByTestId(TID.threadThinking)).toHaveCount(0);
});
