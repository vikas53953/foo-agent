// Spec: 08-2 §5.9 step 2 (on start: every approval RUNNING with `submitted_at` set → CHECKING, never re-submitted), 08-1
// §4.1.1 step 5, 08-2 §10.4 (the write-ahead), Art. 7. M5 T7: main's `ApprovalGate.recoverSubmitted`.
import { describe, expect, it } from 'vitest';
import { gateHarness, T0 } from './gateHarness';

describe('ApprovalGate.recoverSubmitted (08-2 §5.9 step 2)', () => {
  it('RUNNING with submitted_at → CHECKING and the engine is told; APPROVED and PENDING stay as they are', () => {
    const h = gateHarness();
    const cut = h.open();
    const approved = h.open();
    const pending = h.open();
    for (const o of [cut, approved]) h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
    h.gate.transition(cut.approvalId, 'RUNNING', { submittedAt: T0 + 1 });

    expect(h.gate.recoverSubmitted()).toEqual([cut.approvalId]);
    expect(h.approval(cut.approvalId)).toMatchObject({ state: 'CHECKING', submitted_at: T0 + 1 });
    expect(h.card(cut.cardId).state).toBe('CHECKING');
    expect(h.sent.at(-1)).toEqual({ kind: 'approval.changed', payload: { approvalId: cut.approvalId, state: 'CHECKING' } });
    expect(h.approval(approved.approvalId).state).toBe('APPROVED');
    expect(h.approval(pending.approvalId).state).toBe('PENDING');
    // Running it again moves nothing: CHECKING is never re-submitted.
    expect(h.gate.recoverSubmitted()).toEqual([]);
  });
});
