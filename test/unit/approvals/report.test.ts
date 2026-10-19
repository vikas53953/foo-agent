// Spec: 05-2 §5.5.4 CHECKING → FAILED (no proof after 15 min: "I can't tell if {site} did it…" with [ It went through ]
// [ It didn't ]; either answer collapses the card and sets the action's activity `outcome` to done / failed with
// `resolved_by='tap'`; the card state stays FAILED, Article 11), 08-2 §10.5 + CR-0009 G-M5-33 (main's 15 min move),
// Art. 7 (never re-submitted). M5 T14: main's `ApprovalGate.report` (`approval:report`, CR-0009 G-M5-39).
import { describe, expect, it } from 'vitest';
import { CHECKING_MS } from '../../../src/main/approvals/ApprovalGate';
import { gateHarness, T0, type GateHarness } from './gateHarness';

/** A booking approved, written ahead (RUNNING) and cut: CHECKING, as main's restart sweep leaves it (08-2 §5.9 step 2). */
function checking(h: GateHarness) {
  const o = h.open();
  h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
  h.gate.transition(o.approvalId, 'RUNNING', { submittedAt: T0 });
  h.gate.recoverSubmitted();
  return o;
}
const nonceOf = (h: GateHarness, cardId: string) => String(h.card(cardId).nonce);
const payloadOf = (h: GateHarness, cardId: string) => JSON.parse(String(h.card(cardId).payload)) as Record<string, unknown>;
function bookedRow(h: GateHarness, approvalId: string, outcome: 'unknown' | 'done') {
  const id = `act_${outcome}_${approvalId}`;
  h.db
    .prepare(
      `INSERT INTO activity (id, at, kind, event, actor, chat_id, job_id, approval_id, summary, outcome)
       VALUES (?, ?, 'booked', 'booked', 'foo', ?, ?, ?, 'Booked Pizza by the Bay', ?)`,
    )
    .run(id, T0, h.chatId, h.jobId, approvalId, outcome);
  return id;
}

describe('CHECKING → FAILED and the user’s answer (05-2 §5.5.4, G-M5-39)', () => {
  it('15 min in CHECKING without proof → FAILED marked unknownResult, so the card never claims "Nothing was booked."', () => {
    const h = gateHarness();
    const o = checking(h);
    h.clock.now = T0 + CHECKING_MS - 1;
    expect(h.gate.expireTick()).toEqual([]);
    h.clock.now = T0 + CHECKING_MS;
    expect(h.gate.expireTick()).toEqual([o.approvalId]);
    expect(h.approval(o.approvalId).state).toBe('FAILED');
    expect(h.card(o.cardId).state).toBe('FAILED');
    expect(payloadOf(h, o.cardId).unknownResult).toEqual({});
  });

  it('It went through → the activity row says done, the card answer is kept with resolved_by tap, and the card stays FAILED', () => {
    const h = gateHarness();
    const o = checking(h);
    const act = bookedRow(h, o.approvalId, 'unknown');
    h.clock.now = T0 + CHECKING_MS;
    h.gate.expireTick();
    h.clock.now += 60_000;
    const r = h.gate.report({ cardId: o.cardId, nonce: nonceOf(h, o.cardId), outcome: 'went_through', resolvedBy: 'tap' });
    expect(r.ok).toBe(true);
    expect(h.card(o.cardId)).toMatchObject({ state: 'FAILED', resolved_by: 'tap', resolved_at: T0 + CHECKING_MS + 60_000 });
    expect(JSON.parse(String(h.card(o.cardId).answer))).toEqual({ optionId: 'went_through' });
    expect(h.approval(o.approvalId).state).toBe('FAILED');
    expect(h.db.prepare('SELECT outcome FROM activity WHERE id = ?').pluck().get(act)).toBe('done');
  });

  it("It didn't → failed; a second tap, or one with the old nonce, is CARD_STALE and changes nothing", () => {
    const h = gateHarness();
    const o = checking(h);
    const act = bookedRow(h, o.approvalId, 'unknown');
    h.clock.now = T0 + CHECKING_MS;
    h.gate.expireTick();
    const nonce = nonceOf(h, o.cardId);
    expect(h.gate.report({ cardId: o.cardId, nonce, outcome: 'did_not', resolvedBy: 'tap' }).ok).toBe(true);
    expect(h.db.prepare('SELECT outcome FROM activity WHERE id = ?').pluck().get(act)).toBe('failed');
    expect(h.gate.report({ cardId: o.cardId, nonce, outcome: 'went_through', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    expect(h.gate.report({ cardId: o.cardId, nonce: nonceOf(h, o.cardId), outcome: 'went_through', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    expect(h.db.prepare('SELECT outcome FROM activity WHERE id = ?').pluck().get(act)).toBe('failed');
    expect(JSON.parse(String(h.card(o.cardId).answer))).toEqual({ optionId: 'did_not' });
  });

  it('only a CHECKING → FAILED card takes the answer: a plain FAILED (site refused) or a CHECKING card is stale; nothing is re-submitted', () => {
    const h = gateHarness();
    const refused = h.open();
    h.gate.approve({ cardId: refused.cardId, nonce: refused.nonce, scope: 'once', resolvedBy: 'tap' });
    h.gate.transition(refused.approvalId, 'RUNNING', { submittedAt: T0 });
    h.gate.transition(refused.approvalId, 'FAILED');
    expect(payloadOf(h, refused.cardId).unknownResult).toBeUndefined();
    expect(
      h.gate.report({ cardId: refused.cardId, nonce: nonceOf(h, refused.cardId), outcome: 'went_through', resolvedBy: 'tap' }),
    ).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    const still = checking(h);
    expect(h.gate.report({ cardId: still.cardId, nonce: nonceOf(h, still.cardId), outcome: 'went_through', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    // A done row of another action is never touched.
    const done = bookedRow(h, refused.approvalId, 'done');
    expect(h.db.prepare('SELECT outcome FROM activity WHERE id = ?').pluck().get(done)).toBe('done');
    expect(h.sent.filter((m) => m.kind === 'card.answered' && m.payload.cardId === still.cardId).length).toBe(1);
  });
});
