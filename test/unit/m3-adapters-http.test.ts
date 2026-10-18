// 08-4 §30.3 (key-mode bodies, headers, SSE, common HTTP rules), §30.10 (image parts), 08-2 §6.3 row ollama, §6.6
// (detect), §6.1 (LM Studio through openai-key). Every fetch is injected; nothing reaches the network.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { createOpenAiKey, createLmStudio } from '../../src/engine/ai/openaiKey';
import { createAnthropicKey } from '../../src/engine/ai/anthropicKey';
import { createGoogleKey } from '../../src/engine/ai/googleKey';
import { createOllama } from '../../src/engine/ai/ollama';
import { detectProvider } from '../../src/engine/ai/detect';
import { toDetectRow } from '../../src/engine/ai/AiRegistry';
import { fakeFetch, fixture, keyFor, makeDeps, pricing, req, sink, streamResponse, cleanupTmp } from './m3-adapters-helpers';

afterAll(cleanupTmp);

const KEYS = keyFor({ 'openai-key': 'sk-OPENAI-SECRET', 'anthropic-key': 'sk-ant-SECRET', 'google-key': 'AIza-SECRET' });
const sse = { status: 200, headers: { 'content-type': 'text/event-stream' } };

describe('openai-key', () => {
  it('body and header of 08-4 §30.3; deltas, usage', async () => {
    const f = fakeFetch(() => streamResponse(fixture('openai/responses-stream.sse'), sse));
    const s = sink();
    const r = await createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(req(), s, new AbortController().signal);
    expect(f.calls[0]!.url).toBe('https://api.openai.com/v1/responses');
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-OPENAI-SECRET');
    expect(f.calls[0]!.body).toEqual({
      model: pricing.models['openai-key'].defaultModel,
      instructions: 'SYSTEM TEXT',
      input: [{ role: 'user', content: 'PROMPT TEXT with "quotes" & spaces' }],
      max_output_tokens: 1200,
      temperature: 0.4,
      store: false,
      stream: true,
    });
    expect(r).toMatchObject({ text: '<say>Hello Vikas</say>', stopReason: 'end' });
    expect(r.usage).toEqual({ tokensIn: 328, tokensOut: 52, cacheRead: 256, cacheWrite: null, costUsd: null });
    expect(s.text.join('')).toBe('<say>Hello Vikas</say>');
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('images: input_image parts before input_text', async () => {
    const d = makeDeps({ getKey: KEYS });
    const png = path.join(d.root, 'a.png');
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const f = fakeFetch(() => streamResponse(fixture('openai/responses-stream.sse'), sse));
    d.fetch = f.fetch;
    await createOpenAiKey(d).runTurn(
      req({ attachments: [{ path: png, mime: 'image/png', bytes: 4 }] }),
      sink(),
      new AbortController().signal,
    );
    const body = f.calls[0]!.body as { input: { content: unknown[] }[] };
    expect(body.input[0]!.content).toEqual([
      { type: 'input_image', image_url: 'data:image/png;base64,iVBORw==', detail: 'auto' },
      { type: 'input_text', text: 'PROMPT TEXT with "quotes" & spaces' },
    ]);
  });

  it('attachments over 20 MB → PROTOCOL_INVALID before sending', async () => {
    const f = fakeFetch(() => streamResponse(''));
    const r = await createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(
      req({ attachments: [{ path: '/nope.png', mime: 'image/png', bytes: 21 * 1024 * 1024 }] }),
      sink(),
      new AbortController().signal,
    );
    expect(r.errorKind).toBe('PROTOCOL_INVALID');
    expect(f.calls).toHaveLength(0);
  });

  it('no key → AI_KEY_INVALID without a call', async () => {
    const f = fakeFetch(() => streamResponse(''));
    const r = await createOpenAiKey(makeDeps({ fetch: f.fetch })).runTurn(req(), sink(), new AbortController().signal);
    expect(r.errorKind).toBe('AI_KEY_INVALID');
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    [401, {}, 'AI_KEY_INVALID'],
    [403, {}, 'AI_KEY_INVALID'],
    [429, { 'retry-after': '30' }, 'AI_LIMIT'],
    [500, {}, 'AI_SERVICE_DOWN'],
    [503, {}, 'AI_SERVICE_DOWN'],
    [529, {}, 'AI_SERVICE_DOWN'],
  ] as const)('HTTP %i → %s', async (status, headers, kind) => {
    const clock = new FakeClock();
    const f = fakeFetch(() => new Response(fixture('openai/401.json'), { status, headers }));
    const r = await createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS, clock })).runTurn(req(), sink(), new AbortController().signal);
    expect(r).toMatchObject({ stopReason: 'error', errorKind: kind });
    if (status === 429) expect(r.resetAt).toBe(clock.now() + 30_000);
  });

  it('body over 1 MB → PROTOCOL_INVALID', async () => {
    const big = `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"${'x'.repeat(1_100_000)}"}\n\n`;
    const f = fakeFetch(() => streamResponse(big, sse, 64 * 1024));
    const s = sink();
    const r = await createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(req(), s, new AbortController().signal);
    expect(r.errorKind).toBe('PROTOCOL_INVALID');
    expect(s.text).toEqual([]);
  });

  it('network error → NET_OFFLINE', async () => {
    const f = fakeFetch(() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })));
    const r = await createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(req(), sink(), new AbortController().signal);
    expect(r.errorKind).toBe('NET_OFFLINE');
  });

  it('timeout → AI_TIMEOUT, nothing posted after it', async () => {
    const clock = new FakeClock();
    let enqueue: ((s: string) => void) | undefined;
    const f = fakeFetch(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              enqueue = (s) => c.enqueue(new TextEncoder().encode(s));
            },
          }),
          sse,
        ),
    );
    const s = sink();
    const p = createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS, clock })).runTurn(
      req({ timeoutMs: 60_000 }),
      s,
      new AbortController().signal,
    );
    await new Promise((r) => setTimeout(r, 20));
    enqueue!('data: {"type":"response.output_text.delta","delta":"early"}\n\n');
    await new Promise((r) => setTimeout(r, 20));
    clock.advance(60_000);
    const r = await p;
    expect(r).toMatchObject({ errorKind: 'AI_TIMEOUT', text: '' });
    expect(s.text).toEqual(['early']);
  });

  it('cancel(turnId) aborts → cancelled', async () => {
    const f = fakeFetch(
      (_u, init) =>
        new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))),
    );
    const a = createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS }));
    const p = a.runTurn(req({ turnId: 'k1' }), sink(), new AbortController().signal);
    await new Promise((r) => setTimeout(r, 10));
    await a.cancel('k1');
    await a.cancel('k1');
    expect((await p).stopReason).toBe('cancelled');
  });

  it('estimate prices key turns from pricing.json in paise', () => {
    const a = createOpenAiKey(makeDeps());
    const e = a.estimate(req({ system: 'x'.repeat(4000), prompt: 'y'.repeat(4000) }));
    expect(e.tokensIn).toBe(2000);
    expect(e.tokensOutMax).toBe(1200);
    const p = pricing.providers['openai-key'].models[pricing.models['openai-key'].defaultModel]!;
    expect(e.costPaise).toBe(Math.ceil(((2000 * p.inPerMTokUsd + 1200 * p.outPerMTokUsd) / 1e6) * 88 * 100));
  });

  it('verify: "ready" in the reply → ok; max_tokens with ready still ok', async () => {
    const f = fakeFetch(() => streamResponse(fixture('openai/responses-incomplete.sse'), sse));
    const v = await createOpenAiKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).verify(new AbortController().signal);
    expect(v.ok).toBe(true);
    expect(f.calls[0]!.body).toMatchObject({
      input: [{ role: 'user', content: 'Reply with the word ready' }],
      max_output_tokens: 10,
      temperature: 0,
    });
  });
});

describe('anthropic-key', () => {
  it('body, x-api-key and anthropic-version from pricing.json', async () => {
    const f = fakeFetch(() => streamResponse(fixture('anthropic/messages-stream.sse'), sse));
    const r = await createAnthropicKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(
      req({ purpose: 'classify', temperature: 0, maxOutputTokens: 200 }),
      sink(),
      new AbortController().signal,
    );
    const h = f.calls[0]!.init.headers as Record<string, string>;
    expect(f.calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(h['x-api-key']).toBe('sk-ant-SECRET');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(f.calls[0]!.body).toEqual({
      model: 'claude-haiku-4-5',
      system: 'SYSTEM TEXT',
      messages: [{ role: 'user', content: 'PROMPT TEXT with "quotes" & spaces' }],
      max_tokens: 200,
      temperature: 0,
      stream: true,
    });
    expect(r.usage).toEqual({ tokensIn: 472, tokensOut: 15, cacheRead: 2000, cacheWrite: 100, costUsd: null });
  });
  it('image parts first; mid-stream overloaded → AI_SERVICE_DOWN; 401 → AI_KEY_INVALID', async () => {
    const d = makeDeps({ getKey: KEYS });
    const png = path.join(d.root, 'a.png');
    writeFileSync(png, Buffer.from([1, 2, 3]));
    const f = fakeFetch(() => streamResponse(fixture('anthropic/overloaded.sse'), sse));
    d.fetch = f.fetch;
    const r = await createAnthropicKey(d).runTurn(
      req({ attachments: [{ path: png, mime: 'image/png', bytes: 3 }] }),
      sink(),
      new AbortController().signal,
    );
    expect((f.calls[0]!.body as { messages: { content: unknown[] }[] }).messages[0]!.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AQID' },
    });
    expect(r.errorKind).toBe('AI_SERVICE_DOWN');
    const f2 = fakeFetch(() => new Response(fixture('anthropic/401.json'), { status: 401 }));
    expect(
      (await createAnthropicKey(makeDeps({ fetch: f2.fetch, getKey: KEYS })).runTurn(req(), sink(), new AbortController().signal))
        .errorKind,
    ).toBe('AI_KEY_INVALID');
  });
});

describe('google-key', () => {
  it('URL with model and alt=sse, x-goog-api-key, body; usage from the last chunk', async () => {
    const f = fakeFetch(() => streamResponse(fixture('google/stream.sse'), sse));
    const r = await createGoogleKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(req(), sink(), new AbortController().signal);
    expect(f.calls[0]!.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${pricing.models['google-key'].defaultModel}:streamGenerateContent?alt=sse`,
    );
    expect((f.calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-SECRET');
    expect(f.calls[0]!.body).toEqual({
      systemInstruction: { parts: [{ text: 'SYSTEM TEXT' }] },
      contents: [{ role: 'user', parts: [{ text: 'PROMPT TEXT with "quotes" & spaces' }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
    });
    expect(r).toMatchObject({ text: '<say>Hello Vikas</say>', stopReason: 'end' });
    expect(r.usage.cacheRead).toBe(32);
  });
  it('403 → AI_KEY_INVALID; SAFETY finish → error', async () => {
    const f = fakeFetch(() => new Response(fixture('google/403.json'), { status: 403 }));
    expect(
      (await createGoogleKey(makeDeps({ fetch: f.fetch, getKey: KEYS })).runTurn(req(), sink(), new AbortController().signal)).errorKind,
    ).toBe('AI_KEY_INVALID');
    const f2 = fakeFetch(() => streamResponse(fixture('google/stream-safety.sse'), sse));
    expect(
      (await createGoogleKey(makeDeps({ fetch: f2.fetch, getKey: KEYS })).runTurn(req(), sink(), new AbortController().signal)).stopReason,
    ).toBe('error');
  });
});

describe('ollama and LM Studio', () => {
  const tags = (): Response => new Response(fixture('ollama/tags.json'), { status: 200 });
  it('real /api/tags: cloud models (remote_host) and the embedding model are left out → nothing to test', async () => {
    const a = createOllama(makeDeps({ fetch: fakeFetch(() => tags()).fetch }));
    const r = await a.detect();
    expect(r).toEqual({ found: true, state: 'running_local', models: [] });
    expect(toDetectRow('ollama', r).state).toBe('not_found');
  });
  it('detect lists local chat models largest first; /api/chat body with num_ctx 16384', async () => {
    const local = {
      models: [
        { name: 'llama3.2:3b', size: 2019393189, details: { families: ['llama'] } },
        { name: 'qwen2.5:14b', size: 8988124069, details: { families: ['qwen2'] } },
        { name: 'nomic-embed-text:latest', size: 274302450, details: { families: ['nomic-bert'] } },
        { name: 'gemma4:31b-cloud', size: 342, remote_host: 'https://ollama.com:443' },
      ],
    };
    const f = fakeFetch((url) =>
      url.endsWith('/api/tags') ? new Response(JSON.stringify(local)) : streamResponse(fixture('ollama/chat-stream.ndjson')),
    );
    const d = makeDeps({ fetch: f.fetch, providerSettings: (p) => (p === 'ollama' ? { model: 'qwen2.5:14b' } : undefined) });
    const a = createOllama(d);
    expect(await a.detect()).toEqual({ found: true, state: 'running_local', models: ['qwen2.5:14b', 'llama3.2:3b'] });
    const r = await a.runTurn(req(), sink(), new AbortController().signal);
    const chat = f.calls.find((c) => c.url.endsWith('/api/chat'))!;
    expect(chat.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(chat.body).toEqual({
      model: 'qwen2.5:14b',
      messages: [
        { role: 'system', content: 'SYSTEM TEXT' },
        { role: 'user', content: 'PROMPT TEXT with "quotes" & spaces' },
      ],
      stream: true,
      options: { num_ctx: 16384, temperature: 0.4 },
    });
    expect(r.usage).toEqual({ tokensIn: 34, tokensOut: 10, cacheRead: 0, cacheWrite: null, costUsd: null });
    expect(r.text).toBe('<say>Hello, Vikas!</say>');
    expect(a.estimate(req()).costPaise).toBe(0);
  });
  it.each([
    ['ollama/error.ndjson', 404, 'UNKNOWN'],
    ['ollama/not-chat-model.ndjson', 400, 'UNKNOWN'],
    ['ollama/paid-model-error.ndjson', 403, 'AI_LIMIT'],
    ['ollama/paid-model-error.ndjson', 200, 'AI_LIMIT'],
  ] as const)('%s (HTTP %i) → %s', async (file, status, kind) => {
    const f = fakeFetch(() => new Response(fixture(file), { status }));
    const r = await createOllama(makeDeps({ fetch: f.fetch, providerSettings: () => ({ model: 'm' }) })).runTurn(
      req(),
      sink(),
      new AbortController().signal,
    );
    expect(r).toMatchObject({ stopReason: 'error', errorKind: kind });
  });
  it('not running → not_installed; refused connection on a turn → AI_SERVICE_DOWN; images need clip', async () => {
    const refused = (): Promise<Response> =>
      Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    const d = makeDeps({ fetch: fakeFetch(refused).fetch, providerSettings: () => ({ model: 'llama3.2:3b' }) });
    expect((await createOllama(d).detect()).state).toBe('not_installed');
    expect((await createOllama(d).runTurn(req(), sink(), new AbortController().signal)).errorKind).toBe('AI_SERVICE_DOWN');
    const show = fakeFetch((url) =>
      url.endsWith('/api/show') ? new Response(JSON.stringify({ details: { families: ['llama'] } })) : streamResponse(''),
    );
    const r = await createOllama(makeDeps({ fetch: show.fetch, providerSettings: () => ({ model: 'llama3.2:3b' }) })).runTurn(
      req({ attachments: [{ path: '/x.png', mime: 'image/png', bytes: 1 }] }),
      sink(),
      new AbortController().signal,
    );
    expect(r.errorKind).toBe('AI_NO_VISION');
  });
  it('detect waits at most 1 s on localhost', async () => {
    const clock = new FakeClock();
    const hang = fakeFetch(
      (_u, init) => new Promise<Response>((_r, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    const p = detectProvider('ollama', makeDeps({ fetch: hang.fetch, clock }));
    clock.advance(1000);
    expect((await p).state).toBe('not_installed');
  });
  it('LM Studio: openai path on the local base URL, no key header', async () => {
    const f = fakeFetch((url) =>
      url.endsWith('/models')
        ? new Response(JSON.stringify({ data: [{ id: 'qwen2.5-7b-instruct' }] }))
        : streamResponse(fixture('openai/responses-stream.sse'), sse),
    );
    const a = createLmStudio(makeDeps({ fetch: f.fetch }));
    expect((await a.detect()).models).toEqual(['qwen2.5-7b-instruct']);
    const r = await a.runTurn(req(), sink(), new AbortController().signal);
    const call = f.calls.find((c) => c.url.endsWith('/responses'))!;
    expect(call.url).toBe('http://127.0.0.1:1234/v1/responses');
    expect((call.init.headers as Record<string, string>).authorization).toBeUndefined();
    expect((call.body as { model: string }).model).toBe('qwen2.5-7b-instruct');
    expect(r.stopReason).toBe('end');
    expect(a.billing).toBe('local');
  });
});

describe('key detect (08-2 §6.6)', () => {
  it('vault → ready; env var → key_in_env with its name; none → not_installed', async () => {
    expect((await detectProvider('openai-key', makeDeps({ getKey: KEYS }))).state).toBe('ready');
    expect(await detectProvider('google-key', makeDeps({}, { GOOGLE_API_KEY: 'x' }))).toEqual({
      found: true,
      state: 'key_in_env',
      envKeyName: 'GOOGLE_API_KEY',
    });
    expect((await detectProvider('anthropic-key', makeDeps())).state).toBe('not_installed');
  });
});
