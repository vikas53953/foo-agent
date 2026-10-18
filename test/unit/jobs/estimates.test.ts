// Spec: 08-4 §26.3 items 1–3 (est_tokens = clamp(max(ai ?? 0, steps × 6,000), 6,000, 400,000); est_minutes = clamp(ai ??
// steps × 0.75, 0.5, 60); est_cost_paise = est_tokens at the default model rate, 70 % in / 30 % out, NULL for plan and local),
// 08-2 §5.3.3 (Plan card when est_minutes > 2 or est_cost_paise > 500; "This is a big one." when key billing and
// est_cost_paise > 0.2 × money.aiCapPaise).
import { describe, expect, it } from 'vitest';
import { estCostPaise, estMinutes, estTokens, isBigOne, needsPlanCard } from '../../../src/engine/jobs/estimates';

describe('08-4 §26.3 engine estimates', () => {
  it('tokens: at least 6,000 per step, AI number when larger, clamped 6,000…400,000', () => {
    expect(estTokens(undefined, 2)).toBe(12_000);
    expect(estTokens(50_000, 2)).toBe(50_000);
    expect(estTokens(1_000, 0)).toBe(6_000);
    expect(estTokens(9_000_000, 3)).toBe(400_000);
  });

  it('minutes: AI number or 0.75 per step, clamped 0.5…60', () => {
    expect(estMinutes(undefined, 2)).toBe(1.5);
    expect(estMinutes(5, 2)).toBe(5);
    expect(estMinutes(0.1, 2)).toBe(0.5);
    expect(estMinutes(undefined, 100)).toBe(60);
  });

  it('cost: NULL for plan and local billing; key billing at 70 % in / 30 % out, in paise', () => {
    const rate = { inPerMTokUsd: 3, outPerMTokUsd: 15 };
    expect(estCostPaise(12_000, 'plan', rate, 88)).toBeNull();
    expect(estCostPaise(12_000, 'local', rate, 88)).toBeNull();
    // 12,000 tok × (0.7 × $3 + 0.3 × $15) / 1M = $0.0792 → × ₹88 → ₹6.9696 → 697 paise (rounded up)
    expect(estCostPaise(12_000, 'key', rate, 88)).toBe(697);
    expect(estCostPaise(12_000, 'key', null, 88)).toBeNull();
  });

  it('Plan card when est_minutes > 2 or est_cost_paise > 500 (₹5)', () => {
    expect(needsPlanCard(1.5, null)).toBe(false);
    expect(needsPlanCard(2, 500)).toBe(false);
    expect(needsPlanCard(2.25, null)).toBe(true);
    expect(needsPlanCard(1, 501)).toBe(true);
  });

  it('"This is a big one." only for key billing above 20 % of the AI cap', () => {
    expect(isBigOne('key', 20_001, 100_000)).toBe(true);
    expect(isBigOne('key', 20_000, 100_000)).toBe(false);
    expect(isBigOne('plan', null, 100_000)).toBe(false);
  });
});
