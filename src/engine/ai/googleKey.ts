// Spec: 08-4 §30.3 row google-key (POST /v1beta/models/{m}:streamGenerateContent?alt=sse, header x-goog-api-key, body
// { systemInstruction, contents, generationConfig { maxOutputTokens, temperature } }), §30.10 (inline_data parts before
// the text part), 08-2 §6.3.1 (key only in the header, never logged).
import type { AdapterDeps } from './deps';
import { HttpAdapter, keyCostPaise, keyModel, type HttpCall, type PreparedImage } from './httpCommon';
import { createGoogleParser } from './parsers';
import { priceOf } from './models';
import { detectProvider } from './detect';
import type { TurnRequest } from './types';

export const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function buildGoogleCall(req: TurnRequest, model: string, key: string, images: PreparedImage[]): HttpCall {
  const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxOutputTokens };
  if (req.temperature !== null) generationConfig.temperature = req.temperature;
  const parts = [...images.map((i) => ({ inline_data: { mime_type: 'image/png', data: i.b64 } })), { text: req.prompt }];
  return {
    url: `${GOOGLE_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    headers: { 'x-goog-api-key': key, accept: 'text/event-stream' },
    body: {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig,
    },
    parser: createGoogleParser(),
  };
}

export function createGoogleKey(deps: AdapterDeps): HttpAdapter {
  return new HttpAdapter(
    {
      id: 'google-key',
      billing: 'key',
      needsKey: true,
      model: (req) => keyModel(deps, 'google-key', req),
      vision: async (m) => priceOf(deps.pricing, 'google-key', m)?.vision === true,
      build: (req, model, key, images) => buildGoogleCall(req, model, key ?? '', images),
      detect: () => detectProvider('google-key', deps),
      costPaise: (req, model, tokensIn) => keyCostPaise(deps, 'google-key', model, tokensIn, req.maxOutputTokens),
    },
    deps,
  );
}
