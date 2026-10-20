// Spec: 10-acceptance-1 AT-080 (J18: "Stop everything" → all running jobs stop, open approval cards become WITHDRAWN, and
// routines keep their schedules), 08-2 §5.7 (stop flow), 08-4 §26.9 (stopFlow: "stop everything" → stopAll). M9 T8: a booking
// job on the sandbox restaurant is waiting on its Approval card when the user types "Stop everything"; nothing is booked.
import { expect, test } from '@playwright/test';
import { TID } from '../../src/shared/testids';
import { SETUP_LINES, advanceUntil, bookingIntake, lastCard, requestBooking, say, startBooking, toolLine } from './m9-booking-world';

const ASK = 'book a table for 4 at Coastline Kitchen on Sunday';

test('AT-080 "Stop everything" stops the booking job, withdraws its Approval card, and the routine keeps its schedule', async () => {
  test.setTimeout(180_000);
  const w = await startBooking((sb) => [
    ...SETUP_LINES,
    bookingIntake(ASK, 'Table at Coastline'),
    toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
    toolLine('browser.snapshot', {}),
    requestBooking(2),
  ]);
  const { page } = w;
  try {
    await say(page, ASK);
    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    const routine = () => w.db().prepare("SELECT state, next_run_at, schedule FROM routines WHERE title = 'Morning brief'").get();
    const before = routine();
    expect(before).toBeTruthy();

    await say(page, 'Stop everything');
    await expect(approval).toHaveAttribute('data-card-state', 'WITHDRAWN', { timeout: 15_000 });
    await expect(approval.getByTestId(TID.cardApprovalApprove)).toHaveCount(0);
    const job = w.db().prepare("SELECT state, stop_reason FROM jobs WHERE title = 'Table at Coastline'").get();
    expect(job).toEqual({ state: 'cancelled', stop_reason: 'stop_all' });
    const cardId = await approval.getAttribute('data-card-id');
    const { payload } = w.db().prepare('SELECT payload FROM cards WHERE id = ?').get(cardId) as { payload: string };
    const approvalId = (JSON.parse(payload) as { approvalId: string }).approvalId;
    await expect.poll(() => w.db().prepare('SELECT state FROM approvals WHERE id = ?').get(approvalId)).toEqual({ state: 'WITHDRAWN' });
    expect(routine()).toEqual(before);
    expect((await w.control()).counters.submits ?? 0).toBe(0);
  } finally {
    await w.close();
  }
});
