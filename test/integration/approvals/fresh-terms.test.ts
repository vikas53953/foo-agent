// Spec: AT-124 (PENDING, the price, time or recipient changes before it runs → SUPERSEDED, grey, struck amount, "The price
// changed, so I stopped. See the new card below." and a new PENDING card), 08-2 §9.4.2 (fresh terms re-read through a read
// tool right before executing; any difference → SUPERSEDED + a new PENDING card), §10.4 (any amount, up or down), X-125
// (second look → liveTermsCheck → write-ahead), 08-4 §26.5 item 3 (superseded_by set once the new card exists).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, step, type JobHarness } from '../jobs/jobHarness';
import { bookScript, gateTools, secondLookOk, TABLE_PAGE } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

/** In insert order: two cards made in the same fake-clock millisecond. */
const approvalCards = (x: JobHarness) =>
  x.db.prepare("SELECT * FROM cards WHERE type = 'approval' ORDER BY rowid").all() as Record<string, unknown>[];
const tap = (c: Record<string, unknown>) => ({ cardId: String(c.id), nonce: String(c.nonce), resolvedBy: 'tap' as const });
const payload = (c: Record<string, unknown>) =>
  JSON.parse(String(c.payload)) as { superseded?: string; fields: { amountPaise?: number }; approvalId: string };

describe('fresh terms right before executing (08-2 §9.4.2)', () => {
  it('AT-124 the total went from ₹2,400 to ₹2,600 → SUPERSEDED naming the price, a new PENDING card at ₹2,600, nothing booked', async () => {
    const ran: string[] = [];
    let page = TABLE_PAGE;
    h = jobHarness({
      script: bookScript([secondLookOk(), step({ kind: 'done', result: 'Booked your table.', unverified: true })]),
      tools: { extra: gateTools(ran, () => page) },
    });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    const first = approvalCards(h)[0]!;
    page = TABLE_PAGE.replace('₹2,400', '₹2,600');
    expect(h.approvals.approve({ ...tap(first), scope: 'once' }).ok).toBe(true);
    await h.settle();

    const cards = approvalCards(h);
    expect(cards.map((c) => c.state)).toEqual(['SUPERSEDED', 'PENDING']);
    expect(payload(cards[0]!).superseded).toBe('price');
    expect(t('cards.approval.body.superseded.price')).toBe('The price changed, so I stopped. See the new card below.');
    expect(payload(cards[1]!).fields.amountPaise).toBe(260_000);
    expect(cards[1]!.supersedes_id).toBe(cards[0]!.id);
    const rows = h.db.prepare('SELECT id, state, superseded_by, submitted_at FROM approvals ORDER BY rowid').all() as {
      id: string;
      state: string;
      superseded_by: string | null;
      submitted_at: number | null;
    }[];
    expect(rows[0]).toMatchObject({ state: 'SUPERSEDED', superseded_by: rows[1]!.id, submitted_at: null });
    expect(ran).toEqual([]);
    expect(h.job()).toMatchObject({ state: 'needs_you', needs_you_card_id: cards[1]!.id });

    // The new card, approved at the new price, runs once.
    h.approvals.approve({ ...tap(cards[1]!), scope: 'once' });
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    expect(h.db.prepare('SELECT state FROM approvals WHERE id = ?').pluck().get(rows[1]!.id)).toBe('COMPLETED');
  });

  it('AT-124 a lower price is a change too (any amount, up or down)', async () => {
    let page = TABLE_PAGE;
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools([], () => page) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    page = TABLE_PAGE.replace('₹2,400', '₹2,200');
    h.approvals.approve({ ...tap(approvalCards(h)[0]!), scope: 'once' });
    await h.settle();
    expect(approvalCards(h).map((c) => c.state)).toEqual(['SUPERSEDED', 'PENDING']);
  });

  it('the total can no longer be read → HELD cannot_check, nothing booked (fail closed)', async () => {
    const ran: string[] = [];
    let page = TABLE_PAGE;
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools(ran, () => page) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    page = 'Something went wrong. Try again later.';
    h.approvals.approve({ ...tap(approvalCards(h)[0]!), scope: 'once' });
    await h.settle();
    const held = approvalCards(h)[0]!;
    expect(held.state).toBe('HELD');
    expect(JSON.parse(String(held.payload)).held).toEqual({ reason: 'cannot_check', verbing: 'booking' });
    expect(ran).toEqual([]);
  });

  it('the same terms read again → the write-ahead and the one submit', async () => {
    const ran: string[] = [];
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools(ran) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    h.approvals.approve({ ...tap(approvalCards(h)[0]!), scope: 'once' });
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    // The read ran again right before the submit (08-2 §9.4.2).
    const tools = h.toolCalls().map((c) => c.tool);
    expect(tools.slice(-2)).toEqual(['fake.page', 'browser.submit']);
  });
});
