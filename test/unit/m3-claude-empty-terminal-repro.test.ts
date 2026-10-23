import { describe, expect, it } from 'vitest';
import { createClaudeParser } from '../../src/engine/ai/parsers';

const assistant = (text: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-test',
      stop_reason: null,
      content: [{ type: 'text', text }],
    },
    session_id: 'parser-repro-session',
  });

const delta = (text: string): string =>
  JSON.stringify({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
    },
    session_id: 'parser-repro-session',
  });

type ResultOptions = { is_error?: boolean; stop_reason?: string };
const result = (text: string, options: ResultOptions = {}): string =>
  JSON.stringify({
    type: 'result',
    result: text,
    stop_reason: options.stop_reason ?? 'end_turn',
    ...(options.is_error === undefined ? {} : { is_error: options.is_error }),
    usage: { input_tokens: 1, output_tokens: 1 },
    session_id: 'parser-repro-session',
  });

const parse = (lines: string[]) => {
  const parser = createClaudeParser();
  for (const line of lines) parser.push(line);
  return parser.result();
};

const actOnly = '<act>{"decision":{"kind":"reply"},"usedMemoryIds":[]}</act>';

describe('Claude provider terminal-result precedence reproduction', () => {
  it('falls back to assistant text for an empty successful result (instance 1)', () => {
    const parsed = parse([assistant('<say>Provider answer</say>'), result('')]);
    expect(parsed.text).toBe('<say>Provider answer</say>');
    expect(parsed.stopReason).toBe('end');
  });

  it('falls back to streamed text for an empty successful result (instance 2)', () => {
    const parsed = parse([delta('<say>Provider answer</say>'), result('')]);
    expect(parsed.text).toBe('<say>Provider answer</say>');
    expect(parsed.stopReason).toBe('end');
  });

  it('preserves valid terminal result precedence over streamed assistant text', () => {
    const parsed = parse([assistant('<say>Stale stream</say>'), result('<say>Final result</say>')]);
    expect(parsed.text).toBe('<say>Final result</say>');
  });

  it('keeps a nonempty act-only terminal result authoritative', () => {
    const parsed = parse([assistant('<say>Provider answer</say>'), result(actOnly)]);
    expect(parsed.text).toBe(actOnly);
    expect(parsed.stopReason).toBe('end');
  });

  it('preserves error terminal semantics', () => {
    const parsed = parse([assistant('<say>Partial answer</say>'), result('provider failure', { is_error: true })]);
    expect(parsed.stopReason).toBe('error');
    expect(parsed.errorText).toBe('provider failure');
    expect(parsed.text).toBe('<say>Partial answer</say>');
  });

  it('preserves max-tokens terminal semantics for an empty result', () => {
    const parsed = parse([assistant('<say>Partial answer</say>'), result('', { stop_reason: 'max_tokens' })]);
    expect(parsed.stopReason).toBe('max_tokens');
    expect(parsed.text).toBe('');
  });
});
