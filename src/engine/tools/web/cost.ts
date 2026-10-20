// Spec: 08-4 §27.3 item 5 (cost rows: provider_id exa|tavily|firecrawl|browseruse, purpose 'web', billing 'key', cost_source
// 'priced', cost from pricing.json.web, Browser Use perCallUsd + perStepUsd × steps; a missing price field counts as 0 only if
// another field is present; no price fields → cost_source 'unknown', cost_paise NULL, the call still runs, logged
// pricing.missing; X-127), 08-2 §5.10 items 2, 4, 6 (USD × usdToInr × 100 rounded up; pre-call cap check; free-tier calls
// still priced; at the cap web tools use the local path instead of waiting).
import type { WebPricing, WebProvider } from './types';

export interface Priced {
  paise: number | null;
  source: 'priced' | 'unknown';
}

export function priceWebCall(pricing: { usdToInr: number; web: WebPricing }, p: WebProvider, steps = 0): Priced {
  const row = pricing.web[p];
  const perCall = row?.perCallUsd;
  const perStep = row?.perStepUsd;
  if (perCall === undefined && perStep === undefined) return { paise: null, source: 'unknown' };
  const usd = (perCall ?? 0) + (perStep ?? 0) * steps;
  return { paise: Math.ceil(usd * pricing.usdToInr * 100 - 1e-9), source: 'priced' };
}
