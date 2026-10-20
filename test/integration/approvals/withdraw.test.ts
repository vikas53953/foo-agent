// M5-T4: 07-2 §5 (PENDING → WITHDRAWN when the job is cancelled elsewhere, "No longer needed. The job was stopped."), 08-2
// §5.7 step 3 (every open approval of a stopped job → WITHDRAWN), CR-0009 G-M5-18 (HELD and APPROVED too). Main's 1 s tick
// brings the approvals row in line with the stopped job, whoever stopped it (the runner's stop, or main's stop with no
// engine). The job half of AT-128 is test/integration/approvals/expiry-job.test.ts.
import { describe, expect, it } from 'vitest';
import { stopJob } from '../../../src/main/store/queries';
import { gateHarness, T0 } from '../../unit/approvals/gateHarness';

describe('a stopped job withdraws its approvals (08-2 §5.7)', () => {
  it('AT-128 (approval part) job stopped elsewhere → PENDING card WITHDRAWN; Approve after that is refused', () => {
    const h = gateHarness();
    const o = h.open();
    expect(stopJob(h.db, h.jobId, T0 + 1_000)).toBeTruthy();
    h.clock.now = T0 + 2_000;
    expect(h.gate.expireTick()).toEqual([o.approvalId]);
    expect(h.approval(o.approvalId).state).toBe('WITHDRAWN');
    expect(h.card(o.cardId)).toMatchObject({ state: 'WITHDRAWN', resolved_by: 'system' });
    expect(h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' })).toEqual({
      ok: false,
      error: { kind: 'CARD_STALE' },
    });
  });

  it('HELD and APPROVED approvals of a stopped job are withdrawn too (G-M5-18); RUNNING is never withdrawn', () => {
    const h = gateHarness();
    const held = h.open();
    const approved = h.open();
    const running = h.open();
    for (const o of [held, approved, running]) h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
    h.gate.transition(held.approvalId, 'HELD');
    h.gate.transition(running.approvalId, 'RUNNING');
    h.db.prepare("UPDATE jobs SET state = 'cancelled', stop_reason = 'user_button', finished_at = ? WHERE id = ?").run(T0, h.jobId);
    expect(h.gate.expireTick().sort()).toEqual([held.approvalId, approved.approvalId].sort());
    expect(h.approval(running.approvalId).state).toBe('RUNNING');
  });
});
