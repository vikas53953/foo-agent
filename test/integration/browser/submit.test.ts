// Spec: AT-037 (the user taps "Book table" → the booking is submitted at most once and the result carries a confirmation
// number or screenshot), AT-038 (the no-show fee changes between card and submit → nothing is booked and a new card shows the
// new fee), 08-2 §10.4 (ONE click after the write-ahead, no retry; the outcome classified: confirmation → COMPLETED, explicit
// refusal → FAILED, anything else → CHECKING, never re-submitted), §9.4.2 (the live terms read again right before executing),
// 08-4 §28.1 item 8, X-125. The sandbox restaurant (test/sites/restaurant) counts every POST in `submits`.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../jobs/jobHarness';
import { secondLookOk } from '../approvals/gateFlow';
import { bookingWorld, type BookingWorld } from './booking';

let h: JobHarness | null = null;
let w: BookingWorld | null = null;
afterEach(async () => {
  h?.close();
  h = null;
  await w?.close();
  w = null;
});

const BOOK_PAGE = '/book/coastline?party=4&time=8:00 PM';
const FEE_QUOTE = 'No-show fee ₹1,000';

/** The fake AI's request_approval for the table on the page read by tool call `tc` (08-4 §25.3); `e3` is "Book table". */
const bookTable = (tc = 'tc_000002') =>
  step({
    kind: 'request_approval',
    draft: {
      verb: 'book',
      fields: {
        verb: 'book',
        payee: 'Coastline Kitchen',
        partySize: 4,
        cancelTerms: { refundable: true, feePaise: 1 },
        irreversible: false,
      },
      evidence: [
        { field: 'payee', toolCallId: tc, quote: 'Coastline Kitchen' },
        // The fee is page text, not a control, so it has no ref of its own; the engine reads the amount from the quote.
        { field: 'cancelTerms', toolCallId: tc, quote: FEE_QUOTE, ref: 'e3' },
      ],
    },
    submitRef: 'e3',
  });

async function world(after = [step({ kind: 'done', result: 'Booked.', unverified: true })]): Promise<JobHarness> {
  w = await bookingWorld();
  h = jobHarness({
    script: [
      jobIntake([{ phraseKey: 'check_site', slots: { site: 'tablejoy.test' }, route: 'browser' }], { title: 'Book a table' }),
      tool('browser.open', { url: w.sb.url('restaurant', BOOK_PAGE) }),
      tool('browser.snapshot', {}),
      bookTable(),
      secondLookOk(),
      ...after,
    ],
    browser: w.browser,
  });
  h.userSays('Book a table for 4 at Coastline Kitchen on Sunday');
  await h.settle(20);
  return h;
}

const approvalCards = (x: JobHarness) =>
  x.db.prepare("SELECT * FROM cards WHERE type = 'approval' ORDER BY rowid").all() as Record<string, unknown>[];
const tap = (c: Record<string, unknown>) => ({
  cardId: String(c.id),
  nonce: String(c.nonce),
  resolvedBy: 'tap' as const,
  scope: 'once' as const,
});
const approvals = (x: JobHarness) =>
  x.db.prepare('SELECT id, state, submitted_at, superseded_by FROM approvals ORDER BY rowid').all() as Record<string, unknown>[];
const submitCall = (x: JobHarness) => x.toolCalls().find((c) => c.tool === 'browser.submit');

describe('AT-037 · Book table submits once and carries proof', () => {
  it('AT-037 one tap → one POST to the site, COMPLETED, and the result holds "Booking code TJ8821" and a step picture', async () => {
    const x = await world();
    const card = approvalCards(x)[0]!;
    expect(card.state).toBe('PENDING');
    expect((await w!.control()).counters.submits ?? 0).toBe(0);

    expect(x.approvals.approve(tap(card)).ok).toBe(true);
    await x.settle(20);

    expect((await w!.control()).counters.submits).toBe(1);
    expect(approvals(x)[0]).toMatchObject({ state: 'COMPLETED' });
    expect(approvals(x)[0]!.submitted_at).not.toBeNull();
    const call = submitCall(x)!;
    expect(call.outcome).toBe('ok');
    const result = JSON.parse(String(call.result)) as { outcome: string; code: string; page: string; screenshot?: string };
    expect(result.outcome).toBe('success');
    expect(result.code).toBe('TJ8821');
    expect(result.page).toContain('Booking code TJ8821');
    // §8.3.8: one masked picture after the submit, in this job's folder (the stored result hides the path).
    expect(result.screenshot).toBeDefined();
    expect(readdirSync(join(w!.dataDir, 'jobs', String(x.job().id), 'steps')).some((f) => f.startsWith('shot-'))).toBe(true);
    // A second tap on the finished card does nothing: still one POST.
    x.approvals.approve(tap(card));
    await x.settle(20);
    expect((await w!.control()).counters.submits).toBe(1);
  }, 60_000);

  it('AT-037 the site says the slot was just taken → FAILED "didn’t accept it. Nothing was booked.", one POST, no retry', async () => {
    const x = await world();
    await w!.toggles({ slotTaken: true });
    x.approvals.approve(tap(approvalCards(x)[0]!));
    await x.settle(20);
    expect((await w!.control()).counters.submits).toBe(1);
    expect(approvals(x)[0]!.state).toBe('FAILED');
    expect(t('cards.approval.body.failed.booked', { site: 'tablejoy.test' })).toBe('tablejoy.test didn’t accept it. Nothing was booked.');
  }, 60_000);

  it('AT-037 the page never says → CHECKING, one POST; the site’s "Your bookings" page shows it → COMPLETED, never submitted again', async () => {
    const x = await world();
    await w!.toggles({ confirmation: 'none' });
    x.approvals.approve(tap(approvalCards(x)[0]!));
    await x.settle(20);
    expect((await w!.control()).counters.submits).toBe(1);
    expect(submitCall(x)!.outcome).toBe('error');
    expect(JSON.parse(String(submitCall(x)!.result))).toMatchObject({
      outcome: 'unknown',
      historyUrl: w!.sb.url('restaurant', '/bookings'),
    });
    // G-M9-07: the history page, read by this job's own tools (never Gmail), shows the booking.
    expect(approvals(x)[0]!.state).toBe('COMPLETED');
    const tools = x.toolCalls().map((c) => c.tool);
    expect(tools.slice(tools.indexOf('browser.submit'))).toEqual(['browser.submit', 'browser.open', 'browser.snapshot']);
    expect(x.toolCalls().filter((c) => c.tool === 'browser.submit')).toHaveLength(1);
  }, 60_000);
});

describe('G-M9-07 · a booking the site never confirms', () => {
  it('the history page never shows it → checked every 60 s for 10 min, then FAILED "I couldn’t confirm the booking…", one POST', async () => {
    w = await bookingWorld();
    await w.toggles({ confirmation: 'none' });
    // The card is for a place the history page never lists, so no row ever confirms it.
    const other = step({
      kind: 'request_approval',
      draft: {
        verb: 'book',
        fields: {
          verb: 'book',
          payee: 'Bay Leaf Pizzeria',
          partySize: 4,
          cancelTerms: { refundable: true, feePaise: 1 },
          irreversible: false,
        },
        evidence: [{ field: 'cancelTerms', toolCallId: 'tc_000002', quote: FEE_QUOTE, ref: 'e3' }],
      },
      submitRef: 'e3',
    });
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'check_site', slots: { site: 'tablejoy.test' }, route: 'browser' }], { title: 'Book a table' }),
        tool('browser.open', { url: w.sb.url('restaurant', BOOK_PAGE) }),
        tool('browser.snapshot', {}),
        other,
        secondLookOk(),
        step({ kind: 'done', result: 'Booked.', unverified: true }),
      ],
      browser: w.browser,
    });
    h.userSays('Book a table for 4 at Bay Leaf Pizzeria on Sunday');
    await h.settle(20);
    const card = approvalCards(h)[0]!;
    const t0 = h.clock.now();
    h.approvals.approve(tap(card));
    await h.settle(2_000);
    expect((await w.control()).counters.submits).toBe(1);
    expect(approvals(h)[0]!.state).toBe('FAILED');
    expect(h.clock.now() - t0).toBeGreaterThanOrEqual(10 * 60_000);
    const history = h.toolCalls().filter((c) => c.tool === 'browser.open' && String(c.args).includes('/bookings'));
    // Every 60 s (fake clock; each look also takes real time here, so fewer than 11 fit) and none after 10 min.
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.length).toBeLessThanOrEqual(11);
    const at = history.map((c) => Number(c.started_at));
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(60_000);
    expect(at.at(-1)! - at[0]!).toBeLessThanOrEqual(10 * 60_000);
    const after = approvalCards(h)[0]!;
    expect(JSON.parse(String(after.payload)).unknownResult).toEqual({ unconfirmed: true });
    expect(t('cards.approval.failed.unconfirmed', { site: 'tablejoy.test' })).toBe(
      'I couldn’t confirm the booking. Check tablejoy.test before trying again.',
    );
  }, 120_000);
});

describe('AT-038 · the fee changed before submit', () => {
  it('AT-038 no-show fee ₹1,000 → ₹1,500 between card and tap → SUPERSEDED (fee), a new card at ₹1,500, nothing booked', async () => {
    const x = await world();
    const first = approvalCards(x)[0]!;
    expect(JSON.parse(String(first.payload)).fields.cancelTerms.feePaise).toBe(100_000);
    await w!.toggles({ noShowFeePaise: 150_000 });
    // The page the card was made from shows the new fee on its next load (the site changed it).
    const page = w!.browser.runtime.page(String(x.job().id))!;
    await page.reload();

    x.approvals.approve(tap(first));
    await x.settle(20);

    const cards = approvalCards(x);
    expect(cards.map((c) => c.state)).toEqual(['SUPERSEDED', 'PENDING']);
    expect(JSON.parse(String(cards[0]!.payload)).superseded).toBe('fee');
    expect(t('cards.approval.body.superseded.fee')).toBe('The fee changed, so I stopped. See the new card below.');
    expect(JSON.parse(String(cards[1]!.payload)).fields.cancelTerms.feePaise).toBe(150_000);
    expect(approvals(x)[0]).toMatchObject({ state: 'SUPERSEDED', submitted_at: null });
    expect((await w!.control()).counters.submits ?? 0).toBe(0);
    expect(submitCall(x)).toBeUndefined();
    // The fee was read from the job's page itself (readLiveTerms), not by a new tool call.
    expect(x.toolCalls().map((c) => c.tool)).toEqual(['browser.open', 'browser.snapshot']);
  }, 60_000);
});
