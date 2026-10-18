// Spec: 08-4 §30.3 row openai-key (POST {base}/responses, stream SSE, `Authorization: Bearer {key}`, body { model,
// instructions, input, max_output_tokens, temperature, store:false }), §30.10 (input_image parts before input_text),
// 08-2 §6.1 (LM Studio: same code path, base URL override, no key), §6.3.1 (key only in the header, never logged).
import type { AdapterDeps } from './deps';
import { HttpAdapter, keyCostPaise, keyModel, type HttpCall, type PreparedImage } from './httpCommon';
import { createOpenAiParser } from './parsers';
import { priceOf } from './models';
import { detectLmStudio, detectProvider, LMSTUDIO_BASE } from './detect';
import type { TurnRequest } from './types';

export const OPENAI_BASE = 'https://api.openai.com/v1';

export function buildOpenAiCall(baseUrl: string, req: TurnRequest, model: string, key: string | null, images: PreparedImage[]): HttpCall {
  const content =
    images.length > 0
      ? [
          ...images.map((i) => ({ type: 'input_image', image_url: `data:image/png;base64,${i.b64}`, detail: 'auto' })),
          { type: 'input_text', text: req.prompt },
        ]
      : req.prompt;
  const body: Record<string, unknown> = {
    model,
    instructions: req.system,
    input: [{ role: 'user', content }],
    max_output_tokens: req.maxOutputTokens,
    store: false,
    stream: true,
  };
  if (req.temperature !== null) body.temperature = req.temperature;
  const headers: Record<string, string> = { accept: 'text/event-stream' };
  if (key) headers.authorization = `Bearer ${key}`;
  return { url: `${baseUrl}/responses`, headers, body, parser: createOpenAiParser() };
}

export function createOpenAiKey(deps: AdapterDeps): HttpAdapter {
  return new HttpAdapter(
    {
      id: 'openai-key',
      billing: 'key',
      needsKey: true,
      model: (req) => keyModel(deps, 'openai-key', req),
      vision: async (m) => priceOf(deps.pricing, 'openai-key', m)?.vision === true,
      build: (req, model, key, images) => buildOpenAiCall(OPENAI_BASE, req, model, key, images),
      detect: () => detectProvider('openai-key', deps),
      costPaise: (req, model, tokensIn) => keyCostPaise(deps, 'openai-key', model, tokensIn, req.maxOutputTokens),
    },
    deps,
  );
}

/**
 * LM Studio through the openai-key path (08-2 §6.1): base URL override, no key, local billing (₹0). Images are not sent
 * (08-4 §30.10 `[verify at M3; else vision=false]`). The model is settings' pick, else the only one listed.
 */
export function createLmStudio(deps: AdapterDeps, opts: { baseUrl?: string; model?: () => string | undefined } = {}): HttpAdapter {
  const base = opts.baseUrl ?? LMSTUDIO_BASE;
  let detected: string[] = [];
  return new HttpAdapter(
    {
      id: 'openai-key',
      billing: 'local',
      needsKey: false,
      model: (req) => req.model ?? opts.model?.() ?? (detected.length === 1 ? detected[0] : undefined),
      vision: async () => false,
      build: (req, model, _key, images) => buildOpenAiCall(base, req, model, null, images),
      detect: async () => {
        const r = await detectLmStudio(deps);
        detected = r.models ?? [];
        return r;
      },
      costPaise: () => 0,
    },
    deps,
  );
}
