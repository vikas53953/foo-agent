// Spec: 08-4 §30.3 row anthropic-key (POST /v1/messages, stream SSE, headers x-api-key and anthropic-version from
// pricing.json, body { model, system, messages, max_tokens, temperature }), §30.10 (image parts before the text part),
// 08-2 §6.3.1 (key only in the header, never logged).
import type { AdapterDeps } from './deps';
import { HttpAdapter, keyCostPaise, keyModel, type HttpCall, type PreparedImage } from './httpCommon';
import { createAnthropicParser } from './parsers';
import { priceOf } from './models';
import { detectProvider } from './detect';
import type { TurnRequest } from './types';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function buildAnthropicCall(
  req: TurnRequest,
  model: string,
  key: string,
  images: PreparedImage[],
  anthropicVersion: string,
): HttpCall {
  const content =
    images.length > 0
      ? [
          ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: i.b64 } })),
          { type: 'text', text: req.prompt },
        ]
      : req.prompt;
  const body: Record<string, unknown> = {
    model,
    system: req.system,
    messages: [{ role: 'user', content }],
    max_tokens: req.maxOutputTokens,
    stream: true,
  };
  if (req.temperature !== null) body.temperature = req.temperature;
  return {
    url: ANTHROPIC_URL,
    headers: { 'x-api-key': key, 'anthropic-version': anthropicVersion, accept: 'text/event-stream' },
    body,
    parser: createAnthropicParser(),
  };
}

export function createAnthropicKey(deps: AdapterDeps): HttpAdapter {
  return new HttpAdapter(
    {
      id: 'anthropic-key',
      billing: 'key',
      needsKey: true,
      model: (req) => keyModel(deps, 'anthropic-key', req),
      vision: async (m) => priceOf(deps.pricing, 'anthropic-key', m)?.vision === true,
      build: (req, model, key, images) => buildAnthropicCall(req, model, key ?? '', images, deps.pricing.anthropicVersion),
      detect: () => detectProvider('anthropic-key', deps),
      costPaise: (req, model, tokensIn) => keyCostPaise(deps, 'anthropic-key', model, tokensIn, req.maxOutputTokens),
    },
    deps,
  );
}
