// M5-T4: 08-2 §9.7 ApprovalGate (create in one transaction; approve / decline from a tap only; transition checked against
// the machine, APPROVAL_BAD_TRANSITION; write-ahead submitted_at), 08-1 §3.2 (nonce → CARD_STALE), §4.5.1 (the card mirrors
// the approvals row), §2.4 (card.answered resumes the runner; approval.changed on every move), Art. 6 / X-04 (the engine can
// never approve), SM-A4 / G-M5-03 (HELD picks).
import { describe, expect, it } from 'vitest';
import { findOpenApproval, hardLimitOf } from '../../../src/main/approvals/ApprovalGate';
import { FIELDS, gateHarness, T0 } from './gateHarness';

describe('ApprovalGate (08-2 §9.7)', () => {
  it('create writes approvals row + card + message in one transaction, PENDING, with the hash and the scopes', () => {
    const h = gateHarness();
    const o = h.open();
    expect(o.nonce).toMatch(/^[0-9a-f]{32}$/);
    const a = h.approval(o.approvalId);
    expect(a).toMatchObject({ card_id: o.cardId, job_id: h.jobId, chat_id: h.chatId, verb: 'book', state: 'PENDING', hard_limit: 1 });
    const c = h.card(o.cardId);
    expect(c).toMatchObject({ type: 'approval', state: 'PENDING', nonce: o.nonce, job_id: h.jobId });
    expect(JSON.parse(String(c.payload))).toMatchObject({
      approvalId: o.approvalId,
      verb: 'book',
      scopes: ['once'],
      hardLimit: true,
      title: 'Book this table?',
    });
    expect(h.db.prepare('SELECT kind, card_id FROM messages WHERE id = ?').get(c.message_id)).toEqual({ kind: 'card', card_id: o.cardId });
    expect(h.changed.at(-1)!.cardIds.has(o.cardId)).toBe(true);
  });

  it('create refuses fields that fail the schema or do not match the verb, and writes nothing', () => {
    const h = gateHarness();
    expect(h.gate.create({ jobId: h.jobId, verb: 'book', fields: FIELDS.delete!, hardLimit: true, title: 't', impact: 'i' }).ok).toBe(
      false,
    );
    const bad = { ...FIELDS.book!, note: 'free text' } as never;
    expect(h.gate.create({ jobId: h.jobId, verb: 'book', fields: bad, hardLimit: true, title: 't', impact: 'i' })).toEqual({
      ok: false,
      error: { kind: 'VALIDATION' },
    });
    expect(h.db.prepare('SELECT COUNT(*) FROM cards').pluck().get()).toBe(0);
  });

  it('approve: PENDING → APPROVED once; stale nonce and a second tap are CARD_STALE; the runner hears card.answered', () => {
    const h = gateHarness();
    const o = h.open();
    expect(h.gate.approve({ cardId: o.cardId, nonce: '0'.repeat(32), scope: 'once', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    h.clock.now = T0 + 5 * 60_000;
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' })).toEqual({
      ok: true,
      value: { state: 'APPROVED' },
    });
    expect(h.approval(o.approvalId)).toMatchObject({
      state: 'APPROVED',
      approved_at: T0 + 5 * 60_000,
      approved_via: 'card',
      scope: 'once',
    });
    expect(h.card(o.cardId)).toMatchObject({ state: 'APPROVED', resolved_by: 'tap', resolved_at: T0 + 5 * 60_000 });
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
    expect(h.sent).toEqual([
      { kind: 'approval.changed', payload: { approvalId: o.approvalId, state: 'APPROVED' } },
      { kind: 'card.answered', payload: { cardId: o.cardId, choice: 'approve', resolvedBy: 'tap' } },
    ]);
  });

  it('tech log lines carry ids and states only, never card text', () => {
    const h = gateHarness();
    const o = h.open();
    h.gate.transition(o.approvalId, 'APPROVED');
    h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
    expect(h.logs.length).toBeGreaterThan(0);
    for (const l of h.logs) {
      expect(Object.keys(l).every((k) => ['lvl', 'mod', 'evt', 'ids', 'kind', 'ms'].includes(k))).toBe(true);
      expect(JSON.stringify(l)).not.toMatch(/Book this table|Pizza by the Bay/);
    }
    expect(h.logs).toContainEqual({
      lvl: 'info',
      mod: 'approvals',
      evt: 'card.state',
      ids: { approvalId: o.approvalId },
      kind: 'book:PENDING',
    });
  });

  it('decline: PENDING → DECLINED, single use (no later approve)', () => {
    const h = gateHarness();
    const o = h.open();
    const r = h.gate.decline({ cardId: o.cardId, nonce: o.nonce, resolvedBy: 'keyboard' });
    expect(r.ok && r.value.state).toBe('DECLINED');
    expect(h.approval(o.approvalId).state).toBe('DECLINED');
    expect(h.sent.at(-1)).toEqual({ kind: 'card.answered', payload: { cardId: o.cardId, choice: 'decline', resolvedBy: 'keyboard' } });
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' }).ok).toBe(false);
  });

  it('the engine moves APPROVED → RUNNING (write-ahead submitted_at) → COMPLETED, and can never approve, decline or pick', () => {
    const h = gateHarness();
    const o = h.open();
    for (const to of ['APPROVED', 'DECLINED'] as const)
      expect(h.gate.transition(o.approvalId, to)).toEqual({ ok: false, error: { kind: 'APPROVAL_BAD_TRANSITION' } });
    expect(h.logs.filter((l) => l.evt === 'APPROVAL_BAD_TRANSITION')).toHaveLength(2);
    expect(h.gate.transition(o.approvalId, 'RUNNING').ok).toBe(false);
    h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
    expect(h.gate.transition(o.approvalId, 'RUNNING', { submittedAt: T0 + 1 })).toEqual({ ok: true, value: 'RUNNING' });
    expect(h.approval(o.approvalId).submitted_at).toBe(T0 + 1);
    expect(h.gate.transition(o.approvalId, 'RUNNING').ok).toBe(false);
    expect(h.gate.transition(o.approvalId, 'COMPLETED')).toEqual({ ok: true, value: 'COMPLETED' });
    expect(h.card(o.cardId).state).toBe('COMPLETED');
  });

  it('HELD: picking the action value approves again, picking your own declines (G-M5-03); any other option is VALIDATION', () => {
    const h = gateHarness();
    for (const [pick, to] of [
      ['action', 'APPROVED'],
      ['own', 'DECLINED'],
    ] as const) {
      const o = h.open();
      h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
      expect(h.gate.transition(o.approvalId, 'HELD').ok).toBe(true);
      expect(h.gate.heldPick({ cardId: o.cardId, nonce: o.nonce, optionId: 'other', resolvedBy: 'tap' })).toEqual({
        ok: false,
        error: { kind: 'VALIDATION' },
      });
      const r = h.gate.heldPick({ cardId: o.cardId, nonce: o.nonce, optionId: pick, resolvedBy: 'tap' });
      expect(r.ok && r.value.state).toBe(to);
      expect(h.approval(o.approvalId).state).toBe(to);
    }
  });

  it('hard limits for AI-requested verbs (08-2 §9.2): buy, pay, delete always; book when not free to cancel or it shares a phone', () => {
    expect(hardLimitOf(FIELDS.book!, T0)).toBe(false);
    expect(hardLimitOf({ ...FIELDS.book!, personalShared: ['phone'] }, T0)).toBe(true);
    expect(hardLimitOf({ ...FIELDS.book!, cancelTerms: { refundable: false } }, T0)).toBe(true);
    expect(hardLimitOf(FIELDS.delete!, T0)).toBe(true);
    expect(hardLimitOf({ verb: 'pay', amountPaise: 100, irreversible: true }, T0)).toBe(true);
    // A free-cancel window counts only while it is still open.
    expect(hardLimitOf({ ...FIELDS.book!, cancelTerms: { freeUntil: T0 + 60_000, refundable: false } }, T0)).toBe(false);
    expect(hardLimitOf({ ...FIELDS.book!, cancelTerms: { freeUntil: T0, refundable: false } }, T0)).toBe(true);
  });

  it('findOpenApproval (review fix 4) fails closed: only one APPROVED row for that job and verb, else null', () => {
    const h = gateHarness();
    expect(findOpenApproval(h.db, h.jobId, 'book')).toBeNull();
    const o = h.open();
    expect(findOpenApproval(h.db, h.jobId, 'book')).toBeNull(); // PENDING
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, resolvedBy: 'tap', scope: 'once' }).ok).toBe(true);
    expect(findOpenApproval(h.db, h.jobId, 'book')).toEqual({ id: o.approvalId, state: 'APPROVED' });
    expect(findOpenApproval(h.db, h.jobId, 'pay')).toBeNull(); // other verb
    expect(findOpenApproval(h.db, 'j_other', 'book')).toBeNull(); // other job
    expect(h.gate.transition(o.approvalId, 'RUNNING').ok).toBe(true);
    expect(findOpenApproval(h.db, h.jobId, 'book')).toBeNull(); // RUNNING: past the fill point
    const two = [h.open(), h.open()];
    for (const x of two) h.gate.approve({ cardId: x.cardId, nonce: x.nonce, resolvedBy: 'tap', scope: 'once' });
    expect(findOpenApproval(h.db, h.jobId, 'book')).toBeNull(); // two APPROVED rows: ambiguous, so none
  });

  it('openFromEngine: book and delete get an Approval card; buy and pay are the Payment card (M10)', () => {
    const h = gateHarness();
    const r = h.gate.openFromEngine({
      jobId: h.jobId,
      draft: { verb: 'book', fields: FIELDS.book!, evidence: [] },
      title: 'Book this table?',
      impact: 'i',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && h.approval(r.value.approvalId).hard_limit).toBe(0);
    const pay = h.gate.openFromEngine({
      jobId: h.jobId,
      draft: { verb: 'pay', fields: { verb: 'pay', irreversible: true }, evidence: [] },
      title: 't',
      impact: 'i',
    });
    expect(pay).toEqual({ ok: false, error: { kind: 'VALIDATION', message: 'payment_card' } });
  });
});
