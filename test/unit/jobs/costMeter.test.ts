// Spec: 08-2 §5.10 items 3–4 (spend meter = SUM(cost_paise) of key turns since the first day of the month 00:00 in the
// user's zone; pre-call cap check: monthSpent + estimateNextCall > cap → do not call), 08-4 §26.3 item 3 (pricing at the
// provider's default-model rate), ART-13a (cap reached → 0 AI calls).
import { describe, expect, it } from 'vitest';
import { estimateCallPaise, monthBounds, overCap } from '../../../src/engine/jobs/costMeter';
import { monthKey } from '../../../src/shared/format';

const IST = 'Asia/Kolkata';

describe('monthBounds (user time zone)', () => {
  it('the month runs from the 1st 00:00 to the next 1st 00:00 in the zone', () => {
    const now = Date.UTC(2026, 9, 18, 3, 30); // 18 Oct 2026, 9:00 AM IST
    const b = monthBounds(now, IST);
    expect(b.from).toBe(Date.UTC(2026, 8, 30, 18, 30)); // 1 Oct 00:00 IST
    expect(b.to).toBe(Date.UTC(2026, 9, 31, 18, 30)); // 1 Nov 00:00 IST
    expect(monthKey(b.from, IST)).toBe('2026-10');
    expect(monthKey(b.from - 1, IST)).toBe('2026-09');
    expect(monthKey(b.to, IST)).toBe('2026-11');
  });

  it('just before midnight on the last day is still this month', () => {
    const now = Date.UTC(2026, 9, 31, 18, 29, 59);
    expect(monthBounds(now, IST).to).toBe(Date.UTC(2026, 9, 31, 18, 30));
  });
});

describe('08-2 §5.10 item 4 pre-call check', () => {
  it('only key billing is capped; at or over the cap after this call → no call', () => {
    expect(overCap({ billing: 'key', spentPaise: 99_000, estimatePaise: 999, capPaise: 100_000 })).toBe(false);
    expect(overCap({ billing: 'key', spentPaise: 99_000, estimatePaise: 1_001, capPaise: 100_000 })).toBe(true);
    expect(overCap({ billing: 'key', spentPaise: 100_000, estimatePaise: 0, capPaise: 100_000 })).toBe(false);
    expect(overCap({ billing: 'key', spentPaise: 100_001, estimatePaise: 0, capPaise: 100_000 })).toBe(true);
    expect(overCap({ billing: 'plan', spentPaise: 1e9, estimatePaise: 1e9, capPaise: 100_000 })).toBe(false);
    expect(overCap({ billing: 'local', spentPaise: 1e9, estimatePaise: 1e9, capPaise: 100_000 })).toBe(false);
  });

  it('estimate of the next call: prompt chars / 3.5 in + max output, at the rate, rounded up to paise', () => {
    // 3,500 chars ≈ 1,000 tokens in at $3/M + 1,000 out at $15/M = $0.018 → × 88 × 100 = 158.4 → 159 paise.
    expect(estimateCallPaise(3_500, 1_000, { inPerMTokUsd: 3, outPerMTokUsd: 15 }, 88)).toBe(159);
    expect(estimateCallPaise(3_500, 1_000, null, 88)).toBe(0);
  });
});
