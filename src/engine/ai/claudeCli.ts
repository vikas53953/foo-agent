// Spec: 08-2 §6.3 row claude-cli (exact argv; prompt on stdin; system text in {LOCAL}\ai-scratch\claude-cli\sys-{turnId}.md;
// `--tools ""`, else `--disallowedTools` with the built-in list + `--permission-mode plan`; `--resume SID`), §6.4 row
// claude-cli, 08-4 §30.4 (no `--append-system-prompt-file` → COMBINED stdin; no stream-json → plain text), §30.8.
import type { AdapterDeps } from './deps';
import { CliAdapter, combined, systemFilePath, type BuiltCommand, type CliSpec } from './cliCommon';
import { createClaudeParser, createPlainTextParser } from './parsers';
import type { CliProbe } from './probe';
import type { TurnRequest } from './types';

/** Claude Code's built-in tools, for the `--disallowedTools` fallback only (seed list; pin at the M3 spike). */
export const CLAUDE_BUILTIN_TOOLS = [
  'Bash',
  'BashOutput',
  'KillShell',
  'Edit',
  'MultiEdit',
  'Write',
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookEdit',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'ExitPlanMode',
  'SlashCommand',
];

export function buildClaudeCommand(req: TurnRequest, probe: CliProbe, ctx: { scratch: string; model: string | undefined }): BuiltCommand {
  const c = probe.caps;
  const args = ['-p'];
  if (c.jsonStream) {
    args.push('--output-format', 'stream-json', '--verbose');
    if (req.stream && probe.partialMessages) args.push('--include-partial-messages');
  }
  let stdin = req.prompt;
  let systemFile: BuiltCommand['systemFile'];
  if (c.systemPromptFile) {
    const p = systemFilePath(ctx.scratch, req.turnId);
    systemFile = { path: p, text: req.system };
    args.push('--append-system-prompt-file', p);
  } else {
    stdin = combined(req.system, req.prompt);
  }
  if (req.resumeSessionId && c.resume) args.push('--resume', req.resumeSessionId);
  if (ctx.model && c.modelFlag) args.push('--model', ctx.model);
  args.push('--max-turns', '1');
  if (probe.claudeToolsFlag === '--tools') args.push('--tools', '');
  else args.push('--disallowedTools', ...CLAUDE_BUILTIN_TOOLS, '--permission-mode', 'plan');
  args.push('--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--settings', '{"disableAllHooks":true}');
  const out: BuiltCommand = { args, stdin, parser: c.jsonStream ? createClaudeParser() : createPlainTextParser() };
  if (systemFile) out.systemFile = systemFile;
  return out;
}

export const claudeSpec: CliSpec = { id: 'claude-cli', build: buildClaudeCommand, unknownModelRetry: false };

export function createClaudeCli(deps: AdapterDeps): CliAdapter {
  return new CliAdapter(claudeSpec, deps);
}
