// M5-T4: 08-2 §9.1 (expiry per verb: pay / buy 10 min, book 15, send / post / delete / share / switch 60; use_app and
// calendar_write 60, G-M5-15; timers run in main and keep running while the window is closed; absolute `expires_at`),
// §9.7 `ApprovalGate.expireTick` (1 s), 07-2 §5 PENDING / HELD → EXPIRED (G-M5-04), 05-2 §5.5.4. The toast half of
// AT-121 (the toast shows the same expiry) is M11's (Windows toasts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startExpiryTick } from '../../../src/main/approvals/expiry';
import { FIELDS, gateHarness, T0 } from './gateHarness';

const MIN = 60_000;

describe('approval expiry (08-2 §9.1)', () => {
  afterEach(() => vi.useRealTimers());

  it('AT-121 PENDING timer is 10 / 15 / 60 min by verb and expires on the absolute expires_at, in main with no window', () => {
    const h = gateHarness();
    const minutes = { book: 15, delete: 60, use_app: 60, calendar_write: 60, share: 60 } as const;
    const opened = Object.entries(minutes).map(([verb, min]) => ({
      min,
      ...h.open({ verb: verb as keyof typeof minutes, fields: FIELDS[verb]! }),
    }));
    for (const o of opened) {
      expect(h.approval(o.approvalId).expires_at).toBe(T0 + o.min * MIN);
      expect(h.card(o.cardId).expires_at).toBe(T0 + o.min * MIN);
      expect(JSON.parse(String(h.card(o.cardId).payload)).expiresAt).toBe(T0 + o.min * MIN);
    }
    // One ms before 15 min nothing moves; at 15 min only the book card expires.
    h.clock.now = T0 + 15 * MIN - 1;
    expect(h.gate.expireTick()).toEqual([]);
    h.clock.now = T0 + 15 * MIN;
    expect(h.gate.expireTick()).toEqual([opened[0]!.approvalId]);
    expect(h.approval(opened[0]!.approvalId).state).toBe('EXPIRED');
    expect(h.card(opened[0]!.cardId)).toMatchObject({ state: 'EXPIRED', resolved_by: 'system', resolved_at: T0 + 15 * MIN });
    // The 60 min ones expire together at 60 min; a second tick moves nothing.
    h.clock.now = T0 + 60 * MIN;
    expect(h.gate.expireTick().sort()).toEqual(
      opened
        .slice(1)
        .map((o) => o.approvalId)
        .sort(),
    );
    expect(h.gate.expireTick()).toEqual([]);
    // The engine hears every move (08-1 §2.4 approval.changed).
    expect(h.sent.filter((s) => s.kind === 'approval.changed' && s.payload.state === 'EXPIRED')).toHaveLength(5);
  });

  it('HELD expires too (G-M5-04); APPROVED and RUNNING never expire', () => {
    const h = gateHarness();
    const held = h.open();
    const running = h.open();
    h.db.prepare("UPDATE approvals SET state = 'HELD' WHERE id = ?").run(held.approvalId);
    h.db.prepare("UPDATE approvals SET state = 'RUNNING' WHERE id = ?").run(running.approvalId);
    h.clock.now = T0 + 15 * MIN;
    expect(h.gate.expireTick()).toEqual([held.approvalId]);
    expect(h.approval(running.approvalId).state).toBe('RUNNING');
  });

  it('the 1 s tick runs on its own timer and reads the clock each time', () => {
    vi.useFakeTimers();
    const tick = vi.fn(() => []);
    const stop = startExpiryTick({ expireTick: tick });
    vi.advanceTimersByTime(3_000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(3_000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('an approve after the absolute expiry is refused CARD_EXPIRED even before the tick runs', () => {
    const h = gateHarness();
    const o = h.open();
    h.clock.now = T0 + 15 * MIN;
    const r = h.gate.approve({ cardId: o.cardId, nonce: o.nonce, scope: 'once', resolvedBy: 'tap' });
    expect(r).toEqual({ ok: false, error: { kind: 'CARD_EXPIRED' } });
    expect(h.approval(o.approvalId).state).toBe('PENDING');
  });
});
