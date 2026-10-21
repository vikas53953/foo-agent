// Spec: 08-2 §6.6 (verify: one real request, prompt exactly `Reply with the word ready`, maxOutputTokens 10, ok when the
// reply contains "ready" case-insensitive), 08-4 §30.1 row `verify` (default model, temperature 0, 20 s, no stream).
import type { AiAdapter, TurnRequest, VerifyResult } from './types';
import type { AdapterDeps } from './deps';
import { paramsFor, resolveModel, temperatureFor } from './models';

export const VERIFY_PROMPT = 'Reply with the word ready';
/**
 * CR-0025: a helper app's verify also pays for starting the app. On Vikas's PC (2026-10-21) Claude Code answered in about
 * 2 s by its own clock but took 10–18 s from spawn to exit, so the 20 s row of 08-4 §30.1 timed out a working CLI.
 */
export const CLI_VERIFY_TIMEOUT_MS = 60_000;
const CLI_IDS = new Set(['claude-cli', 'codex-cli', 'gemini-cli']);

export function verifyRequest(
  adapter: Pick<AiAdapter, 'id'>,
  deps: Pick<AdapterDeps, 'pricing' | 'providerSettings' | 'clock'>,
): TurnRequest {
  const p = paramsFor('verify');
  const req: TurnRequest = {
    turnId: `verify-${adapter.id}-${deps.clock.now()}`,
    purpose: 'verify',
    system: '',
    prompt: VERIFY_PROMPT,
    maxOutputTokens: p.maxOutputTokens,
    timeoutMs: CLI_IDS.has(adapter.id) ? CLI_VERIFY_TIMEOUT_MS : p.timeoutMs,
    temperature: temperatureFor(adapter.id, p),
    stream: false,
  };
  const model = resolveModel(adapter.id, p.tier, deps.pricing, deps.providerSettings?.(adapter.id));
  if (model !== undefined) req.model = model;
  return req;
}

export async function verifyWith(
  adapter: Pick<AiAdapter, 'id' | 'runTurn'>,
  deps: Pick<AdapterDeps, 'pricing' | 'providerSettings' | 'clock'>,
  signal: AbortSignal,
): Promise<VerifyResult> {
  const t0 = deps.clock.now();
  const r = await adapter.runTurn(verifyRequest(adapter, deps), { onText: () => undefined, onSession: () => undefined }, signal);
  const latencyMs = deps.clock.now() - t0;
  if ((r.stopReason === 'end' || r.stopReason === 'max_tokens') && /ready/i.test(r.text)) return { ok: true, latencyMs };
  const out: VerifyResult = { ok: false, kind: r.stopReason === 'cancelled' ? 'UNKNOWN' : (r.errorKind ?? 'UNKNOWN'), latencyMs };
  if (r.resetAt !== undefined) out.resetAt = r.resetAt;
  return out;
}
