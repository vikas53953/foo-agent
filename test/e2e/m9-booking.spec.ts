// Spec: 10-acceptance-1 AT-036 (J9: "are there tables at an Italian place in Bandra Saturday" → foo shows options and never
// shows a booking Approval card until the user says "book" or taps an option and then "Book table"), 08-2 §9.4 (no Approval
// card for a verb the user never asked for: the offer Choice first), 05-2 §5.5.2 (the booking Approval card), AT-037 (one
// submit), AT-114a (the code as proof). M9 T8: the real app on the fake AI, foo's real browser on the sandbox restaurant.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import {
  ASK_TABLES,
  SETUP_LINES,
  advanceUntil,
  bookedLine,
  bookingIntake,
  lastCard,
  requestBooking,
  say,
  startBooking,
  stepLine,
  toolLine,
} from './m9-booking-world';

test('AT-036 options first; no booking Approval card until the user taps an option and says yes to booking, then Book table', async () => {
  test.setTimeout(180_000);
  const w = await startBooking((sb) => [
    ...SETUP_LINES,
    bookingIntake(ASK_TABLES),
    toolLine('browser.open', { url: sb.url('restaurant', '/') }),
    toolLine('browser.snapshot', {}),
    stepLine({
      kind: 'ask',
      card: {
        question: 'Which place for Saturday?',
        options: [
          { label: 'Coastline Kitchen', detail: 'Marine Drive · 4.5' },
          { label: 'Saffron Table', detail: 'Bandra West · 4.3' },
          { label: 'Bay Leaf Pizzeria', detail: 'Colaba · 4.4' },
        ],
      },
    }),
    toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
    toolLine('browser.snapshot', {}),
    // The AI asks to book before the user said "book": the gate offers instead (08-2 §9.4); no Approval card.
    requestBooking(4),
    requestBooking(4),
    bookedLine(5),
  ]);
  const { page } = w;
  try {
    await say(page, ASK_TABLES);
    const options = lastCard(page, TID.cardChoice);
    await advanceUntil(page, options);
    await expect(options.getByTestId(TID.cardChoiceOption)).toHaveCount(3);
    await expect(page.getByTestId(TID.cardApproval)).toHaveCount(0);
    await options.getByTestId(TID.cardChoiceOption).nth(0).click();

    // The offer ("Shall I book it?") is a Choice card; still no Approval card and nothing submitted.
    const offer = page.getByTestId(TID.threadLog).locator(`[data-testid="${TID.cardChoice}"][data-card-state="asking"]`);
    await advanceUntil(page, offer);
    await expect(page.getByTestId(TID.cardApproval)).toHaveCount(0);
    expect((await w.control()).counters.submits ?? 0).toBe(0);
    await offer.getByTestId(TID.cardChoiceOption).nth(0).click();

    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    await expect(approval.getByTestId(TID.cardApprovalApprove)).toHaveText(t('cards.approval.book.primary.table'));
    expect((await w.control()).counters.submits ?? 0).toBe(0);
    await approval.getByTestId(TID.cardApprovalApprove).click();

    const proof = page.getByTestId(TID.threadLog).getByTestId(TID.threadProofChip);
    await advanceUntil(page, proof);
    await expect(page.getByTestId(TID.threadLog)).toContainText('Booked. Coastline Kitchen');
    expect((await w.control()).counters.submits).toBe(1);
  } finally {
    await w.close();
  }
});
