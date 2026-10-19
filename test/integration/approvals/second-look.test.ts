// Spec: AT-123 (APPROVED + second look mismatch → HELD with "Before I do this, one check: you asked for {X}, this is {Y}.
// Which one?" and two chips; the pick leads to APPROVED or DECLINED), 08-2 §9.6 (A deterministic, B the AI check on the
// primary, fail closed → cannot_check; C stored in approvals.second_look; the action's value → APPROVED proceeds, the
// user's own → the job re-prepares with it and builds a new card), CR-0009 G-M5-03 (HELD → own → DECLINED), 08-4 §28.6,
// X-125 (second look before the write-ahead; nothing is clicked while HELD).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../jobs/jobHarness';
import { BOOK_PLAN, bookRequest, gateTools, secondLookNo, secondLookOk } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const approvals = (x: JobHarness) =>
  x.db.prepare('SELECT state, second_look, submitted_at FROM approvals ORDER BY created_at, id').all() as {
    state: string;
    second_look: string | null;
    submitted_at: number | null;
  }[];
const payload = (c: Record<string, unknown>) =>
  JSON.parse(String(c.payload)) as { held?: Record<string, string>; fields: { partySize?: number } };
const tap = (c: Record<string, unknown>) => ({ cardId: String(c.id), nonce: String(c.nonce), resolvedBy: 'tap' as const });

const done = step({ kind: 'done', result: 'Booked your table.', unverified: true });

describe('second look after Approve (08-2 §9.6)', () => {
  it('AT-123 the user said 2, the card books 4 → HELD with the exact copy and two values; nothing is clicked', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: [jobIntake(BOOK_PLAN, { title: 'Book a table' }), tool('fake.page', { site: 'table.example' }), bookRequest(), done],
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 2 at Toit on Saturday');
    await h.settle();
    const card = h.cards('approval')[0]!;
    expect(h.approvals.approve({ ...tap(card), scope: 'once' }).ok).toBe(true);
    await h.settle();

    const held = h.cards('approval')[0]!;
    expect(held.state).toBe('HELD');
    expect(held.resolved_at).toBeNull();
    const p = payload(held).held!;
    expect(p).toEqual({ reason: 'mismatch', userSaid: '2 people', actionHas: '4 people' });
    expect(t('cards.approval.held.mismatch', { userSaid: p.userSaid!, actionHas: p.actionHas! })).toBe(
      'Before I do this, one check: you asked for 2 people, this is 4 people. Which one?',
    );
    const [ap] = approvals(h);
    expect(ap!.state).toBe('HELD');
    expect(JSON.parse(ap!.second_look!)).toMatchObject({
      deterministic: { ok: false, mismatches: ['people'] },
      held: { field: 'people', userSaid: '2 people', actionHas: '4 people' },
    });
    expect(ap!.submitted_at).toBeNull();
    expect(ran).toEqual([]);
    expect(h.job()).toMatchObject({ state: 'needs_you', needs_you_card_id: held.id });
    // A deterministic mismatch needs no AI call.
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM ai_turns WHERE purpose = 'second_look'").get()).toEqual({ n: 0 });
  });

  it('AT-123 picking the action’s value → APPROVED → RUNNING → submit once → COMPLETED, without asking again', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: [jobIntake(BOOK_PLAN, { title: 'Book a table' }), tool('fake.page', { site: 'table.example' }), bookRequest(), done],
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 2 at Toit on Saturday');
    await h.settle();
    const card = h.cards('approval')[0]!;
    h.approvals.approve({ ...tap(card), scope: 'once' });
    await h.settle();
    expect(h.approvals.heldPick({ ...tap(h.cards('approval')[0]!), optionId: 'action' }).ok).toBe(true);
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    expect(approvals(h).map((a) => a.state)).toEqual(['COMPLETED']);
    expect(h.job().state).toBe('done_unverified');
  });

  it('AT-123 picking the user’s own value → DECLINED, the job re-prepares with it and a fresh PENDING card follows', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Book a table' }),
        tool('fake.page', { site: 'table.example' }),
        bookRequest(),
        bookRequest('tc_000001', 'Toit', 2, { match: { purpose: 'step', promptIncludes: '→ A: 2 people' } }),
        secondLookOk(),
        done,
      ],
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 2 at Toit on Saturday');
    await h.settle();
    h.approvals.approve({ ...tap(h.cards('approval')[0]!), scope: 'once' });
    await h.settle();
    expect(h.approvals.heldPick({ ...tap(h.cards('approval')[0]!), optionId: 'own' }).ok).toBe(true);
    await h.settle();
    const cards = h.cards('approval');
    expect(cards.map((c) => c.state)).toEqual(['DECLINED', 'PENDING']);
    expect(payload(cards[1]!).fields.partySize).toBe(2);
    expect(ran).toEqual([]);
    expect(h.job()).toMatchObject({ state: 'needs_you', needs_you_card_id: cards[1]!.id });

    // The fresh card is approved and passes: one submit.
    h.approvals.approve({ ...tap(cards[1]!), scope: 'once' });
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    expect(approvals(h).map((a) => a.state)).toEqual(['DECLINED', 'COMPLETED']);
  });

  it('AT-123 the AI check finds a mismatch → HELD with its two values; the stored ai note names the field', async () => {
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Book a table' }),
        tool('fake.page', { site: 'table.example' }),
        bookRequest(),
        secondLookNo('item', 'window table', 'bar seats'),
        done,
      ],
      tools: { extra: gateTools() },
    });
    h.userSays('Book a window table for 4 at Toit on Saturday');
    await h.settle();
    h.approvals.approve({ ...tap(h.cards('approval')[0]!), scope: 'once' });
    await h.settle();
    const held = h.cards('approval')[0]!;
    expect(held.state).toBe('HELD');
    expect(payload(held).held).toEqual({ reason: 'mismatch', userSaid: 'window table', actionHas: 'bar seats' });
    expect(JSON.parse(approvals(h)[0]!.second_look!).ai).toEqual({ ok: false, note: 'item: window table ≠ bar seats' });
    const turn = h.db.prepare("SELECT purpose FROM ai_turns WHERE purpose = 'second_look'").all();
    expect(turn).toHaveLength(1);
  });

  it('the AI cannot answer (no valid act twice) → HELD cannot_check "…before booking…" (fail closed)', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Book a table' }),
        tool('fake.page', { site: 'table.example' }),
        bookRequest(),
        { match: { purpose: 'second_look' }, reply: 'not an act' },
        { match: { purpose: 'second_look' }, reply: 'still not an act' },
        done,
      ],
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    h.approvals.approve({ ...tap(h.cards('approval')[0]!), scope: 'once' });
    await h.settle();
    const held = h.cards('approval')[0]!;
    expect(held.state).toBe('HELD');
    expect(payload(held).held).toEqual({ reason: 'cannot_check', verbing: 'booking' });
    expect(t('cards.approval.held.cannot_check', { verbing: 'booking' })).toBe(
      'I need your AI back to double-check this before booking. I’ll ask again when it’s back.',
    );
    expect(ran).toEqual([]);
  });

  it('the second look passes → its result is kept on the approval and the action runs once', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Book a table' }),
        tool('fake.page', { site: 'table.example' }),
        bookRequest(),
        secondLookOk(),
        done,
      ],
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    h.approvals.approve({ ...tap(h.cards('approval')[0]!), scope: 'once' });
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    const [ap] = approvals(h);
    expect(JSON.parse(ap!.second_look!)).toMatchObject({ deterministic: { ok: true, mismatches: [] }, ai: { ok: true, note: '' } });
  });
});
