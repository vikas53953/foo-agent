// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), 07-1 J9 (book a table: options, one Approval card, booked once with proof), 05-1 §5.2
// Checklist (Watch live while foo's browser works, 06-3 §11.1), 05-2 §5.4 Choice card, §5.5 Approval card (booking variant,
// APPROVED / RUNNING "Approved by you at {time}. Doing it now…"), 05-3 §5.15 Proof chip (a number opens the popover),
// 01-articles Art. 3 (check never becomes do), Art. 6 (approvals are taps), 08-2 §9.4, §9.6 (the second look), 08-4 §25
// (an AI ask is a ChoiceCardSpec: label and detail, no photo), §26.1 (step phrases), §28.1 (request_approval), CR-0013 (the
// UX-12 rows; G-M9-05: UX-12-08, -10 and -11 need M7's once-routine and M8's calendar and drafts, so they stay pending).
// M9 T9: the real app on the fake AI books on the sandbox restaurant (test/sites/restaurant) with foo's real browser, in the
// foo chat from Fri 16 Oct, 9:05 AM, as the walkthrough draws it. UX-12-05 and -06 are also covered by the M5 seeded card
// (UX-12.booking.spec.ts); here they run on the real flow.
// Drawing-vs-app gaps (R1/R2/R4 disputes go to a CR, never into code):
// - the sandbox is TableJoy (tablejoy.test) with Coastline Kitchen, Saffron Table and Bay Leaf Pizzeria on Sun 18 Oct, a
//   ₹1,000 no-show fee and the code TJ8821 (08-3 §22.5 fakes only); the drawing has Pizza by the Bay, Sat 17 Oct, ₹500,
//   #PB-4471 on Zomato / EazyDiner;
// - UX-12-02 / -04: the checklist rows are the 08-4 §26.1 phrase catalogue's words ("Kept {n} {what} that fit {rule}",
//   "Book {what} and add it to your calendar"); there is no "Checking the 8:00 PM table is still free…" row: that line is the
//   Tiles card's (`cards.tiles.checking`), and the re-check here is the site's own booking page;
// - UX-12-03: the AI's ask is a ChoiceCardSpec (08-4 §25: label + detail, no photoRef), so the options are a Choice card, not
//   photo tiles;
// - UX-12-07: after the tap the card shows 05-2 §5.5.4's APPROVED / RUNNING line "Approved by you at {time}. Doing it now…";
//   the drawn "Booking… checked again: …" strip is not in 05-2's state table;
// - UX-12-09: a confirmation number opens 05-3 §5.15.2's popover (number, Copy, See in activity); the full-window attachment
//   viewer is 06-3 §13 (M13).
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import type { FakeLine } from '../../e2e/fakeAi';
import { SETUP_LINES, advanceUntil, lastCard, say, startBooking, stepLine, toolLine } from '../../e2e/m9-booking-world';
import { byTid, captureUx, frameAt, quoted, rest, rowOf, setTheme, settle, step, THEMES } from '../capture';

const START = '2026-10-16T09:05:00+05:30';
const at = (iso: string) => Date.parse(`${iso}+05:30`);
const tc = (n: number) => `tc_${String(n).padStart(6, '0')}`;
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

/** The intake of the drawn ask: the AI's plan in the 08-4 §26.1 phrases, the drawn rows' words where a slot carries them. */
const intake = (ask: string, plan: Record<string, unknown>[], delayMs = 0): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: ask },
  reply: act({ kind: 'job', title: 'Table for 4', plan, estimate: { minutes: 2 }, routeHint: ['browser'], needsApps: [] }),
  ...(delayMs ? { delayMs } : {}),
});

const rowSelOf = async (page: Page, sel: string): Promise<string> => {
  const id = await page
    .locator(sel)
    .last()
    .evaluate((el) => el.closest('[data-message-id]')?.getAttribute('data-message-id') ?? '');
  expect(id).not.toBe('');
  return rowOf(id);
};

async function shoot(page: Page, id: string, hl: string, opts: { at?: string; keepFocus?: boolean } = {}): Promise<void> {
  if (opts.at) await frameAt(page, opts.at);
  else await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  if (!opts.keepFocus) await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, hl, theme);
  }
  await setTheme(page, 'light');
}

/** Moves main's fake clock in small steps until `done()` holds (foo's browser runs on real time beside it). */
async function advanceWhile(page: Page, done: () => Promise<boolean>, realMs = 60_000): Promise<void> {
  const until = Date.now() + realMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('timed out moving the fake clock');
    await page.evaluate(() => window.__fooTest!.clock.advance(250));
    await page.waitForTimeout(100);
  }
}

test('UX-12 · Booking a restaurant (M9): steps UX-12-01, UX-12-02, UX-12-03, UX-12-04, UX-12-05, UX-12-06, UX-12-07 and UX-12-09 on the sandbox restaurant, light and dark', async () => {
  test.setTimeout(300_000);
  const ask = quoted(step('UX-12-01').s)[0]!;
  // "✓ Checked Zomato, EazyDiner and restaurant sites" → the check_sites slot.
  const sites = /Checked ([^·]+?) ·/u.exec(step('UX-12-02').s)![1]!;
  const w = await startBooking(
    (sb) => [
      // The second look (08-2 §9.6) answers after 5 s on the fake clock, so the card's APPROVED look can be drawn before the
      // one submit; the rest of the run uses the always-matching line of SETUP_LINES.
      {
        match: { purpose: 'second_look' },
        reply: `<say></say><act>${JSON.stringify({ match: true })}</act>`,
        delayMs: 5_000,
      },
      ...SETUP_LINES,
      // The intake waits 3 s on the fake clock, so the ask sits at 👀 until the clock moves.
      intake(
        ask,
        [
          { phraseKey: 'check_sites', slots: { sites }, route: 'browser' },
          { phraseKey: 'shortlist', slots: { n: '3', what: 'Italian places', rule: '8:00 PM' }, route: 'browser' },
          { phraseKey: 'wait_pick', slots: {}, route: 'browser' },
          { phraseKey: 'book_calendar', slots: { what: 'the table' }, route: 'browser' },
        ],
        3_000,
      ),
      toolLine('browser.open', { url: sb.url('restaurant', '/search?party=4&time=8:00 PM') }),
      toolLine('browser.snapshot', {}),
      stepLine({ kind: 'step_done', idx: 0 }),
      stepLine({ kind: 'step_done', idx: 1 }),
      stepLine({
        kind: 'ask',
        card: {
          question: 'Which place for Sunday?',
          options: [
            { label: 'Coastline Kitchen', detail: 'Marine Drive · ★ 4.5 · 8:00 PM free' },
            { label: 'Saffron Table', detail: 'Bandra West · ★ 4.3 · 8:00 PM free' },
            { label: 'Bay Leaf Pizzeria', detail: 'Colaba · ★ 4.4 · 8:00 PM free' },
          ],
        },
      }),
      // The pick: foo opens the place's booking page and reads it again (live slots change fast) before asking.
      stepLine({ kind: 'step_done', idx: 2 }),
      toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }, 20_000),
      toolLine('browser.snapshot', {}),
      stepLine({
        kind: 'request_approval',
        draft: {
          verb: 'book',
          fields: {
            verb: 'book',
            payee: 'Coastline Kitchen',
            partySize: 4,
            item: 'table',
            personalShared: ['name', 'phone'],
            cancelTerms: { freeUntil: at('2026-10-18T18:00:00'), refundable: true, feePaise: 1 },
            irreversible: false,
          },
          evidence: [{ field: 'cancelTerms', toolCallId: tc(4), quote: 'No-show fee ₹1,000', ref: 'e3' }],
        },
        submitRef: 'e3',
      }),
      stepLine({
        kind: 'done',
        result: 'Booked. Coastline Kitchen, Sun 18 Oct at 8:00 PM for 4. Your code is TJ8821.',
        proof: { kind: 'confirmation', code: 'TJ8821', site: 'tablejoy.test', seenInToolCallId: tc(5) },
      }),
    ],
    { at: START, chat: 'foo' },
  );
  const { page } = w;
  const log = page.getByTestId(TID.threadLog);
  const submits = async () => (await w.control()).counters.submits ?? 0;
  try {
    let checklistRow = '';

    await test.step('UX-12-01 · the ask, seen (👀); "book" means do it', async () => {
      const s = step('UX-12-01');
      expect(s.s).toContain('👀');
      await say(page, ask);
      const mine = log.locator(byTid(TID.bubbleMe), { hasText: ask }).last();
      await mine.waitFor();
      const row = await rowSelOf(page, `${byTid(TID.threadLog)} ${byTid(TID.bubbleMe)}:has-text("${ask}")`);
      await expect(page.locator(row).getByTestId(TID.bubbleBadge)).toHaveAttribute('data-state', 'seen', { timeout: 10_000 });
      await shoot(page, 'UX-12-01', row);
    });

    await test.step('UX-12-02 · one checklist, ticking itself; Watch live because foo is using its browser', async () => {
      const s = step('UX-12-02');
      expect(s.s).toContain('Waiting for you to pick one');
      const choice = lastCard(page, TID.cardChoice);
      await advanceUntil(page, choice);
      const checklist = lastCard(page, TID.cardChecklist);
      await expect(checklist).toContainText(t('cards.checklist.check_sites.done', { sites }));
      await expect(checklist).toContainText(t('cards.checklist.wait_pick.running'));
      await expect(checklist).toContainText(t('cards.checklist.book_calendar.next', { what: 'the table' }));
      await expect(checklist.getByTestId(TID.cardChecklistWatchLive)).toBeVisible();
      await expect(checklist.getByTestId(TID.cardChecklistStop)).toBeVisible();
      // f: it never phones anyone, and nothing was submitted while looking.
      expect(await submits()).toBe(0);
      checklistRow = await rowSelOf(page, `${byTid(TID.threadLog)} ${byTid(TID.cardChecklist)}`);
      await shoot(page, 'UX-12-02', `${checklistRow} ${byTid(TID.cardChecklist)}`, { at: checklistRow });
    });

    await test.step('UX-12-03 · the options, best fit first; nothing is held or booked', async () => {
      const s = step('UX-12-03');
      expect(s.f).toContain('Nothing is held or booked yet');
      const choice = lastCard(page, TID.cardChoice);
      await expect(choice).toHaveAttribute('data-card-state', 'asking');
      await expect(choice.getByTestId(TID.cardChoiceOption)).toHaveCount(3);
      await expect(choice.getByTestId(TID.cardChoiceOption).first()).toContainText('Coastline Kitchen');
      await expect(page.getByTestId(TID.cardApproval)).toHaveCount(0);
      expect(await submits()).toBe(0);
      const row = await rowSelOf(page, `${byTid(TID.threadLog)} ${byTid(TID.cardChoice)}`);
      await shoot(page, 'UX-12-03', `${row} ${byTid(TID.cardChoiceOption)}`);
    });

    await test.step('UX-12-04 · you pick; foo checks the table on the site again before asking', async () => {
      const s = step('UX-12-04');
      expect(s.f).toContain('checks again before asking');
      await lastCard(page, TID.cardChoice).getByTestId(TID.cardChoiceOption).first().click();
      const checklist = page.locator(`${checklistRow} ${byTid(TID.cardChecklist)}`);
      // The pick is taken and foo is working again (the re-check waits 20 s on the fake clock before it opens the page).
      await advanceWhile(page, async () => (await checklist.getByText(t('cards.checklist.wait_pick.done')).count()) > 0, 30_000);
      await expect(checklist.getByTestId(TID.cardChecklistWatchLive)).toBeVisible();
      await expect(page.getByTestId(TID.cardApproval)).toHaveCount(0);
      expect(await submits()).toBe(0);
      await shoot(page, 'UX-12-04', `${checklistRow} ${byTid(TID.cardChecklist)}`, { at: checklistRow });
    });

    let cardSel = '';
    await test.step('UX-12-05 · an Approval card with the exact terms; sharing your phone always asks', async () => {
      const s = step('UX-12-05');
      expect(s.s).toContain('Book this table?');
      const approval = lastCard(page, TID.cardApproval);
      await advanceUntil(page, approval);
      const cardId = await approval.getAttribute('data-card-id');
      cardSel = `${byTid(TID.cardApproval)}[data-card-id="${cardId}"]`;
      const card = page.locator(cardSel);
      await expect(card).toHaveAttribute('data-card-state', 'PENDING');
      await expect(card).toContainText(t('cards.approval.book.title.table'));
      await expect(card).toContainText('Coastline Kitchen');
      await expect(card).toContainText(`${t('cards.approval.book.row.no_show_fee')}₹1,000`);
      await expect(card.getByTestId(TID.cardApprovalApprove)).toHaveText(t('cards.approval.book.primary.table'));
      await expect(card.getByTestId(TID.cardApprovalChange)).toHaveText(t('cards.approval.button.change'));
      await expect(card.getByTestId(TID.cardApprovalNotNow)).toHaveText(t('cards.approval.button.not_now'));
      // c: sharing your phone always asks: a hard limit, no scope choice, and the card says so.
      await expect(card.getByTestId(TID.cardApprovalScope)).toHaveCount(0);
      await expect(card).toContainText(t('cards.approval.hard_limit_line'));
      // f: it waits for a tap; nothing is submitted.
      expect(await submits()).toBe(0);
      await shoot(page, 'UX-12-05', `${cardSel} ${byTid(TID.cardApprovalApprove)}`);
    });

    await test.step('UX-12-06 · a typed "yes" never approves; foo says to tap the card', async () => {
      const s = step('UX-12-06');
      expect(s.c).toContain('You type "yes"');
      const line = t('thread.approval_typed.approve');
      const reply = log.locator(byTid(TID.bubbleFoo), { hasText: line });
      await say(page, 'yes');
      await expect(async () => {
        await page.evaluate(() => window.__fooTest!.clock.advance(250));
        await expect(reply).toHaveCount(1, { timeout: 500 });
      }).toPass({ timeout: 30_000 });
      // f: typing never approves a card: it stays PENDING with its buttons, nothing submitted.
      await expect(page.locator(cardSel)).toHaveAttribute('data-card-state', 'PENDING');
      await expect(page.locator(cardSel).getByTestId(TID.cardApprovalApprove)).toBeEnabled();
      expect(await submits()).toBe(0);
      const row = await rowSelOf(page, `${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}:has-text("${line}")`);
      await shoot(page, 'UX-12-06', `${row} ${byTid(TID.bubbleFoo)}`);
    });

    await test.step('UX-12-07 · you tap Book table; foo double-checks the card against your words, then books once', async () => {
      const s = step('UX-12-07');
      expect(s.f).toContain('second look');
      const card = page.locator(cardSel);
      await card.getByTestId(TID.cardApprovalApprove).click();
      // The second look is in flight (it answers after 5 s on the fake clock): approved, nothing submitted yet.
      await expect(card).toHaveAttribute('data-card-state', /^(APPROVED|RUNNING)$/u);
      await expect(card).toContainText(/Approved by you at .+\. Doing it now…/u);
      expect(await submits()).toBe(0);
      const row = await rowSelOf(page, cardSel);
      await shoot(page, 'UX-12-07', cardSel, { at: row });
      // f: the second look matched, so no "Before I do this, one check…", and the site got exactly one submit.
      await advanceWhile(page, async () => (await card.getAttribute('data-card-state')) === 'COMPLETED');
      await expect(log).not.toContainText('Before I do this, one check');
      expect(await submits()).toBe(1);
    });

    await test.step('UX-12-09 · tap the proof chip to see what foo saw on the confirmation page', async () => {
      const s = step('UX-12-09');
      expect(s.f).toContain('7 days');
      const chip = log.getByTestId(TID.threadProofChip);
      await advanceUntil(page, chip);
      await expect(chip.last()).toHaveAttribute('data-state', 'confirmation');
      await expect(log).toContainText('Booked. Coastline Kitchen');
      expect(await submits()).toBe(1);
      await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
      await chip.last().click();
      const pop = page.locator(`[role="dialog"]:has(${byTid(TID.threadProofCopy)})`);
      await expect(pop).toBeVisible();
      await expect(pop).toContainText('TJ8821');
      await expect(pop.getByTestId(TID.threadProofCopy)).toHaveText(t('cards.proof_chip.popover.copy'));
      await expect(pop.getByTestId(TID.threadProofSeeActivity)).toHaveText(t('cards.proof_chip.popover.see_activity'));
      await page.mouse.move(640, 16);
      for (const theme of THEMES) {
        await setTheme(page, theme);
        await settle(page);
        await captureUx(page, 'UX-12-09', `[role="dialog"]:has(${byTid(TID.threadProofCopy)})`, theme);
      }
      await setTheme(page, 'light');
    });
  } finally {
    await w.close();
  }
});

test('UX-12 · Booking a restaurant (M9): step UX-12-12, a check stops at the options, light and dark', async () => {
  test.setTimeout(180_000);
  const s = step('UX-12-12');
  const [ask, answer] = quoted(s.s) as [string, string];
  const w = await startBooking(
    (sb) => [
      ...SETUP_LINES,
      intake(ask, [{ phraseKey: 'check_site', slots: { site: 'tablejoy.test' }, route: 'browser' }]),
      toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=2&time=8:00 PM') }),
      toolLine('browser.snapshot', {}),
      // foo read the live page, so the answer carries the page's picture as its proof (08-2 §8.3.8, 05-3 §5.15).
      toolLine('browser.screenshot', {}),
      stepLine({ kind: 'step_done', idx: 0 }),
      stepLine({ kind: 'done', result: answer, proof: { kind: 'screenshot', path: 'steps/shot-1.jpg', stepId: 'step_0' } }),
    ],
    { at: START, chat: 'foo' },
  );
  const { page } = w;
  const log = page.getByTestId(TID.threadLog);
  try {
    await test.step('UX-12-12 · "are there tables…?" stops at the answer and asks before booking', async () => {
      expect(s.f).toContain('never turns into "do"');
      await say(page, ask);
      const reply = log.locator(byTid(TID.bubbleFoo), { hasText: answer });
      await advanceUntil(page, reply);
      // f: a check never books: no Approval card, nothing submitted on the site.
      await expect(page.getByTestId(TID.cardApproval)).toHaveCount(0);
      expect((await w.control()).counters.submits ?? 0).toBe(0);
      // It was checked on the live page: a proof, not "Not checked live".
      await expect(log.getByTestId(TID.threadProofChip).last()).toHaveAttribute('data-state', 'screenshot');
      // The ask's badge settles on ✅ (done).
      const mine = log.locator(`[data-message-id]:has(${byTid(TID.bubbleMe)}:has-text("${ask}"))`).last();
      await expect(async () => {
        await page.evaluate(() => window.__fooTest!.clock.advance(250));
        await expect(mine.getByTestId(TID.bubbleBadge)).toHaveAttribute('data-state', 'done', { timeout: 500 });
      }).toPass({ timeout: 15_000 });
      const row = await rowSelOf(page, `${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}:has-text("${answer}")`);
      await shoot(page, 'UX-12-12', `${row} ${byTid(TID.bubbleFoo)}`);
    });
  } finally {
    await w.close();
  }
});
