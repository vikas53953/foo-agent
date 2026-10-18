// Spec: 08-2 §6.5 (capability probe: `<bin> --version` and `<bin> --help`, 8 s, 2 MiB cap; only a missing way to
// disable the CLI's own tools is fatal → verify returns AI_CLI_INCOMPATIBLE), 08-4 §30.4 (what `--help` must contain and
// each fallback), §30.10 (CLIs are vision=false in v1).
import type { ProviderId } from '../../shared/types';
import type { Capabilities } from './types';
import type { ProcessHost } from './ProcessHost';

export const PROBE_TIMEOUT_MS = 8000;
export const PROBE_MAX_BYTES = 2 * 1024 * 1024;

export type CliId = Extract<ProviderId, 'claude-cli' | 'codex-cli' | 'gemini-cli'>;

export interface CliProbe {
  version: string | null;
  caps: Capabilities;
  /** False when no way to disable the CLI's own tools was found (08-4 §30.4: no fallback). */
  usable: boolean;
  /** claude-cli: which tools switch exists (`--tools ""` preferred, else `--disallowedTools` + `--permission-mode plan`). */
  claudeToolsFlag?: '--tools' | '--disallowedTools';
  /** claude-cli: `--include-partial-messages` exists (deltas while streaming; else the whole message at once). */
  partialMessages: boolean;
}

const has = (help: string, re: RegExp): boolean => re.test(help);
const flag = (name: string): RegExp => new RegExp(`(^|[\\s,\\[])${name.replace(/[-]/g, '\\-')}(?![\\w-])`, 'm');

/** Pure: capabilities from the help text (fixture-tested). */
export function parseCapabilities(providerId: CliId, help: string, version: string | null): CliProbe {
  const base: Capabilities = {
    stdinPrompt: true,
    systemPromptFile: false,
    appendSystemPrompt: false,
    resume: false,
    disableTools: 'none',
    jsonStream: false,
    modelFlag: false,
    vision: false,
  };
  if (providerId === 'claude-cli') {
    const tools = has(help, flag('--tools'));
    const disallowed = has(help, flag('--disallowedTools')) || has(help, flag('--disallowed-tools'));
    const caps: Capabilities = {
      ...base,
      // claude 2.1.282 hides the option from its own list; it is named only as `--append-system-prompt[-file]` (real help).
      systemPromptFile: has(help, flag('--append-system-prompt-file')) || help.includes('--append-system-prompt[-file]'),
      appendSystemPrompt: has(help, flag('--append-system-prompt')),
      resume: has(help, flag('--resume')),
      disableTools: tools || disallowed ? 'flag' : 'none',
      jsonStream: help.includes('stream-json'),
      modelFlag: has(help, flag('--model')),
    };
    const p: CliProbe = { version, caps, usable: tools || disallowed, partialMessages: has(help, flag('--include-partial-messages')) };
    if (tools) p.claudeToolsFlag = '--tools';
    else if (disallowed) p.claudeToolsFlag = '--disallowedTools';
    return p;
  }
  if (providerId === 'codex-cli') {
    // `sandbox_mode` (08-4 §30.4) or the `--sandbox` option that sets it.
    const sandbox = help.includes('sandbox_mode') || has(help, flag('--sandbox'));
    const caps: Capabilities = {
      ...base,
      resume: /(^|\s)resume(\s|$)/m.test(help),
      disableTools: sandbox ? 'settings' : 'none',
      jsonStream: has(help, flag('--json')),
      modelFlag: has(help, flag('-m')) || has(help, flag('--model')),
    };
    return { version, caps, usable: sandbox, partialMessages: false };
  }
  // gemini-cli: no tools in non-interactive mode, none needed (08-4 §30.4); no resume (08-2 §6.3).
  const caps: Capabilities = {
    ...base,
    jsonStream: help.includes('stream-json'),
    modelFlag: has(help, flag('--model')) || has(help, flag('-m')),
  };
  return { version, caps, usable: true, partialMessages: false };
}

export function parseVersion(out: string): string | null {
  const m = /\d+\.\d+(\.\d+)?([-+.][\w.]+)?/.exec(out);
  return m ? m[0] : null;
}

/** Runs `--version` and `--help` (plus `exec --help` for codex, where `--json` lives). */
export async function probeCli(
  providerId: CliId,
  bin: string,
  host: ProcessHost,
  signal: AbortSignal = new AbortController().signal,
): Promise<CliProbe> {
  const capture = async (args: string[]): Promise<string | null> => {
    const lines: string[] = [];
    const out = await host.run({
      providerId,
      bin,
      args,
      stdin: '',
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
      maxStdoutBytes: PROBE_MAX_BYTES,
      onLine: (l) => lines.push(l),
    });
    if (out.spawnError || out.timedOut || out.cancelled) return null;
    const text = lines.join('\n');
    return text.trim() === '' ? out.stderr : text;
  };
  const versionOut = await capture(['--version']);
  let help = (await capture(['--help'])) ?? '';
  if (providerId === 'codex-cli') help += '\n' + ((await capture(['exec', '--help'])) ?? '');
  return parseCapabilities(providerId, help, versionOut === null ? null : parseVersion(versionOut));
}
