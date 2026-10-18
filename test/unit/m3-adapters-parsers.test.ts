// 08-2 §6.4 stream parsing, §6.7 classification, 08-4 §30.1 models, §30.2 pricing, §30.3 SSE, §30.4 probe.
import { describe, expect, it } from 'vitest';
import {
  createAnthropicParser,
  createClaudeParser,
  createCodexParser,
  createGeminiJsonParser,
  createGoogleParser,
  createOllamaParser,
  createOpenAiParser,
  createPlainTextParser,
  type ParserEvent,
  type StreamParser,
} from '../../src/engine/ai/parsers';
import { classifyError, parseResetAt, parseRetryAfter, resetAtFor } from '../../src/engine/ai/classify';
import { loadPricing, paramsFor, resolveModel, temperatureFor } from '../../src/engine/ai/models';
import { parseCapabilities, parseVersion } from '../../src/engine/ai/probe';
import { LineReader, parseCmdShim, scrubEnv } from '../../src/engine/ai/ProcessHost';
import { fixture, fixtureLines, pricing } from './m3-adapters-helpers';

function run(p: StreamParser, lines: string[]): { events: ParserEvent[]; r: ReturnType<StreamParser['result']> } {
  const events = lines.flatMap((l) => p.push(l));
  return { events, r: p.result() };
}
const texts = (ev: ParserEvent[]): string =>
  ev
    .filter((e) => e.type === 'text')
    .map((e) => (e as { delta: string }).delta)
    .join('');

describe('claude-cli stream-json', () => {
  it('streams text_delta, takes usage only from the result envelope, reports the session', () => {
    const { events, r } = run(createClaudeParser(), fixtureLines('claude/stream-partial.jsonl'));
    expect(texts(events)).toBe('<say>Hello Vikas</say>');
    expect(r.text).toBe('<say>Hello Vikas</say>');
    expect(r.stopReason).toBe('end');
    expect(r.sessionId).toBe('5f0c7d1e-1111-4a2b-9c3d-000000000001');
    expect(events.filter((e) => e.type === 'session')).toHaveLength(1);
    expect(r.usage).toEqual({ tokensIn: 3, tokensOut: 8, cacheRead: 14000, cacheWrite: 1200, costUsd: 0.0123 });
    expect(r.modelReported).toBe('claude-sonnet-4-5-20250929');
  });
  it('without partial messages the assistant text is the delta', () => {
    const { events, r } = run(createClaudeParser(), fixtureLines('claude/stream-no-partial.jsonl'));
    expect(texts(events)).toBe('ready');
    expect(r.text).toBe('ready');
  });
  it('a missing metric is null, never 0', () => {
    const { r } = run(createClaudeParser(), fixtureLines('claude/result-missing-usage.jsonl'));
    expect(r.usage).toEqual({ tokensIn: 5, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null });
  });
  it('no terminal envelope → NULL usage and no stop reason', () => {
    const lines = fixtureLines('claude/stream-partial.jsonl').slice(0, 5);
    const { r } = run(createClaudeParser(), lines);
    expect(r.stopReason).toBeNull();
    expect(r.usage.tokensIn).toBeNull();
  });
  it('is_error:true is the failure envelope', () => {
    const { r } = run(createClaudeParser(), fixtureLines('claude/usage-limit.jsonl'));
    expect(r.stopReason).toBe('error');
    expect(r.errorText).toMatch(/usage limit/);
  });
  it('a tool_use block is a violation', () => {
    expect(run(createClaudeParser(), fixtureLines('claude/tool-use.jsonl')).r.violation).toBe('tool_use:Bash');
  });
  it('3 unparseable lines → incompatible', () => {
    expect(run(createClaudeParser(), fixtureLines('claude/garbage.txt')).r.incompatible).toBe(true);
    expect(run(createClaudeParser(), ['junk', ...fixtureLines('claude/stream-no-partial.jsonl')]).r.incompatible).toBe(false);
  });
});

describe('codex-cli exec --json', () => {
  it('prefix-diffs agent_message, reads turn.completed usage and thread id', () => {
    const { events, r } = run(createCodexParser(), fixtureLines('codex/exec-json.jsonl'));
    expect(events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta)).toEqual([
      '<say>Hello',
      ' Vikas',
      '</say>',
    ]);
    expect(r.text).toBe('<say>Hello Vikas</say>');
    expect(r.sessionId).toBe('0199a213-81c0-7800-8aa1-bbab2a035a53');
    expect(r.usage).toEqual({ tokensIn: 24763, tokensOut: 122, cacheRead: 24448, cacheWrite: null, costUsd: null });
    expect(r.stopReason).toBe('end');
  });
  it('command_execution item → violation', () => {
    const { events, r } = run(createCodexParser(), fixtureLines('codex/command-execution.jsonl'));
    expect(r.violation).toBe('command_execution');
    expect(events.some((e) => e.type === 'violation')).toBe(true);
  });
  it('turn.failed → error with its message', () => {
    const { r } = run(createCodexParser(), fixtureLines('codex/turn-failed-limit.jsonl'));
    expect(r.stopReason).toBe('error');
    expect(r.errorText).toMatch(/try again in 30 minutes/);
    expect(r.usage.tokensIn).toBeNull();
  });
});

describe('gemini-cli', () => {
  it('stream-json: assistant deltas and the result stats', () => {
    const { events, r } = run(createGeminiJsonParser(), fixtureLines('gemini/stream-json.jsonl'));
    expect(texts(events)).toBe('<say>Hello Vikas</say>');
    expect(r.usage).toEqual({ tokensIn: 100, tokensOut: 20, cacheRead: null, cacheWrite: null, costUsd: null });
    expect(r.modelReported).toBe('gemini-2.5-pro');
  });
  it('tool_use → violation', () => {
    expect(run(createGeminiJsonParser(), fixtureLines('gemini/tool-use.jsonl')).r.violation).toMatch(/^tool_use/);
  });
  it('text mode: every line, ANSI stripped, NULL usage', () => {
    const lines: string[] = [];
    const lr = new LineReader((l) => lines.push(l));
    lr.push(Buffer.from(fixture('gemini/text-mode.txt')));
    lr.end();
    const { r } = run(createPlainTextParser(), lines);
    expect(r.text).toBe('Hello Vikas\nsecond line');
    expect(r.usage.tokensIn).toBeNull();
  });
});

describe('ollama NDJSON', () => {
  it('message.content per chunk; final prompt_eval_count / eval_count', () => {
    const { events, r } = run(createOllamaParser(), fixtureLines('ollama/chat-stream.ndjson'));
    expect(texts(events)).toBe('<say>Hello Vikas</say>');
    expect(r.usage).toEqual({ tokensIn: 26, tokensOut: 9, cacheRead: null, cacheWrite: null, costUsd: null });
    expect(r.stopReason).toBe('end');
  });
  it('done_reason length → max_tokens; a missing eval_count is null', () => {
    const { r } = run(createOllamaParser(), fixtureLines('ollama/chat-length.ndjson'));
    expect(r.stopReason).toBe('max_tokens');
    expect(r.usage.tokensOut).toBeNull();
  });
  it('error field', () => {
    expect(run(createOllamaParser(), fixtureLines('ollama/error.ndjson')).r.errorText).toMatch(/not found/);
  });
});

describe('key-mode SSE (08-4 §30.3)', () => {
  it('openai responses: deltas, completed usage with cached tokens', () => {
    const { events, r } = run(createOpenAiParser(), fixtureLines('openai/responses-stream.sse'));
    expect(texts(events)).toBe('<say>Hello Vikas</say>');
    expect(r.usage).toEqual({ tokensIn: 328, tokensOut: 52, cacheRead: 256, cacheWrite: null, costUsd: null });
    expect(r.stopReason).toBe('end');
  });
  it('openai incomplete max_output_tokens → max_tokens; error event → error', () => {
    expect(run(createOpenAiParser(), fixtureLines('openai/responses-incomplete.sse')).r.stopReason).toBe('max_tokens');
    expect(run(createOpenAiParser(), fixtureLines('openai/responses-error.sse')).r.stopReason).toBe('error');
  });
  it('anthropic: message_start input + cache, message_delta output, end_turn → end', () => {
    const { events, r } = run(createAnthropicParser(), fixtureLines('anthropic/messages-stream.sse'));
    expect(texts(events)).toBe('<say>Hello Vikas</say>');
    expect(r.usage).toEqual({ tokensIn: 472, tokensOut: 15, cacheRead: 2000, cacheWrite: 100, costUsd: null });
    expect(r.stopReason).toBe('end');
    expect(run(createAnthropicParser(), fixtureLines('anthropic/messages-max-tokens.sse')).r.stopReason).toBe('max_tokens');
  });
  it('anthropic error event: overloaded → AI_SERVICE_DOWN, usage not counted', () => {
    const { r } = run(createAnthropicParser(), fixtureLines('anthropic/overloaded.sse'));
    expect(r.stopReason).toBe('error');
    expect(r.errorKind).toBe('AI_SERVICE_DOWN');
    expect(r.usage.tokensIn).toBeNull();
  });
  it('google: parts text, last chunk usageMetadata, finishReason mapping', () => {
    const { events, r } = run(createGoogleParser(), fixtureLines('google/stream.sse'));
    expect(texts(events)).toBe('<say>Hello Vikas</say>');
    expect(r.usage).toEqual({ tokensIn: 40, tokensOut: 6, cacheRead: 32, cacheWrite: null, costUsd: null });
    expect(r.stopReason).toBe('end');
    expect(run(createGoogleParser(), fixtureLines('google/stream-max-tokens.sse')).r.stopReason).toBe('max_tokens');
    expect(run(createGoogleParser(), fixtureLines('google/stream-safety.sse')).r.stopReason).toBe('error');
  });
});

describe('classifyError (08-2 §6.7, 08-4 §30.3)', () => {
  const p = 'claude-cli' as const;
  it.each([
    [{ providerId: p, message: '', timedOut: true }, 'plan', 'AI_TIMEOUT'],
    [{ providerId: p, message: '', online: false }, 'plan', 'NET_OFFLINE'],
    [{ providerId: p, message: 'fetch failed', code: 'ENOTFOUND' }, 'key', 'NET_OFFLINE'],
    [{ providerId: p, message: '', code: 'ECONNREFUSED' }, 'key', 'NET_OFFLINE'],
    [{ providerId: p, message: '', code: 'ETIMEDOUT' }, 'key', 'NET_OFFLINE'],
    [{ providerId: p, message: '', http: 401 }, 'key', 'AI_KEY_INVALID'],
    [{ providerId: p, message: '', http: 403 }, 'key', 'AI_KEY_INVALID'],
    [{ providerId: p, message: '', http: 401 }, 'plan', 'AI_SIGNED_OUT'],
    [{ providerId: p, message: '', http: 429 }, 'key', 'AI_LIMIT'],
    [{ providerId: p, message: '', http: 500 }, 'key', 'AI_SERVICE_DOWN'],
    [{ providerId: p, message: '', http: 503 }, 'key', 'AI_SERVICE_DOWN'],
    [{ providerId: p, message: '', http: 529 }, 'key', 'AI_SERVICE_DOWN'],
    [{ providerId: p, message: '', stderr: fixture('claude/signed-out.stderr.txt') }, 'plan', 'AI_SIGNED_OUT'],
    [{ providerId: p, message: 'Error: login required' }, 'plan', 'AI_SIGNED_OUT'],
    [{ providerId: p, message: 'invalid token' }, 'plan', 'AI_SIGNED_OUT'],
    [{ providerId: p, message: 'Claude AI usage limit reached ∙ resets 5pm' }, 'plan', 'AI_LIMIT'],
    [{ providerId: p, message: '', stderr: fixture('gemini/quota.stderr.txt') }, 'plan', 'AI_LIMIT'],
    [{ providerId: p, message: 'your limit resets at 3:00 PM' }, 'plan', 'AI_LIMIT'],
    [{ providerId: p, message: 'API Error: Overloaded' }, 'plan', 'AI_SERVICE_DOWN'],
    [{ providerId: p, message: 'Service Unavailable' }, 'plan', 'AI_SERVICE_DOWN'],
    [{ providerId: p, message: '', stderr: fixture('claude/unknown-flag.stderr.txt') }, 'plan', 'AI_CLI_INCOMPATIBLE'],
    [{ providerId: p, message: 'something else' }, 'plan', 'UNKNOWN'],
  ] as const)('%j (%s) → %s', (raw, billing, kind) => {
    expect(classifyError({ ...raw }, billing)).toBe(kind);
  });
});

describe('reset-time parsing', () => {
  // Fri 16 Oct 2026, 9:00 AM IST.
  const now = Date.UTC(2026, 9, 16, 3, 30);
  it('"resets 5pm" → today 5 PM in the user zone', () => {
    expect(new Date(parseResetAt('Claude AI usage limit reached ∙ resets 5pm', now, 'Asia/Kolkata')!).toISOString()).toBe(
      '2026-10-16T11:30:00.000Z',
    );
  });
  it('"resets at 8:30 am" already past → tomorrow', () => {
    expect(new Date(parseResetAt('limit resets at 8:30 am', now, 'Asia/Kolkata')!).toISOString()).toBe('2026-10-17T03:00:00.000Z');
  });
  it('12 am / 12 pm', () => {
    expect(new Date(parseResetAt('resets 12pm', now, 'Asia/Kolkata')!).toISOString()).toBe('2026-10-16T06:30:00.000Z');
    expect(new Date(parseResetAt('resets 12am', now, 'Asia/Kolkata')!).toISOString()).toBe('2026-10-16T18:30:00.000Z');
  });
  it('another zone', () => {
    expect(new Date(parseResetAt('resets 5pm', now, 'UTC')!).toISOString()).toBe('2026-10-16T17:00:00.000Z');
  });
  it('"try again in 30 minutes" / "in 2 hours"', () => {
    expect(parseResetAt('try again in 30 minutes.', now, 'Asia/Kolkata')).toBe(now + 30 * 60_000);
    expect(parseResetAt('Rate limit reached; try again in 2 hours.', now, 'Asia/Kolkata')).toBe(now + 2 * 3_600_000);
  });
  it('nothing → undefined; retry-after seconds win', () => {
    expect(parseResetAt('usage limit', now, 'Asia/Kolkata')).toBeUndefined();
    expect(resetAtFor({ providerId: 'openai-key', message: 'resets 5pm', retryAfterSec: 20 }, now, 'Asia/Kolkata')).toBe(now + 20_000);
    expect(parseRetryAfter('20')).toBe(20);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe('models and pricing (08-4 §30.1, §30.2)', () => {
  it('the seed file validates; a null defaultModel on a key provider is rejected', () => {
    expect(pricing.version).toBe('seed-M3');
    expect(pricing.usdToInr).toBe(88);
    expect(pricing.anthropicVersion).toBe('2023-06-01');
    const bad = JSON.parse(JSON.stringify(pricing));
    bad.models['openai-key'].defaultModel = null;
    expect(() => loadPricing(bad)).toThrow();
    const okCli = JSON.parse(JSON.stringify(pricing));
    okCli.models['claude-cli'].defaultModel = null;
    expect(() => loadPricing(okCli)).not.toThrow();
  });
  it('per-purpose parameters', () => {
    expect(paramsFor('verify')).toEqual({ tier: 'default', temperature: 0, maxOutputTokens: 10, timeoutMs: 20_000, stream: false });
    expect(paramsFor('intake')).toMatchObject({ temperature: 0.4, maxOutputTokens: 1200, timeoutMs: 60_000, stream: true });
    expect(paramsFor('step')).toMatchObject({ maxOutputTokens: 2000, timeoutMs: 180_000 });
    expect(paramsFor('second_look')).toMatchObject({ tier: 'cheap', maxOutputTokens: 200, timeoutMs: 20_000 });
    expect(paramsFor('routine', { routineUsesBrowser: true }).tier).toBe('default');
    expect(paramsFor('repair', { failed: { tier: 'cheap', maxOutputTokens: 800 } })).toMatchObject({
      tier: 'cheap',
      maxOutputTokens: 800,
      timeoutMs: 30_000,
    });
  });
  it('resolution order: settings → pricing → no flag; cheap → default', () => {
    expect(resolveModel('claude-cli', 'default', pricing)).toBeUndefined();
    expect(resolveModel('claude-cli', 'cheap', pricing)).toBe('haiku');
    expect(resolveModel('codex-cli', 'cheap', pricing)).toBe('gpt-5-mini');
    expect(resolveModel('anthropic-key', 'cheap', pricing)).toBe('claude-haiku-4-5');
    expect(resolveModel('openai-key', 'default', pricing)).toBe(pricing.models['openai-key'].defaultModel);
    expect(resolveModel('ollama', 'cheap', pricing, { model: 'qwen2.5:14b' })).toBe('qwen2.5:14b');
    expect(resolveModel('ollama', 'default', pricing)).toBeUndefined();
    expect(resolveModel('gemini-cli', 'cheap', pricing, { cheapModel: 'x' })).toBe('x');
    expect(temperatureFor('claude-cli', paramsFor('intake'))).toBeNull();
    expect(temperatureFor('ollama', paramsFor('intake'))).toBe(0.4);
  });
});

describe('probe parsing (08-4 §30.4)', () => {
  it('claude: full help', () => {
    const p = parseCapabilities('claude-cli', fixture('claude/help.txt'), parseVersion(fixture('claude/version.txt')));
    expect(p.version).toBe('2.0.14');
    expect(p.caps).toMatchObject({ systemPromptFile: true, resume: true, disableTools: 'flag', jsonStream: true, modelFlag: true, vision: false });
    expect(p.claudeToolsFlag).toBe('--tools');
    expect(p.partialMessages).toBe(true);
    expect(p.usable).toBe(true);
  });
  it('claude: no --append-system-prompt-file and no --tools → COMBINED + --disallowedTools', () => {
    const p = parseCapabilities('claude-cli', fixture('claude/help-old-no-sysfile-no-tools.txt'), null);
    expect(p.caps.systemPromptFile).toBe(false);
    expect(p.claudeToolsFlag).toBe('--disallowedTools');
    expect(p.usable).toBe(true);
  });
  it('claude: no way to turn tools off → unusable', () => {
    expect(parseCapabilities('claude-cli', fixture('claude/help-no-tool-switch.txt'), null).usable).toBe(false);
  });
  it('codex and gemini', () => {
    const c = parseCapabilities('codex-cli', fixture('codex/help.txt') + fixture('codex/exec-help.txt'), null);
    expect(c.caps).toMatchObject({ jsonStream: true, resume: true, disableTools: 'settings', modelFlag: true });
    expect(c.usable).toBe(true);
    const g = parseCapabilities('gemini-cli', fixture('gemini/help.txt'), null);
    expect(g.caps).toMatchObject({ jsonStream: true, modelFlag: true, resume: false });
    expect(parseCapabilities('gemini-cli', fixture('gemini/help-no-json.txt'), null).caps.jsonStream).toBe(false);
  });
});

describe('process plumbing', () => {
  it('LineReader: CRLF and UTF-8 split across chunks', () => {
    const out: string[] = [];
    const lr = new LineReader((l) => out.push(l));
    const b = Buffer.from('héllo ₹1\r\nnext\nlast', 'utf8');
    for (let i = 0; i < b.length; i++) lr.push(b.subarray(i, i + 1));
    lr.end();
    expect(out).toEqual(['héllo ₹1', 'next', 'last']);
  });
  it('env scrub', () => {
    const e = scrubEnv({ CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', PATH: 'x', TERM: 'xterm' });
    expect(e).toEqual({ PATH: 'x', NO_COLOR: '1', TERM: 'dumb' });
  });
  it('npm .cmd shim → target JS', () => {
    const shim = '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n';
    expect(parseCmdShim('/npm/codex.cmd', shim)).toBe('/npm/node_modules/@openai/codex/bin/codex.js');
    expect(parseCmdShim('/npm/x.cmd', 'echo hi')).toBeNull();
  });
});
