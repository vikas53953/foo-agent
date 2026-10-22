// Spec: 07-journeys-1 §J1–§J22; every step below drives the Electron renderer
// through a user-visible control or an explicitly documented FOO_TEST seam.
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import copy from '../../../src/shared/copy/en-IN.json' with { type: 'json' };
import { TID } from '../../../src/shared/testids';
import { finder, finderRow } from '../../e2e/ai-step-world';
import { fakeTurns } from '../../e2e/fakeAi';
import { test } from './fixture';
import type { BddRun } from './fixture';
import { FLIGHTS, seed as choiceSeed } from '../../e2e/m5-choice-seeds';

const { Given, When, Then } = createBdd(test);
const byTid = (tid: string) => `[data-testid="${tid}"]`;

async function openChat(page: BddRun['page'], name: string): Promise<void> {
  await page.getByTestId(TID.chatlistRow).filter({ hasText: name }).first().click();
  await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
}

async function openChatPanel(page: BddRun['page']): Promise<void> {
  const toggle = page.getByTestId(TID.chatHeaderPanel);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.getByTestId(TID.appPanel)).toBeVisible();
}

function cardLocator(page: BddRun['page'], cardId: string) {
  return page
    .locator(
      `${byTid(TID.cardChoice)}[data-card-id="${cardId}"], ${byTid(TID.cardApproval)}[data-card-id="${cardId}"], ${byTid(TID.cardDraft)}[data-card-id="${cardId}"]`,
    )
    .last();
}

async function seedCard(page: BddRun['page'], payload: Record<string, unknown>) {
  const result = await page.evaluate((value) => window.__fooTest!.cardSeed(value as never), payload);
  const card = cardLocator(page, result.cardId);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return { card, result };
}

function approvalPayload(verb: 'book' | 'pay'): Record<string, unknown> {
  const expiresAt = Date.parse('2026-10-16T09:56:00+05:30');
  const fields =
    verb === 'book'
      ? {
          verb,
          payee: 'Pizza by the Bay',
          siteDomain: 'example.com',
          partySize: 4,
          amountPaise: 0,
          cancelTerms: { freeUntil: expiresAt - 7 * 60_000, feePaise: 100_000, refundable: true },
          irreversible: false,
        }
      : { verb, payee: 'Example Mobile', amountPaise: 1_250_00, irreversible: true };
  return {
    type: 'approval',
    state: 'PENDING',
    payload: {
      variant: 'standard',
      approvalId: '',
      verb,
      title: verb === 'book' ? 'Book this table?' : 'Pay this bill?',
      impact: verb === 'book' ? 'Pizza by the Bay · Sun 18 Oct, 8:00 PM · 4 people' : 'Example Mobile · October bill · ₹1,250',
      fields,
      scopes: ['once'],
      hardLimit: true,
      expiresAt,
    },
    approval: { fields, hardLimit: true, expiresAt },
  };
}

Given('foo starts the {string} flow with the {string} AI', async ({ bddRun }, journey: string, mode: string) => {
  expect(journey).toMatch(/^J(?:[1-9]|1[0-9]|2[0-2])$/);
  expect(mode).toBe(bddRun.mode);
  await expect(bddRun.page.getByTestId(TID.titlebarStrip)).toBeVisible();
});

When('the first launch settles on the welcome step', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J1');
  await expect(bddRun.page.getByTestId(TID.setupWelcomeTitle)).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.setupWelcomeFace)).toBeVisible();
});

Then('the welcome card has the first launch face and start action', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J1');
  await expect(bddRun.page.getByTestId(TID.setupWelcomeFace)).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.setupWelcomeStart)).toBeEnabled();
});

When('the AI finder runs detection for the two signed-in helpers', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J2');
  await bddRun.page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finder(bddRun.page)).toBeVisible();
  await expect(finderRow(bddRun.page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await expect(finderRow(bddRun.page, 'codex-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
});

Then('Claude is pre-selected and both helper tests are real requests', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J2');
  await expect(finder(bddRun.page)).toContainText('Claude');
  await expect(finder(bddRun.page).getByTestId(TID.setupAiUse)).toBeVisible();
  await expect(finderRow(bddRun.page, 'claude-cli')).toHaveAttribute('data-state', 'works');
  await expect(finderRow(bddRun.page, 'codex-cli')).toHaveAttribute('data-state', 'works');
});

async function reachNameCard(bddRun: BddRun): Promise<void> {
  await bddRun.page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finder(bddRun.page)).toBeVisible();
  await expect(finderRow(bddRun.page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  await finder(bddRun.page).getByTestId(TID.setupAiUse).click();
  await expect(bddRun.page.getByTestId(TID.setupNameField)).toBeVisible();
}

When('the user reaches the name and face setup cards', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J3');
  await reachNameCard(bddRun);
  await bddRun.page.getByTestId(TID.setupNameField).fill('Sunny');
  await bddRun.page.getByTestId(TID.setupNameDone).click();
  await expect(bddRun.page.getByTestId(TID.setupFaceGrid)).toBeVisible();
});

Then('the name answer opens four selectable face tiles', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J3');
  await expect(bddRun.page.getByTestId(TID.setupFaceTile)).toHaveCount(4);
  await expect(bddRun.page.getByTestId(TID.chatHeaderName)).toHaveText('Sunny');
});

When('the user answers the setup interview card', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J4');
  await reachNameCard(bddRun);
  await bddRun.page.getByTestId(TID.setupNameField).fill('Sunny');
  await bddRun.page.getByTestId(TID.setupNameDone).click();
  await expect(bddRun.page.getByTestId(TID.setupFaceGrid)).toBeVisible();
});

Then('the answered interview card collapses to the question and answer', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J4');
  const answered = bddRun.page.locator(`${byTid(TID.cardSetup)}[data-row-id="name"]`);
  await expect(answered).toContainText('Sunny');
  await expect(bddRun.page.getByTestId(TID.setupNameField)).toHaveCount(0);
});

When('the user requests the first bills task', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J5');
  await openChat(bddRun.page, 'foo');
  await bddRun.page.getByTestId(TID.composerField).fill('Find my bills due this week');
  await bddRun.page.keyboard.press('Enter');
  await expect(bddRun.page.getByTestId(TID.bubbleMe).filter({ hasText: 'Find my bills due this week' })).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.cardChecklist)).toBeVisible({ timeout: 15_000 });
});

Then('the first task renders a live checklist in the chat', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J5');
  await expect(bddRun.page.getByTestId(TID.cardChecklist)).toContainText('Bills');
  await expect(bddRun.page.getByTestId(TID.cardChecklistStep).first()).toBeVisible();
});

When('the user opens the morning brief schedule', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J6');
  await openChat(bddRun.page, 'foo');
  await openChatPanel(bddRun.page);
  await bddRun.page
    .getByTestId(TID.appPanelJobsTab)
    .getByRole('radio', { name: /Scheduled/i })
    .click();
});

Then('the scheduled panel names the morning brief routine', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J6');
  await expect(bddRun.page.getByTestId(TID.appPanelDoing)).toContainText('Morning brief');
});

When('the user sends an acknowledgement', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J7');
  await openChat(bddRun.page, 'foo');
  bddRun.fooCountBefore = await bddRun.page.getByTestId(TID.bubbleFoo).count();
  await bddRun.page.getByTestId(TID.composerField).fill('thanks!');
  await bddRun.page.keyboard.press('Enter');
  const row = bddRun.page.getByTestId(TID.bubbleMe).filter({ hasText: 'thanks!' }).last();
  await expect(row).toBeVisible();
  await expect(row.getByTestId(TID.bubbleReaction)).toContainText(/(?:👍|❤️|❤)/u);
});

Then('foo adds a thumbs up reaction without posting a reply', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J7');
  expect(await bddRun.page.getByTestId(TID.bubbleFoo).count()).toBe(bddRun.fooCountBefore);
  await expect(bddRun.page.getByTestId(TID.threadThinking)).toHaveCount(0);
});

When('the user opens a three-option choice card', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J8');
  const { card } = await seedCard(bddRun.page, choiceSeed(FLIGHTS) as unknown as Record<string, unknown>);
  await expect(card.getByTestId(TID.cardChoiceOption)).toHaveCount(3);
  await expect(card.getByTestId(TID.cardChoiceSomethingElse)).toBeVisible();
  await expect(card.getByTestId(TID.cardChoiceSkip)).toBeVisible();
});

Then('the first choice is marked Best fit and the card offers Skip', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J8');
  const card = bddRun.page.getByTestId(TID.cardChoice).last();
  await expect(card.getByTestId(TID.cardChoiceOption).first()).toContainText('Best fit');
  await expect(card.getByTestId(TID.cardChoiceSkip)).toBeVisible();
});

When('the user asks for restaurant options before booking', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J9');
  const { card } = await seedCard(
    bddRun.page,
    choiceSeed({
      purpose: 'job',
      question: 'Which place for Saturday?',
      options: [
        { id: 'o1', label: 'Coastline Kitchen' },
        { id: 'o2', label: 'Saffron Table' },
        { id: 'o3', label: 'Bay Leaf Pizzeria' },
      ],
    }) as unknown as Record<string, unknown>,
  );
  await expect(card.getByTestId(TID.cardChoiceOption)).toHaveCount(3);
  await expect(bddRun.page.getByTestId(TID.cardApproval)).toHaveCount(0);
});

Then('restaurant choices remain unbooked until an explicit booking approval', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J9');
  await expect(bddRun.page.getByTestId(TID.cardApproval)).toHaveCount(0);
  await expect(bddRun.page.getByTestId(TID.cardChoice).last()).toContainText('Coastline Kitchen');
});

When('the user opens a hotel payment approval', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J10');
  const { card } = await seedCard(bddRun.page, approvalPayload('pay'));
  await expect(card).toHaveAttribute('data-card-state', 'PENDING');
  await expect(card.getByTestId(TID.cardApprovalExpiry)).toBeVisible();
});

Then('the payment approval shows an expiry and a single approval action', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J10');
  const card = bddRun.page.getByTestId(TID.cardApproval).last();
  await expect(card.getByTestId(TID.cardApprovalExpiry)).toBeVisible();
  await expect(card.getByTestId(TID.cardApprovalApprove)).toBeVisible();
});

When('the user opens a bill payment approval', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J11');
  const { card } = await seedCard(bddRun.page, approvalPayload('pay'));
  await expect(card).toHaveAttribute('data-card-state', 'PENDING');
});

Then('the bill remains pending until the user approves it', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J11');
  const card = bddRun.page.getByTestId(TID.cardApproval).last();
  await expect(card).toHaveAttribute('data-card-state', 'PENDING');
  await expect(card.getByTestId(TID.cardApprovalApprove)).toBeVisible();
});

When('the user prepares an email draft', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J12');
  const { card } = await seedCard(bddRun.page, {
    type: 'draft',
    state: 'pending',
    payload: {
      approvalId: '',
      channel: 'email',
      to: { name: 'Rakesh Example', address: 'rakesh@example.com', isNew: false },
      subject: 'Re: October rent',
      body: 'Hi Rakesh, I’ll pay October’s rent.',
      edited: false,
      sendAllowed: true,
      gmailDraftId: 'bdd_draft',
    },
  });
  await expect(card).toHaveAttribute('data-card-state', 'pending');
  await expect(card.getByTestId(TID.cardDraftSend)).toBeVisible();
});

Then('the draft is visible and no send happens before the Send action', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J12');
  const card = bddRun.page.getByTestId(TID.cardDraft).last();
  await expect(card).toHaveAttribute('data-card-state', 'pending');
  await expect(card.getByTestId(TID.cardDraftSend)).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.cardApproval)).toHaveCount(0);
});

When('the user opens a sign-in handoff card', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J13');
  await bddRun.page.evaluate(() => window.__fooTest!.seed('m9-signin'));
  await expect(bddRun.page.getByTestId(TID.cardSignin)).toBeVisible();
});

Then('the sign-in card offers Take over without exposing credentials to the AI', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J13');
  const card = bddRun.page.getByTestId(TID.cardSignin).filter({ hasText: /irctc\.co\.in/i });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId(TID.cardSigninTakeOver)).toBeVisible();
  await expect(card).not.toContainText(/password|username/i);
});

When('the user opens the routine schedule', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J14');
  await openChat(bddRun.page, 'foo');
  await openChatPanel(bddRun.page);
  await bddRun.page
    .getByTestId(TID.appPanelJobsTab)
    .getByRole('radio', { name: /Scheduled/i })
    .click();
});

Then('the routine appears in the Scheduled segment', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J14');
  await expect(bddRun.page.getByTestId(TID.appPanelDoing)).toContainText('Morning brief');
});

When('the user opens a helper work panel', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J15');
  await openChat(bddRun.page, 'Trips');
  await openChatPanel(bddRun.page);
});

Then('the panel shows the helper job under In progress', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J15');
  const tabs = bddRun.page.getByTestId(TID.appPanelJobsTab);
  await expect(tabs.getByRole('radio', { name: /In progress/i })).toHaveAttribute('aria-checked', 'true');
  await expect(bddRun.page.getByTestId(TID.appPanelDoingRow).first()).toBeVisible();
});

When('the user opens the helper group chat', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J16');
  await openChat(bddRun.page, 'Family group');
  await openChatPanel(bddRun.page);
});

Then('the group panel shows members and hides private memory', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J16');
  await expect(bddRun.page.getByTestId(TID.appPanelMembers)).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.appPanelKnow)).toHaveCount(0);
  await expect(bddRun.page.getByTestId(TID.appPanelSpent)).toHaveCount(0);
});

When('the user opens Memory from the sidebar menu', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J17');
  await bddRun.page.getByTestId(TID.sidebarMore).click();
  await bddRun.page.getByTestId(TID.sidebarMenuMemory).click();
  await expect(bddRun.page.getByTestId(TID.screenMemory)).toHaveAttribute('data-state', 'list');
});

Then('every visible fact has its source and date', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J17');
  const rows = bddRun.page.getByTestId(TID.memoryRow);
  expect(await rows.count()).toBeGreaterThan(0);
  const lines = await rows.evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText));
  for (const line of lines) expect(line).toMatch(/You said|I guessed|From /);
});

When('the user stops the running helper task', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J18');
  await openChat(bddRun.page, 'Trips');
  bddRun.fooCountBefore = bddRun.dirs ? fakeTurns(bddRun.dirs).length : 0;
  await bddRun.page.getByTestId(TID.composerField).fill('stop');
  await bddRun.page.keyboard.press('Enter');
  await expect(bddRun.page.getByTestId(TID.bubbleMe).filter({ hasText: 'stop' })).toBeVisible();
});

Then('the stop command is recorded without another AI turn', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J18');
  if (bddRun.dirs) expect(fakeTurns(bddRun.dirs).length).toBe(bddRun.fooCountBefore);
  await expect(bddRun.page.getByTestId(TID.bubbleMe).filter({ hasText: 'stop' })).toBeVisible();
});

When('the network goes offline while the job is running', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J19');
  await bddRun.page.evaluate(() => window.__fooTest!.setOnline(false));
  await bddRun.page.evaluate(() => window.__fooTest!.clock.advance(10_000));
  await expect(bddRun.page.getByTestId(TID.bannerStrip)).toBeVisible({ timeout: 10_000 });
});

Then('the offline banner offers Try again and explains that jobs are saved', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J19');
  const banner = bddRun.page.getByTestId(TID.bannerStrip);
  await expect(banner).toContainText(copy['banner.offline.text']);
  await expect(banner).toContainText(copy['banner.offline.action']);
});

When('the user reopens foo after a running job was seeded', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J20');
  await expect(bddRun.page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await bddRun.page.getByTestId(TID.chatlistRow).first().click();
  await expect(bddRun.page.getByTestId(TID.chatHeaderName)).toBeVisible();
});

Then('the reopened app exposes the saved job state in the chat shell', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J20');
  await expect(bddRun.page.getByTestId(TID.chatHeaderName)).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.composerField)).toBeVisible();
});

When('the user opens Settings', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J21');
  await bddRun.page.keyboard.press('Control+,');
  await expect(bddRun.page.getByTestId(TID.screenSettings)).toBeVisible();
});

Then('Settings shows the account and connection sections', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J21');
  await expect(bddRun.page.getByTestId(TID.settingsNavConnections)).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.settingsRowAccountAiUsing)).toBeVisible();
});

When('the user searches the chat list for Trips', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J22');
  await bddRun.page.getByTestId(TID.sidebarSearchField).locator('input').fill('Trips');
  await expect(bddRun.page.getByTestId(TID.chatlistRow).filter({ hasText: 'Trips' })).toBeVisible();
});

Then('the search result contains Trips and excludes unrelated chats', async ({ bddRun }) => {
  expect(bddRun.journey).toBe('J22');
  await expect(bddRun.page.getByTestId(TID.chatlistRow).filter({ hasText: 'Trips' })).toBeVisible();
  await expect(bddRun.page.getByTestId(TID.chatlistRow).filter({ hasText: 'Money' })).toHaveCount(0);
});
