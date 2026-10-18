// Spec: 08-2 §6.3 row gemini-cli (`gemini [--output-format stream-json when probe finds it] [--model M]`, COMBINED on
// stdin, no resume; `tool_use` events → AI_PROTOCOL_VIOLATION as for Codex), §6.4 row gemini-cli (JSON mode deltas; text
// mode every stdout line, ANSI stripped), 08-4 §30.1 (cheap model, unknown-model retry).
import type { AdapterDeps } from './deps';
import { CliAdapter, combined, type BuiltCommand, type CliSpec } from './cliCommon';
import { createGeminiJsonParser, createPlainTextParser } from './parsers';
import type { CliProbe } from './probe';
import type { TurnRequest } from './types';

export function buildGeminiCommand(req: TurnRequest, probe: CliProbe, ctx: { scratch: string; model: string | undefined }): BuiltCommand {
  const c = probe.caps;
  const args: string[] = [];
  if (c.jsonStream) args.push('--output-format', 'stream-json');
  if (ctx.model && c.modelFlag) args.push('--model', ctx.model);
  return { args, stdin: combined(req.system, req.prompt), parser: c.jsonStream ? createGeminiJsonParser() : createPlainTextParser() };
}

export const geminiSpec: CliSpec = { id: 'gemini-cli', build: buildGeminiCommand, unknownModelRetry: true };

export function createGeminiCli(deps: AdapterDeps): CliAdapter {
  return new CliAdapter(geminiSpec, deps);
}
