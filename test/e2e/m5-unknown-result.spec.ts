// Spec: 05-2 §5.5.4 CHECKING → FAILED (no proof after 15 min: edge --bad, "I can't tell if {site} did it…", two Secondary
// buttons [ It went through ] [ It didn't ], no Try again; a tap collapses the card to "You said it went through." / "You
// said it didn't go through." and the card stays FAILED, Art. 7, 11), FAILED (site refused) keeps [ Try again ]; 05-2
// §5.7.2 Draft HELD (second look, Art. 10: "Before I send this, one check: you said {Monday}, the draft says {Tuesday 20
// Oct}. Which one?" + one button per value), 08-2 §9.6 (fail closed: no AI → held), 08-3 §16.1 (the look reads the card
// text). M5 T14, CR-0009 G-M5-32 (b), G-M5-33, G-M5-39. Cards are seeded through test:card.seed on the X-10 clock.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import type { ApprovalFields } from '../../src/shared/types';
import { byTid, openChat, openWorld } from '../fidelity/capture';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

const T = Date.parse('2026-10-16T09:41:00+05:30');
const MIN = 60_000;

const BOOK_FIELDS: ApprovalFields = {
  verb: 'book',
  payee: 'Pizza by the Bay',
  siteDomain: 'example.com',
  partySize: 4,
  amountPaise: 0,
  cancelTerms: { freeUntil: T + 9 * 60 * MIN, feePaise: 100_000, refundable: true },
  irreversible: false,
};
const booking = (state: 'CHECKING' | 'FAILED'): CardSeedRequest => ({
  type: 'approval',
  state,
  payload: {
    variant: 'standard',
    approvalId: '',
    verb: 'book',
    title: 'Book this table?',
    impact: 'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people',
    fields: BOOK_FIELDS,
    scopes: ['once'],
    hardLimit: true,
    expiresAt: T + 15 * MIN,
  },
  approval: { fields: BOOK_FIELDS, hardLimit: true, expiresAt: T + 15 * MIN, state, submittedAt: T },
});

const RAKESH = { name: 'Rakesh Example', address: 'rakesh@example.com' };
// The date sits past the 140 characters of the approval's summary: the look must read the whole card text (08-3 §16.1).
const BODY = `Hi Rakesh, ${'just confirming the plan for this month and the usual things we spoke about last week. '.repeat(2)}I’ll pay October’s rent on Tuesday 20 Oct. Thanks.`;
const draft = (): CardSeedRequest => {
  const fields: ApprovalFields = {
    verb: 'send',
    channel: 'email',
    recipients: [{ ...RAKESH, isNew: false, isGroup: false }],
    contentSummary: `Re: October rent\n${BODY.slice(0, 140)}`,
    irreversible: true,
  };
  return {
    type: 'draft',
    state: 'pending',
    payload: {
      approvalId: '',
      channel: 'email',
      to: { ...RAKESH, isNew: false },
      subject: 'Re: October rent',
      body: BODY,
      edited: false,
      sendAllowed: true,
      gmailDraftId: 'gd_t14',
    },
    approval: { fields, expiresAt: T + 60 * MIN },
  };
};

async function seedCard(page: Page, req: CardSeedRequest, tid: 'cardApproval' | 'cardDraft') {
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), req);
  const card = page.locator(`${byTid(TID[tid])}[data-card-id="${r.cardId}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return card;
}

test.describe('no AI (the engine is off)', () => {
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => {
    app = await launch();
    page = await app.firstWindow();
    await openWorld(app, page);
    await openChat(page, 'foo');
  });
  test.afterAll(async () => app?.close());

  test('a seeded CHECKING booking at +15 min: "I can’t tell…", [ It went through ] [ It didn’t ], no Try again; the tap collapses it and it stays FAILED', async () => {
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30'));
    const card = await seedCard(page, booking('CHECKING'), 'cardApproval');
    await expect(card).toContainText('Checking whether this went through… Don’t tap again.');
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:56:00+05:30'));
    await expect(card).toHaveAttribute('data-card-state', 'FAILED', { timeout: 5_000 });
    // G-M5-32 (b): no verified phone, so the call clause is left out with its words.
    await expect(card).toContainText('I can’t tell if example.com did it. Check example.com before trying again.');
    await expect(card).not.toContainText('Nothing was booked');
    await expect(card.getByTestId(TID.cardApprovalTryAgain)).toHaveCount(0);
    await expect(card.getByTestId(TID.cardApprovalWentThrough)).toHaveText('It went through');
    await expect(card.getByTestId(TID.cardApprovalDidNot)).toHaveText('It didn’t');
    await card.getByTestId(TID.cardApprovalWentThrough).click();
    await expect(card).toContainText('You said it went through.');
    await expect(card).toHaveAttribute('data-card-state', 'FAILED');
    await expect(card.getByTestId(TID.cardApprovalWentThrough)).toHaveCount(0);
    await expect(card.getByTestId(TID.cardApprovalDidNot)).toHaveCount(0);

    const other = await seedCard(page, booking('CHECKING'), 'cardApproval');
    await page.evaluate(() => window.__fooTest!.clock.advance(15 * 60_000));
    await expect(other.getByTestId(TID.cardApprovalDidNot)).toBeVisible({ timeout: 5_000 });
    await other.getByTestId(TID.cardApprovalDidNot).click();
    await expect(other).toContainText('You said it didn’t go through.');
    await expect(other).toHaveAttribute('data-card-state', 'FAILED');
  });

  test('a plain FAILED booking (the site refused) keeps "Nothing was booked." and [ Try again ]', async () => {
    const card = await seedCard(page, booking('FAILED'), 'cardApproval');
    await expect(card).toContainText('example.com didn’t accept it. Nothing was booked.');
    await expect(card.getByTestId(TID.cardApprovalTryAgain)).toBeVisible();
    await expect(card.getByTestId(TID.cardApprovalWentThrough)).toHaveCount(0);
  });

  test('a Draft send with no AI to double-check it is held, never sent (08-2 §9.6 fail closed)', async () => {
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T09:48:00+05:30'));
    const card = await seedCard(page, draft(), 'cardDraft');
    await card.getByTestId(TID.cardDraftSend).click();
    await expect(card).toHaveAttribute('data-card-state', 'undo_window');
    await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
    await expect(card).toContainText('I need your AI back to double-check this before sending. I’ll ask again when it’s back.', {
      timeout: 5_000,
    });
    await expect(card).toHaveAttribute('data-card-state', 'pending');
    await expect(card.getByTestId(TID.cardDraftSend)).toHaveCount(0);
    await expect(card.getByTestId(TID.cardDraftHeldOption)).toHaveCount(0);
    await page.evaluate(() => window.__fooTest!.clock.advance(10_000));
    await page.waitForTimeout(1_500);
    await expect(card).toHaveAttribute('data-card-state', 'pending');
  });
});

test.describe('fake AI', () => {
  const ASK = 'Email Rakesh that I’ll pay the rent on Monday';
  const SCRIPT: FakeLine[] = [
    VERIFY_OK,
    intake(ASK, 'Okay.'),
    {
      match: { purpose: 'second_look', promptIncludes: 'Tuesday 20 Oct' },
      reply: `<say></say><act>${JSON.stringify({ match: false, field: 'date', userSaid: 'Monday 19 Oct', actionHas: 'Tuesday 20 Oct' })}</act>`,
      once: false,
    },
  ];

  test('a Draft whose text says Tuesday when the user said Monday is held with one button per value; the user’s value supersedes it with a fresh draft', async () => {
    const dirs = testDirs();
    const { app } = await launchWithFakeAi(SCRIPT, { dirs });
    try {
      const page = await app.firstWindow();
      await openWorld(app, page, '2026-10-16T09:41:00+05:30');
      await openChat(page, 'foo');
      await page.getByTestId(TID.composerField).focus();
      await page.keyboard.type(ASK);
      await page.keyboard.press('Enter');
      await page.getByTestId(TID.threadLog).locator(byTid(TID.bubbleMe), { hasText: ASK }).last().waitFor();
      const card = await seedCard(page, draft(), 'cardDraft');
      await card.getByTestId(TID.cardDraftSend).click();
      await expect(card).toHaveAttribute('data-card-state', 'undo_window');
      await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
      await expect(card).toContainText('Before I send this, one check: you said Monday 19 Oct, the draft says Tuesday 20 Oct. Which one?', {
        timeout: 15_000,
      });
      expect(fakeTurns(dirs).some((t) => t.purpose === 'second_look' && t.prompt.includes('Tuesday 20 Oct'))).toBe(true);
      await expect(card).toHaveAttribute('data-card-state', 'pending');
      await expect(card.getByTestId(TID.cardDraftSend)).toHaveCount(0);
      const options = card.getByTestId(TID.cardDraftHeldOption);
      await expect(options).toHaveText(['Monday 19 Oct', 'Tuesday 20 Oct']);
      const before = await page.locator(byTid(TID.cardDraft)).count();
      await options.first().click();
      await expect(card).toHaveAttribute('data-card-state', 'superseded');
      await expect(page.locator(byTid(TID.cardDraft))).toHaveCount(before + 1);
      await expect(page.locator(byTid(TID.cardDraft)).last()).toHaveAttribute('data-card-state', 'pending');
    } finally {
      await app.close();
    }
  });
});
