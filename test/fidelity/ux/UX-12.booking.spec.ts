// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), 05-2 §5.5 Approval card (booking variant: Charged now / No-show fee rows, "Free to cancel
// until", [ Book table ] [ Change ] [ Not now ], the hard-limit line "I'll always ask for this one." and the book footer),
// 01-articles Art. 6 (approvals are taps, not words: a typed "yes" gets "Tap Approve on the card so I know it's really you."),
// CR-0009 (UX-12-05 and UX-12-06 first tested in M5; the rest of chapter 12 is M9's booking).
// The frames are drawn in the foo chat on Fri 16 Oct from 9:05 AM. M5 has no booking site, so the Approval card is a seeded
// row (test:card.seed) with its approvals row, its title and impact built by the engine's approvalText from the fields; the
// "yes" is really typed and the engine's runner answers it (08-2 §5.2).
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code; CR-0009 row UX-12):
// - the drawn impact names the area ("Pizza by the Bay, Marine Drive"); ApprovalFields carries no area (08-2 §9.3), so the
//   slot stays empty; the drawn "Booked under: Vikas Sharma · +91 98••• ••210" row has no ApprovalFields value either
//   (08-0 §B.3; the row is M9's, with the booking site's form);
// - the drawing shows "Free to cancel until" as a third money row and "Expires 9:27 AM" in the header; 05-2 §5.5.1 draws it as
//   a line under the rows and puts the expiry in the footer ("Expires {time} · If you don't answer, I won't book it.");
// - UX-12-06 draws "Tap Book table on the card…"; 01-articles Art. 6, 05-1 §5.1 and 08-2 §5.2 fix the words "Tap Approve on
//   the card so I know it's really you." (`thread.approval_typed.approve`). The M9 ask bubble and checklist are not drawn by M5.
import { expect, test, type Page } from '@playwright/test';
import { approvalText } from '../../../src/engine/gate/approvalText';
import type { CardSeedRequest } from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import type { ApprovalFields } from '../../../src/shared/types';
import { launchWithFakeAi } from '../../e2e/fakeAi';
import { byTid, captureUx, openChat, openWorld, rest, rowOf, setTheme, settle, step, THEMES, windowSize } from '../capture';

const TZ = 'Asia/Kolkata';
const NOW = '2026-10-16T09:08:00+05:30';
const at = (iso: string) => Date.parse(`${iso}+05:30`);

const fields: ApprovalFields = {
  verb: 'book',
  channel: 'web',
  payee: 'Pizza by the Bay',
  siteDomain: 'tables.example.com',
  amountPaise: 0,
  currency: 'INR',
  when: { start: at('2026-10-17T20:00:00'), tz: TZ },
  partySize: 4,
  item: 'table',
  personalShared: ['name', 'phone'],
  cancelTerms: { freeUntil: at('2026-10-17T18:00:00'), feePaise: 50_000, refundable: true },
  irreversible: false,
};

const bookSeed = (): CardSeedRequest => {
  const expiresAt = at('2026-10-16T09:27:00');
  const text = approvalText(fields, { timeZone: TZ, now: Date.parse(NOW) });
  return {
    type: 'approval',
    state: 'PENDING',
    payload: {
      variant: 'standard',
      approvalId: '',
      verb: 'book',
      title: text.title,
      impact: text.impact,
      fields,
      scopes: ['once'],
      hardLimit: true,
      expiresAt,
    },
    approval: { fields, hardLimit: true, expiresAt },
  };
};

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

test('UX-12 · Booking a restaurant: steps UX-12-05 and UX-12-06, light and dark', async () => {
  test.setTimeout(180_000);
  // The fake AI is never asked: the runner answers a typed "yes" before any AI turn (08-2 §5.2).
  const { app } = await launchWithFakeAi([]);
  const page = await app.firstWindow();
  await openWorld(app, page, NOW);
  await windowSize(app, page, 1280, 800);
  await openChat(page, 'foo');
  const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), bookSeed());
  const sel = `${byTid(TID.cardApproval)}[data-card-id="${r.cardId}"]`;
  const card = page.locator(sel);

  await test.step('UX-12-05 · an Approval card with the exact terms; sharing your phone always asks', async () => {
    const s = step('UX-12-05');
    expect(s.s).toContain('Book this table?');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-card-state', 'PENDING');
    await expect(card).toContainText(t('cards.approval.book.title.table'));
    await expect(card.getByTestId(TID.cardApprovalImpact)).toHaveText('Pizza by the Bay · Sat 17 Oct, 8:00 PM · 4 people');
    await expect(card).toContainText(`${t('cards.approval.book.row.charged_now')}₹0`);
    await expect(card).toContainText(`${t('cards.approval.book.row.no_show_fee')}₹500`);
    await expect(card).toContainText(t('cards.approval.book.row.free_cancel_until', { time: 'Sat 17 Oct, 6:00 PM' }));
    await expect(card.getByTestId(TID.cardApprovalApprove)).toHaveText(t('cards.approval.book.primary.table'));
    await expect(card.getByTestId(TID.cardApprovalChange)).toHaveText(t('cards.approval.button.change'));
    await expect(card.getByTestId(TID.cardApprovalNotNow)).toHaveText(t('cards.approval.button.not_now'));
    // c: sharing your phone always asks: a hard limit, no scope choice, and the card says so.
    await expect(card.getByTestId(TID.cardApprovalScope)).toHaveCount(0);
    await expect(card).toContainText(t('cards.approval.hard_limit_line'));
    // f: "Waits for a tap. If you don't answer, it won't book."
    expect(s.f).toContain('Waits for a tap');
    await expect(card).toContainText(t('cards.approval.footer.book', { time: 'Fri 16 Oct, 9:27 AM' }));
    await shoot(page, 'UX-12-05', sel);
  });

  await test.step('UX-12-06 · a typed "yes" never approves; foo says to tap the card', async () => {
    const s = step('UX-12-06');
    expect(s.c).toContain('You type "yes"');
    const line = t('thread.approval_typed.approve');
    const reply = page.getByTestId(TID.threadLog).locator(byTid(TID.bubbleFoo), { hasText: line });
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type('yes');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(TID.threadLog).locator(byTid(TID.bubbleMe), { hasText: /^yes/ })).toHaveCount(1);
    // The engine's turn runs on the fake clock: advance it until the line posts.
    await expect(async () => {
      await page.evaluate((n) => window.__fooTest!.clock.advance(n), 250);
      await expect(reply).toHaveCount(1, { timeout: 500 });
    }).toPass({ timeout: 30_000 });
    // f: typing never approves a card: it stays PENDING with its buttons.
    expect(s.f).toContain('never approves a card');
    await expect(card).toHaveAttribute('data-card-state', 'PENDING');
    await expect(card.getByTestId(TID.cardApprovalApprove)).toBeEnabled();
    const id = await reply.evaluate((el) => el.closest('[data-message-id]')?.getAttribute('data-message-id') ?? '');
    expect(id).not.toBe('');
    await shoot(page, 'UX-12-06', `${rowOf(id)} ${byTid(TID.bubbleFoo)}`);
  });
  await app.close();
});
