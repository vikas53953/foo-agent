// Spec: AT-077b (NEEDS YOU with a PENDING Approval card + a steer → the card SUPERSEDED with "You changed something, so I
// stopped. See the new card below.", the job back to WORKING, any new card replaces the old one; a later steer supersedes the
// card made for the earlier one the same way), 08-4 §26.5 items 3–4 (superseded_by stays NULL until the new card exists; the
// withdrawn line opens part 10), 08-2 §9.1 (only main's ApprovalGate writes approvals.state).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, tool, type JobHarness } from '../jobs/jobHarness';
import { BOOK_PLAN, bookRequest, gateTools } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const WITHDRAWN = 'A card was waiting; it has been withdrawn. Re-check the terms before asking again.';
const cardsInOrder = (x: JobHarness) =>
  x.db.prepare("SELECT * FROM cards WHERE type = 'approval' ORDER BY rowid").all() as Record<string, unknown>[];
const rows = (x: JobHarness) =>
  x.db.prepare('SELECT id, card_id, state, superseded_by FROM approvals ORDER BY rowid').all() as {
    id: string;
    card_id: string;
    state: string;
    superseded_by: string | null;
  }[];

describe('a steer while an Approval card waits (08-4 §26.5)', () => {
  it('AT-077b the steer supersedes the card through main, the job works again, and the new card replaces it; a second steer does it again', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Book a table' }),
        tool('fake.page', { site: 'table.example' }),
        bookRequest(),
        bookRequest('tc_000001', 'Toit', 2, { match: { purpose: 'step', promptIncludes: WITHDRAWN } }),
        bookRequest('tc_000001', 'Toit', 3, { match: { purpose: 'step', promptIncludes: 'make it 3' } }),
      ],
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    const first = cardsInOrder(h)[0]!;
    expect(first.state).toBe('PENDING');

    h.userSays('make it 2 people');
    await h.settle();
    let cards = cardsInOrder(h);
    expect(cards.map((c) => c.state)).toEqual(['SUPERSEDED', 'PENDING']);
    expect(JSON.parse(String(cards[0]!.payload)).superseded).toBe('steer');
    expect(t('cards.approval.line.superseded_steer')).toBe('You changed something, so I stopped. See the new card below.');
    let ap = rows(h);
    expect(ap[0]).toMatchObject({ state: 'SUPERSEDED', superseded_by: ap[1]!.id });
    expect(cards[1]!.supersedes_id).toBe(cards[0]!.id);
    expect(JSON.parse(String(cards[1]!.payload)).fields.partySize).toBe(2);
    expect(h.job()).toMatchObject({ state: 'needs_you', needs_you_card_id: cards[1]!.id });

    h.userSays('make it 3');
    await h.settle();
    cards = cardsInOrder(h);
    expect(cards.map((c) => c.state)).toEqual(['SUPERSEDED', 'SUPERSEDED', 'PENDING']);
    ap = rows(h);
    expect(ap[1]).toMatchObject({ state: 'SUPERSEDED', superseded_by: ap[2]!.id });
    expect(ran).toEqual([]);
  });

  it('AT-077b superseded_by stays NULL while no new card exists yet', async () => {
    h = jobHarness({
      script: [jobIntake(BOOK_PLAN, { title: 'Book a table' }), tool('fake.page', { site: 'table.example' }), bookRequest()],
      tools: { extra: gateTools() },
    });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    h.userSays('actually wait, make it Sunday');
    await h.settle();
    expect(rows(h)).toEqual([expect.objectContaining({ state: 'SUPERSEDED', superseded_by: null })]);
  });
});
