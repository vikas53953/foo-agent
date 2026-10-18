// Spec: 08-4 §26.3 items 1–4 (engine estimates; the AI's raw numbers are kept only in state.json `aiEstimate`; every threshold
// uses these values), 08-2 §5.3.3 (Plan card when est_minutes > 2 or est_cost_paise > 500; "This is a big one." when key
// billing and est_cost_paise > 0.2 × money.aiCapPaise), §5.10 item 2 (paise rounded up).
export const TOKENS_PER_STEP = 6_000;
export const PLAN_CARD_MINUTES = 2;
export const PLAN_CARD_PAISE = 500;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function estTokens(aiTokens: number | undefined, steps: number): number {
  return clamp(Math.max(aiTokens ?? 0, steps * TOKENS_PER_STEP), 6_000, 400_000);
}

export function estMinutes(aiMinutes: number | undefined, steps: number): number {
  return clamp(aiMinutes ?? steps * 0.75, 0.5, 60);
}

/** Item 3: the default model's rate, 70 % input / 30 % output; NULL for plan and local billing or an unpriced model. */
export function estCostPaise(
  tokens: number,
  billing: 'plan' | 'key' | 'local',
  rate: { inPerMTokUsd: number; outPerMTokUsd: number } | null | undefined,
  usdToInr: number,
): number | null {
  if (billing !== 'key' || !rate) return null;
  const usd = (tokens * (0.7 * rate.inPerMTokUsd + 0.3 * rate.outPerMTokUsd)) / 1_000_000;
  return Math.ceil(usd * usdToInr * 100 - 1e-9);
}

export function needsPlanCard(minutes: number, costPaise: number | null): boolean {
  return minutes > PLAN_CARD_MINUTES || (costPaise ?? 0) > PLAN_CARD_PAISE;
}

export function isBigOne(billing: 'plan' | 'key' | 'local', costPaise: number | null, aiCapPaise: number): boolean {
  return billing === 'key' && costPaise !== null && costPaise > 0.2 * aiCapPaise;
}
