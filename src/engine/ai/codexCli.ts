// Spec: 08-2 §6.3 row codex-cli (`codex exec --json --skip-git-repo-check -C {cwd} -c sandbox_mode="read-only" [-m M]
// [-c model_reasoning_effort="low" on cheap purposes] -`; resume `codex exec resume SID --json --skip-git-repo-check -`;
// COMBINED on stdin; any `command_execution` item → AI_PROTOCOL_VIOLATION), §6.4 row codex-cli, 08-4 §30.1 (cheap model,
// unknown-model retry once without -m), §30.4 (no --json → plain text).
import type { AdapterDeps } from './deps';
import { CliAdapter, combined, type BuiltCommand, type CliSpec } from './cliCommon';
import { createCodexParser, createPlainTextParser } from './parsers';
import { isCheapPurpose } from './models';
import type { CliProbe } from './probe';
import type { TurnRequest } from './types';

export function buildCodexCommand(req: TurnRequest, probe: CliProbe, ctx: { scratch: string; model: string | undefined }): BuiltCommand {
  const c = probe.caps;
  const json = c.jsonStream ? ['--json'] : [];
  const model = ctx.model && c.modelFlag ? ['-m', ctx.model] : [];
  const effort = isCheapPurpose(req.purpose) ? ['-c', 'model_reasoning_effort="low"'] : [];
  let args: string[];
  if (req.resumeSessionId && c.resume) {
    // The read-only sandbox is kept on resume too (08-1 §1.3 rule 2 is safety; implementation-notes M3).
    args = [
      'exec',
      'resume',
      req.resumeSessionId,
      ...json,
      '--skip-git-repo-check',
      '-c',
      'sandbox_mode="read-only"',
      ...model,
      ...effort,
      '-',
    ];
  } else {
    args = ['exec', ...json, '--skip-git-repo-check', '-C', ctx.scratch, '-c', 'sandbox_mode="read-only"', ...model, ...effort, '-'];
  }
  return { args, stdin: combined(req.system, req.prompt), parser: c.jsonStream ? createCodexParser() : createPlainTextParser() };
}

export const codexSpec: CliSpec = { id: 'codex-cli', build: buildCodexCommand, unknownModelRetry: true };

export function createCodexCli(deps: AdapterDeps): CliAdapter {
  return new CliAdapter(codexSpec, deps);
}
