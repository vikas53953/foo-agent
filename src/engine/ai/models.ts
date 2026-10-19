// Spec: 08-4 §30.1 (model, temperature, maxOutputTokens, timeoutMs, stream per purpose; model resolution order),
// §30.2 (pricing.json format; zod rejects a null defaultModel for a key provider at load, X-123), 08-2 §6.8.
import { z } from 'zod';
import type { ProviderId } from '../../shared/types';
import type { AiPurpose } from './types';

const cliModels = z.object({ defaultModel: z.string().min(1).nullable(), cheapModel: z.string().min(1).nullable() });
const keyModels = z.object({ defaultModel: z.string().min(1), cheapModel: z.string().min(1).nullable() });
const price = z.object({
  inPerMTokUsd: z.number().nonnegative(),
  outPerMTokUsd: z.number().nonnegative(),
  cacheReadPerMTokUsd: z.number().nonnegative().optional(),
  vision: z.boolean().optional(),
});
const providerPrices = z.object({ models: z.record(z.string(), price) });
const usd = z.number().nonnegative();

export const pricingSchema = z.object({
  version: z.string().min(1),
  usdToInr: z.number().positive(),
  anthropicVersion: z.string().min(1),
  models: z.object({
    'claude-cli': cliModels,
    'codex-cli': cliModels,
    'gemini-cli': cliModels,
    'openai-key': keyModels,
    'anthropic-key': keyModels,
    'google-key': keyModels,
  }),
  providers: z.object({ 'openai-key': providerPrices, 'anthropic-key': providerPrices, 'google-key': providerPrices }),
  voice: z.object({ 'gpt-4o-mini-transcribe': z.object({ perMinuteUsd: usd }), 'gpt-4o-transcribe': z.object({ perMinuteUsd: usd }) }),
  web: z.object({
    exa: z.object({ perCallUsd: usd.optional(), perMinuteUsd: usd.optional(), perStepUsd: usd.optional() }),
    tavily: z.object({ perCallUsd: usd.optional(), perMinuteUsd: usd.optional(), perStepUsd: usd.optional() }),
    firecrawl: z.object({ perCallUsd: usd.optional(), perMinuteUsd: usd.optional(), perStepUsd: usd.optional() }),
    browseruse: z.object({ perCallUsd: usd.optional(), perMinuteUsd: usd.optional(), perStepUsd: usd.optional() }),
  }),
  hub: z.object({ composio: z.object({ perCallUsd: usd }), zapier: z.object({ perCallUsd: usd }) }),
});

export type Pricing = z.infer<typeof pricingSchema>;
export type KeyProviderId = 'openai-key' | 'anthropic-key' | 'google-key';
export type ModelTableId = keyof Pricing['models'];

/** Parses pricing.json content; throws a ZodError on a bad file (the engine refuses to start an AI turn with it). */
export function loadPricing(json: unknown): Pricing {
  return pricingSchema.parse(json);
}

export type Tier = 'default' | 'cheap';

export interface PurposeParams {
  tier: Tier;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  stream: boolean;
}

/** 08-4 §30.1 table. `chat` = plain replies (the intake row). */
export const PURPOSE_PARAMS: Record<Exclude<AiPurpose, 'repair' | 'voice' | 'web' | 'hub'>, PurposeParams> = {
  verify: { tier: 'default', temperature: 0, maxOutputTokens: 10, timeoutMs: 20_000, stream: false },
  intake: { tier: 'default', temperature: 0.4, maxOutputTokens: 1200, timeoutMs: 60_000, stream: true },
  chat: { tier: 'default', temperature: 0.4, maxOutputTokens: 1200, timeoutMs: 60_000, stream: true },
  step: { tier: 'default', temperature: 0.2, maxOutputTokens: 2000, timeoutMs: 180_000, stream: false },
  second_look: { tier: 'cheap', temperature: 0, maxOutputTokens: 200, timeoutMs: 20_000, stream: false },
  memory_review: { tier: 'cheap', temperature: 0, maxOutputTokens: 800, timeoutMs: 60_000, stream: false },
  tidy: { tier: 'cheap', temperature: 0, maxOutputTokens: 800, timeoutMs: 60_000, stream: false },
  routine: { tier: 'cheap', temperature: 0.2, maxOutputTokens: 1500, timeoutMs: 90_000, stream: false },
  brief: { tier: 'cheap', temperature: 0.3, maxOutputTokens: 1500, timeoutMs: 60_000, stream: false },
  classify: { tier: 'cheap', temperature: 0, maxOutputTokens: 200, timeoutMs: 20_000, stream: false },
  rewrite: { tier: 'cheap', temperature: 0, maxOutputTokens: 200, timeoutMs: 20_000, stream: false },
  catch_up: { tier: 'default', temperature: 0.2, maxOutputTokens: 1500, timeoutMs: 90_000, stream: false },
  read_attachment: { tier: 'default', temperature: 0, maxOutputTokens: 800, timeoutMs: 90_000, stream: false },
};

/** Purposes 08-4 §30.1 has no row for (voice, web, hub): default model, the intake budget, no stream (conservative). */
const FALLBACK_PARAMS: PurposeParams = { tier: 'default', temperature: 0, maxOutputTokens: 1200, timeoutMs: 60_000, stream: false };

export interface ParamsContext {
  /** `repair` runs "as the failed turn" for model and maxOutputTokens. */
  failed?: { tier: Tier; maxOutputTokens: number };
  /** `routine` uses the default model when the routine uses the browser. */
  routineUsesBrowser?: boolean;
}

export function paramsFor(purpose: AiPurpose, ctx: ParamsContext = {}): PurposeParams {
  if (purpose === 'repair') {
    const f = ctx.failed ?? { tier: 'default' as Tier, maxOutputTokens: 2000 };
    return { tier: f.tier, temperature: 0, maxOutputTokens: f.maxOutputTokens, timeoutMs: 30_000, stream: false };
  }
  if (purpose === 'voice' || purpose === 'web' || purpose === 'hub') return FALLBACK_PARAMS;
  const p = PURPOSE_PARAMS[purpose];
  if (purpose === 'routine' && ctx.routineUsesBrowser) return { ...p, tier: 'default' };
  return p;
}

export function isCheapPurpose(purpose: AiPurpose): boolean {
  return paramsFor(purpose).tier === 'cheap';
}

/** Temperature is not sent to CLIs (no flag, X-123). */
export function temperatureFor(providerId: ProviderId, params: PurposeParams): number | null {
  return providerId === 'claude-cli' || providerId === 'codex-cli' || providerId === 'gemini-cli' ? null : params.temperature;
}

/**
 * 08-4 §30.1 resolution order. Default: settings.ai.providers[p].model → pricing.models[p].defaultModel → undefined
 * (no model flag, the CLI account default). Cheap: settings cheapModel → pricing cheapModel → the default.
 */
export function resolveModel(
  providerId: ProviderId,
  tier: Tier,
  pricing: Pricing,
  settings?: { model?: string; cheapModel?: string },
): string | undefined {
  if (providerId === 'fake') return undefined;
  const row = providerId in pricing.models ? pricing.models[providerId as ModelTableId] : undefined;
  const def = settings?.model ?? row?.defaultModel ?? undefined;
  if (tier === 'default') return def;
  return settings?.cheapModel ?? row?.cheapModel ?? def;
}

export function priceOf(pricing: Pricing, providerId: ProviderId, model: string | undefined) {
  if (!model) return undefined;
  if (providerId !== 'openai-key' && providerId !== 'anthropic-key' && providerId !== 'google-key') return undefined;
  return pricing.providers[providerId].models[model];
}

/**
 * 08-2 §5.10.2: the rate the AI cap prices a key call at. A model with no price row uses that provider's most expensive
 * listed rate, so an unpriced model can never slip past the cap (Art. 13). Not a key provider → undefined.
 */
export function capRateOf(pricing: Pricing, providerId: ProviderId, model: string | undefined) {
  if (providerId !== 'openai-key' && providerId !== 'anthropic-key' && providerId !== 'google-key') return undefined;
  const own = priceOf(pricing, providerId, model);
  if (own) return own;
  let top: (typeof pricing.providers)[typeof providerId]['models'][string] | undefined;
  for (const p of Object.values(pricing.providers[providerId].models)) {
    if (!top || p.inPerMTokUsd + p.outPerMTokUsd > top.inPerMTokUsd + top.outPerMTokUsd) top = p;
  }
  return top;
}

/** A rough chars/4 token count (the estimate only; usage comes from the provider). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
