// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), 05-1 §5.3 (Choice card), 05-3 §5.2 (checklist), 08-4 §26.6 (typed answers), §26.7 (engine
// fields), X-155 (stepper, keys), CR-0009 (UX-10 in M5; G-M5-09: UX-10-07 needs Windows toasts and moves to M11; map review
// fix 3: UX-10-08, the 24 h stop, is M5-T8's).
// Steps 1–4 come from the real job runner on the fake AI (08-3 §22.3) in the Trips chat where chapter 10 is drawn, with the
// ux-world's own jobs settled first: the job checks, shortlists, then asks; typing "1" answers it and the job carries on.
// Steps 5 and 6 are seeded Choice rows (test:card.seed): M5's AI writes one question per ask (08-4 §25.1), so a stepper and the
// Money chat's multi-select are drawn from rows (M5-tickets T5 brief).
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - UX-10-01: the checklist's rows are catalogue phrases (08-4 §26.1): "Kept 3 flights that fit your times", not the drawn
//   "Kept 3 that fit"; the Trips chat also holds its seeded bubbles and the flights job of the ux-world.
// - UX-10-02: the memory chip "Used: hates early flights ✕" (05-3 §5.17) is not built yet (memory, M6), so hl is the card.
// - UX-10-04: the summary carries the whole option label, price included ("10:15 AM · IndiGo · ₹5,240"), as 05-1 §5.3.2
//   "{question} → {answer}" says; the drawing shortens it to "10:15 AM · IndiGo".
// - UX-10-05: the drawing's "Back · Next" is superseded by 05-1 §5.3.1 (no Next; Back from question 2), so question 1 shows
//   the pager and Skip only.
import { expect, test, type Locator, type Page } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { launchWithFakeAi, VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import { settleSeededJobs } from '../../e2e/m4-start';
import { BAG_STEPS, seed, SUBSCRIPTIONS } from '../../e2e/m5-choice-seeds';
import { byTid, captureUx, openChat, openWorld, rest, rowOf, setTheme, settle, step, THEMES, windowSize } from '../capture';

const ASK = 'find me a flight to Delhi on Fri 18 Dec, not too early';
const QUESTION = 'Which flight time works for Delhi on Fri 18 Dec?';
const OPTIONS = [
  { label: '10:15 AM · IndiGo · ₹5,240', detail: 'No early start, you said you hate those' },
  { label: '7:10 AM · Air India · ₹4,890', detail: 'Cheapest, leaves early' },
  { label: '1:35 PM · Akasa Air · ₹5,610' },
];
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: act({
      kind: 'job',
      title: 'Delhi flight',
      plan: [
        { phraseKey: 'check_sites', slots: { sites: '4 airlines' }, route: 'api' },
        { phraseKey: 'shortlist', slots: { n: '3', what: 'flights', rule: 'your times' }, route: 'api' },
        { phraseKey: 'wait_pick', slots: {}, route: 'api' },
        { phraseKey: 'show_before', slots: { acting: 'booking' }, route: 'api' },
      ],
      estimate: { minutes: 2 },
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 500 },
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: 500 },
  { match: { purpose: 'step' }, reply: act({ kind: 'ask', card: { question: QUESTION, options: OPTIONS } }), delayMs: 500 },
  // After the answer the job carries on (held, so it stays Working while captured).
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 2 }), delayMs: 3_600_000 },
];

async function advance(page: Page, ms: number, by = 250): Promise<void> {
  for (let at = 0; at < ms; at += by) {
    await page.evaluate((n) => window.__fooTest!.clock.advance(n), by);
    await page.waitForTimeout(20);
  }
}

/** Waits for a card the runner posts on the fake clock, keeping the newest row in view (UX-23 untilPosted). */
async function untilPosted(page: Page, log: Locator, card: Locator): Promise<void> {
  await expect(async () => {
    await advance(page, 250);
    await log.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(card).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
}

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

test('UX-10 · Choices: steps UX-10-01 to UX-10-06, light and dark', async () => {
  test.setTimeout(300_000);
  const { app } = await launchWithFakeAi(SCRIPT);
  const page = await app.firstWindow();
  const refs = await openWorld(app, page);
  await settleSeededJobs(page, refs);
  await windowSize(app, page, 1280, 800);
  await openChat(page, 'Trips');
  const log = page.getByTestId(TID.threadLog);
  const choice = log.locator(byTid(TID.cardChoice), { hasText: QUESTION });
  const checklist = log.locator(byTid(TID.cardChecklist), { hasText: '4 airlines' });

  await test.step('UX-10-01 · foo checks, keeps 3 and waits for the pick; the job needs you', async () => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(ASK);
    await page.keyboard.press('Enter');
    await untilPosted(page, log, choice);
    const rows = checklist.getByTestId(TID.cardChecklistStep);
    await expect(rows.nth(0)).toHaveAttribute('data-state', 'done');
    await expect(rows.nth(0)).toContainText('Checked 4 airlines');
    await expect(rows.nth(1)).toHaveAttribute('data-state', 'done');
    await expect(rows.nth(2)).toContainText('Waiting for you to pick one');
    const row = page.getByTestId(TID.chatlistRow).filter({ hasText: 'Trips' });
    await expect(row).toContainText(t('chatlist.row.pill.needs_you'));
    await shoot(page, 'UX-10-01', byTid(TID.cardChecklist));
  });

  await test.step('UX-10-02 · one Choice card, Best fit first; foo does not repeat the options in words', async () => {
    const s = step('UX-10-02');
    const rows = choice.getByTestId(TID.cardChoiceOption);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(OPTIONS[0]!.label);
    await expect(rows.nth(0)).toContainText(t('cards.choice.tag'));
    await expect(choice.getByTestId(TID.cardChoiceSomethingElse)).toHaveText(t('cards.choice.something_else'));
    await expect(choice.getByTestId(TID.cardChoiceSkip)).toHaveText(t('cards.choice.skip'));
    expect(s.s).toContain('Something else… · Skip');
    // f: no bubble repeats an option.
    await expect(log.locator(byTid(TID.bubbleFoo), { hasText: 'Air India' })).toHaveCount(0);
    const id = await choice.locator('xpath=ancestor::*[@data-message-id][1]').getAttribute('data-message-id');
    await shoot(page, 'UX-10-02', `${rowOf(id!)} ${byTid(TID.cardChoice)}`);
  });

  await test.step('UX-10-03 · "1" in the message box, the send button blue', async () => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type('1');
    await expect(page.getByTestId(TID.composerSend)).toBeEnabled();
    await shoot(page, 'UX-10-03', byTid(TID.composerSend));
  });

  await test.step('UX-10-04 · the card folds into one line and the job carries on', async () => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.press('Enter');
    await expect(async () => {
      await advance(page, 250);
      await expect(choice).toHaveAttribute('data-card-state', 'answered', { timeout: 500 });
    }).toPass({ timeout: 30_000 });
    await expect(choice).toContainText(`${QUESTION} → ${OPTIONS[0]!.label}`);
    await advance(page, 2_000);
    const row = page.getByTestId(TID.chatlistRow).filter({ hasText: 'Trips' });
    await expect(row).not.toContainText(t('chatlist.row.pill.needs_you'));
    await shoot(page, 'UX-10-04', byTid(TID.cardChoice) + `[data-card-id="${await choice.getAttribute('data-card-id')}"]`);
  });

  await test.step('UX-10-05 · up to three questions become a small stepper', async () => {
    const r = await page.evaluate((x) => window.__fooTest!.cardSeed(x), seed(BAG_STEPS, refs.trips));
    const card = log.locator(`${byTid(TID.cardChoice)}[data-card-id="${r.cardId}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId(TID.cardChoicePager)).toHaveText(t('cards.choice.pager', { k: 1, n: 2 }));
    await expect(card).toContainText('Checked bag?');
    await expect(card.getByTestId(TID.cardChoiceOption).nth(0)).toContainText('15 kg included');
    await expect(card.getByTestId(TID.cardChoiceOption).nth(1)).toContainText('Add 25 kg');
    await expect(card.getByTestId(TID.cardChoiceBack)).toHaveCount(0);
    await shoot(page, 'UX-10-05', `[data-card-id="${r.cardId}"] ${byTid(TID.cardChoicePager)}`);
  });

  await test.step('UX-10-06 · "which of these?" questions: tick boxes, then Done', async () => {
    await openChat(page, 'Money');
    const r = await page.evaluate((x) => window.__fooTest!.cardSeed(x), seed(SUBSCRIPTIONS, refs.money));
    const card = page.locator(`${byTid(TID.cardChoice)}[data-card-id="${r.cardId}"]`);
    await card.scrollIntoViewIfNeeded();
    const done = card.getByTestId(TID.cardChoiceDone);
    await expect(done).toBeDisabled();
    await card.getByTestId(TID.cardChoiceOption).nth(0).click();
    await card.getByTestId(TID.cardChoiceOption).nth(1).click();
    await expect(card.getByTestId(TID.cardChoiceOption).nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByTestId(TID.cardChoiceOption).nth(2)).toHaveAttribute('aria-checked', 'false');
    await expect(done).toBeEnabled();
    await shoot(page, 'UX-10-06', `[data-card-id="${r.cardId}"] ${byTid(TID.cardChoiceDone)}`);
    await done.click();
    await expect(card).toHaveAttribute('data-card-state', 'answered');
    await expect(card).toContainText(`${String(SUBSCRIPTIONS.question)} → Netflix and Spotify`);
  });
  await app.close();
});
