// Spec: 08-2 §6.3 row ollama (HTTP POST /api/chat { model, messages:[system,user], stream, options:{ num_ctx: 16384,
// temperature } }), §6.4 row ollama, §6.6 (detect GET /api/tags, 1 s), 08-4 §30.5 (one model → used; the pick lives in
// settings.ai.providers.ollama.model), §30.10 (images: `images: [b64]` on the user message; vision when /api/show
// details.families has clip or mllama).
import type { AdapterDeps } from './deps';
import { HttpAdapter, type HttpCall, type PreparedImage } from './httpCommon';
import { createOllamaParser } from './parsers';
import { detectOllama, OLLAMA_BASE } from './detect';
import { classifyError } from './classify';
import type { TurnRequest } from './types';

export const OLLAMA_NUM_CTX = 16384;

export function buildOllamaCall(req: TurnRequest, model: string, images: PreparedImage[], base = OLLAMA_BASE): HttpCall {
  const user: Record<string, unknown> = { role: 'user', content: req.prompt };
  if (images.length > 0) user.images = images.map((i) => i.b64);
  const options: Record<string, unknown> = { num_ctx: OLLAMA_NUM_CTX };
  if (req.temperature !== null) options.temperature = req.temperature;
  return {
    url: `${base}/api/chat`,
    headers: {},
    body: { model, messages: [{ role: 'system', content: req.system }, user], stream: req.stream, options },
    parser: createOllamaParser(),
  };
}

export function createOllama(deps: AdapterDeps): HttpAdapter {
  let detected: string[] = [];
  const vision = new Map<string, boolean>();
  return new HttpAdapter(
    {
      id: 'ollama',
      billing: 'local',
      needsKey: false,
      model: (req) => req.model ?? deps.providerSettings?.('ollama')?.model ?? (detected.length === 1 ? detected[0] : undefined),
      vision: async (m) => {
        const hit = vision.get(m);
        if (hit !== undefined) return hit;
        let v = false;
        try {
          const r = await deps.fetch(`${OLLAMA_BASE}/api/show`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: m }),
          });
          if (r.ok) {
            const j = (await r.json()) as { details?: { families?: unknown } };
            const fam = Array.isArray(j.details?.families) ? (j.details.families as unknown[]) : [];
            v = fam.includes('clip') || fam.includes('mllama');
          }
        } catch {
          v = false;
        }
        vision.set(m, v);
        return v;
      },
      build: (req, model, _key, images) => buildOllamaCall(req, model, images),
      detect: async () => {
        const r = await detectOllama(deps);
        detected = r.models ?? [];
        return r;
      },
      costPaise: () => 0,
      // A refused localhost connection means the local server is not answering, not that the PC is offline.
      classify: (raw) => {
        if (raw.code === 'ECONNREFUSED') return 'AI_SERVICE_DOWN';
        return classifyError(raw, 'local');
      },
    },
    deps,
  );
}
