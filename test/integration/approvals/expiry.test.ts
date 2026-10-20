// M5-T4: 08-2 §9.1 (a payment / booking card that expires → EXPIRED; the job half is test/integration/approvals/
// expiry-job.test.ts), 07-2 §5 (EXPIRED is single use and never auto-retries), 05-2 §5.5.4 ("Ask me again" re-checks live
// terms first, then builds a fresh card), 08-2 §9.4.2 (live terms), 08-1 §3.2 card:askAgain.
import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../../src/shared/errors';
import { FIELDS, gateHarness, T0 } from '../../unit/approvals/gateHarness';

const MIN = 60_000;

describe('approval expiry and Ask me again (08-2 §9.1)', () => {
  it('AT-111 (approval part) a booking card past its 15 min → EXPIRED, the card mirrored, nothing approved', () => {
    const h = gateHarness();
    const o = h.open();
    h.clock.now = T0 + 15 * MIN;
    h.gate.expireTick();
    expect(h.approval(o.approvalId)).toMatchObject({ state: 'EXPIRED', approved_at: null, submitted_at: null });
    expect(h.card(o.cardId).state).toBe('EXPIRED');
    expect(h.sent).toEqual([{ kind: 'approval.changed', payload: { approvalId: o.approvalId, state: 'EXPIRED' } }]);
    // Never auto-retried: later ticks move nothing.
    h.clock.now = T0 + 120 * MIN;
    expect(h.gate.expireTick()).toEqual([]);
  });

  it('AT-127 timer ends → EXPIRED; Ask me again re-checks live terms first and builds a fresh PENDING card', () => {
    const calls: string[] = [];
    const liveTerms = vi.fn((a: { id: string }) => {
      calls.push(`live:${a.id}`);
      return ok({ fields: { ...FIELDS.book!, partySize: 5 }, impact: 'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 5 people' });
    });
    const h = gateHarness({ liveTerms });
    const o = h.open();
    // Before it expires, Ask me again is not offered.
    expect(h.gate.askAgain({ cardId: o.cardId })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    h.clock.now = T0 + 15 * MIN;
    h.gate.expireTick();
    const r = h.gate.askAgain({ cardId: o.cardId });
    expect(r.ok).toBe(true);
    const newCardId = r.ok ? r.value.newCardId! : '';
    expect(liveTerms).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([`live:${o.approvalId}`]);
    // The old card stays EXPIRED; the new one is PENDING with a fresh nonce, the live fields and a new 15 min expiry.
    expect(h.card(o.cardId).state).toBe('EXPIRED');
    const fresh = h.card(newCardId);
    expect(fresh).toMatchObject({ type: 'approval', state: 'PENDING', expires_at: T0 + 30 * MIN });
    expect(fresh.nonce).not.toBe(o.nonce);
    const p = JSON.parse(String(fresh.payload));
    expect(p.fields.partySize).toBe(5);
    expect(p.title).toBe('Book this table?');
    expect(p.impact).toContain('5 people');
    // The job, still waiting on the user, now waits on the fresh card.
    expect(h.db.prepare('SELECT needs_you_card_id FROM jobs WHERE id = ?').pluck().get(h.jobId)).toBe(newCardId);
  });

  it('Ask me again refuses when the live terms cannot be read (nothing new is built)', () => {
    const h = gateHarness({ liveTerms: () => ({ ok: false, error: { kind: 'SITE_UNREACHABLE' as never } }) });
    const o = h.open();
    h.clock.now = T0 + 15 * MIN;
    h.gate.expireTick();
    expect(h.gate.askAgain({ cardId: o.cardId }).ok).toBe(false);
    expect(h.db.prepare("SELECT COUNT(*) FROM cards WHERE type = 'approval'").pluck().get()).toBe(1);
  });
});
