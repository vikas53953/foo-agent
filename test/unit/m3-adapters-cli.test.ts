// 08-2 §6.3 (argv, stdin-only prompt, cwd, env scrub, .cmd shim, kill tree), §6.5 (probe fallbacks, AI_PROTOCOL_VIOLATION),
// §6.7, 08-4 §30.1 (unknown-model retry), §30.4, §30.7 (timeout, no late text), §30.8 (system file), §30.10 (no vision).
// Runs the fake CLIs of test/fakes/fake-cli on this machine; never a real provider.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { createClaudeCli } from '../../src/engine/ai/claudeCli';
import { createCodexCli } from '../../src/engine/ai/codexCli';
import { createGeminiCli } from '../../src/engine/ai/geminiCli';
import { sweepSystemFiles } from '../../src/engine/ai/cliCommon';
import type { AdapterDeps } from '../../src/engine/ai/deps';
import { alive, FIX, makeDeps, readDump, req, sink, waitFor, type TestDeps, cleanupTmp } from './m3-adapters-helpers';

afterAll(cleanupTmp);

const posix = process.platform !== 'win32';

function cliDeps(
  provider: 'claude' | 'codex' | 'gemini',
  env: Record<string, string>,
  over: Partial<AdapterDeps> = {},
): TestDeps & { dump: string } {
  const d = makeDeps(over, {
    FAKE_CLI_HELP: path.join(FIX, provider, 'help.txt'),
    FAKE_CLI_VERSION: path.join(FIX, provider, 'version.txt'),
    ...(provider === 'codex' ? { FAKE_CLI_EXEC_HELP: path.join(FIX, 'codex/exec-help.txt') } : {}),
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    FAKE_MARKER: 'kept',
    ...env,
  });
  const dump = path.join(d.root, 'dump.json');
  d.env.FAKE_CLI_DUMP = dump;
  const creds: Record<string, string> = {
    claude: '.claude/.credentials.json',
    codex: '.codex/auth.json',
    gemini: '.gemini/oauth_creds.json',
  };
  const f = path.join(d.home, creds[provider]!);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, '{}');
  return Object.assign(d, { dump });
}
const fx = (p: string): string => path.join(FIX, p);

describe('claude-cli', () => {
  it('exact argv; prompt only on stdin; system file written before spawn and deleted after; cwd; env scrub', async () => {
    const d = cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl') });
    const a = createClaudeCli(d);
    expect((await a.detect()).state).toBe('ready');
    const s = sink();
    const r = await a.runTurn(req({ turnId: 'turn-42' }), s, new AbortController().signal);
    const dump = readDump(d.dump);
    const scratch = path.join(d.paths.LOCAL, 'ai-scratch', 'claude-cli');
    const sys = path.join(scratch, 'sys-turn-42.md');
    expect(dump.argv).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--append-system-prompt-file',
      sys,
      '--max-turns',
      '1',
      '--tools',
      '',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--setting-sources',
      '',
      '--settings',
      '{"disableAllHooks":true}',
    ]);
    expect(dump.argv.join(' ')).not.toContain('PROMPT TEXT');
    expect(dump.stdin).toBe('PROMPT TEXT with "quotes" & spaces');
    expect(dump.systemFile).toEqual({ path: sys, existed: true, text: 'SYSTEM TEXT' });
    expect(existsSync(sys)).toBe(false);
    expect(dump.cwd).toBe(scratch);
    expect(dump.env).toEqual({ NO_COLOR: '1', TERM: 'dumb', ELECTRON_RUN_AS_NODE: '1', FAKE_MARKER: 'kept' });
    expect(r).toMatchObject({ text: '<say>Hello, Vikas!</say>', stopReason: 'end', sessionId: '00000000-0000-4000-8000-0000000000a2' });
    expect(r.usage).toMatchObject({ tokensOut: 17, planUsedPct: 22 });
    expect(s.text.join('')).toBe('<say>Hello, Vikas!</say>');
    expect(s.sessions).toEqual(['00000000-0000-4000-8000-0000000000a2']);
  });

  it('resume and model flags; no partial messages when not streaming; no deltas to the sink', async () => {
    const d = cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl') });
    const a = createClaudeCli(d);
    const s = sink();
    const r = await a.runTurn(req({ resumeSessionId: 'SID-1', model: 'haiku', stream: false }), s, new AbortController().signal);
    const argv = readDump(d.dump).argv;
    expect(argv).not.toContain('--include-partial-messages');
    expect(argv.slice(argv.indexOf('--resume'), argv.indexOf('--resume') + 4)).toEqual(['--resume', 'SID-1', '--model', 'haiku']);
    expect(r.text).toBe('ready');
    expect(s.text).toEqual([]);
  });

  it('fallbacks: no --append-system-prompt-file → COMBINED stdin; no --tools → --disallowedTools + plan mode', async () => {
    const d = cliDeps('claude', {
      FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl'),
      FAKE_CLI_HELP: fx('claude/help-old-no-sysfile-no-tools.txt'),
    });
    const r = await createClaudeCli(d).runTurn(req(), sink(), new AbortController().signal);
    const dump = readDump(d.dump);
    expect(dump.argv).not.toContain('--append-system-prompt-file');
    expect(dump.argv).not.toContain('--tools');
    expect(dump.argv).toContain('--disallowedTools');
    expect(dump.argv).toContain('Bash');
    expect(dump.argv.slice(dump.argv.indexOf('--permission-mode'), dump.argv.indexOf('--permission-mode') + 2)).toEqual([
      '--permission-mode',
      'plan',
    ]);
    expect(dump.stdin).toBe('SYSTEM TEXT\n\nPROMPT TEXT with "quotes" & spaces');
    expect(r.stopReason).toBe('end');
  });

  it('no way to turn its tools off → AI_CLI_INCOMPATIBLE for verify and turns, nothing sent', async () => {
    const d = cliDeps('claude', {
      FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl'),
      FAKE_CLI_HELP: fx('claude/help-no-tool-switch.txt'),
    });
    const a = createClaudeCli(d);
    expect((await a.probe()).disableTools).toBe('none');
    expect(await a.verify(new AbortController().signal)).toMatchObject({ ok: false, kind: 'AI_CLI_INCOMPATIBLE' });
    expect((await a.runTurn(req(), sink(), new AbortController().signal)).errorKind).toBe('AI_CLI_INCOMPATIBLE');
    expect(existsSync(d.dump)).toBe(false);
  });

  it('verify: prompt exactly "Reply with the word ready", ok on "ready"', async () => {
    const d = cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl') });
    const v = await createClaudeCli(d).verify(new AbortController().signal);
    expect(v.ok).toBe(true);
    expect(readDump(d.dump).stdin).toBe('Reply with the word ready');
  });

  it('failure envelopes: usage limit with reset time, signed out, overloaded, unknown flag, garbage', async () => {
    const clock = new FakeClock();
    const limit = await createClaudeCli(cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/usage-limit.jsonl') }, { clock })).runTurn(
      req(),
      sink(),
      new AbortController().signal,
    );
    expect(limit.errorKind).toBe('AI_LIMIT');
    expect(new Date(limit.resetAt!).toISOString()).toBe('2026-10-16T11:30:00.000Z'); // 5 PM IST
    const cases: [Record<string, string>, string][] = [
      [{ FAKE_CLI_STDERR: fx('claude/signed-out.stderr.txt'), FAKE_CLI_EXIT: '1' }, 'AI_SIGNED_OUT'],
      [{ FAKE_CLI_FIXTURE: fx('claude/overloaded.jsonl'), FAKE_CLI_EXIT: '1' }, 'AI_SERVICE_DOWN'],
      [{ FAKE_CLI_STDERR: fx('claude/unknown-flag.stderr.txt'), FAKE_CLI_EXIT: '1' }, 'AI_CLI_INCOMPATIBLE'],
      [{ FAKE_CLI_FIXTURE: fx('claude/garbage.txt') }, 'AI_CLI_INCOMPATIBLE'],
    ];
    for (const [env, kind] of cases) {
      const r = await createClaudeCli(cliDeps('claude', env)).runTurn(req(), sink(), new AbortController().signal);
      expect(r, JSON.stringify(env)).toMatchObject({ stopReason: 'error', errorKind: kind, text: '' });
    }
  });

  it('a tool_use in the stream (real: PowerShell, then error_max_turns, exit 1) → AI_PROTOCOL_VIOLATION', async () => {
    const r = await createClaudeCli(cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/tool-use.jsonl'), FAKE_CLI_EXIT: '1' })).runTurn(
      req(),
      sink(),
      new AbortController().signal,
    );
    expect(r).toMatchObject({ stopReason: 'error', errorKind: 'AI_PROTOCOL_VIOLATION', text: '' });
  });

  it('images on a CLI → AI_NO_VISION without spawning', async () => {
    const d = cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl') });
    const r = await createClaudeCli(d).runTurn(
      req({ attachments: [{ path: '/x.png', mime: 'image/png', bytes: 10 }] }),
      sink(),
      new AbortController().signal,
    );
    expect(r.errorKind).toBe('AI_NO_VISION');
    expect(existsSync(d.dump)).toBe(false);
  });

  it.runIf(posix)('cancel kills the child AND its grandchild; idempotent; system file still deleted', async () => {
    const d = cliDeps('claude', {
      FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl'),
      FAKE_CLI_GRANDCHILD: '1',
      FAKE_CLI_HANG: '1',
    });
    const a = createClaudeCli(d);
    const p = a.runTurn(req({ turnId: 'c1' }), sink(), new AbortController().signal);
    await waitFor(() => existsSync(d.dump));
    const dump = readDump(d.dump);
    expect(alive(dump.pid)).toBe(true);
    expect(alive(dump.grandchildPid!)).toBe(true);
    await a.cancel('c1');
    await a.cancel('c1');
    const r = await p;
    expect(r.stopReason).toBe('cancelled');
    await waitFor(() => !alive(dump.pid) && !alive(dump.grandchildPid!));
    expect(existsSync(dump.systemFile!.path)).toBe(false);
    await a.cancel('c1'); // after the turn: still a no-op
  });

  it.runIf(posix)('timeout → AI_TIMEOUT, tree killed, no late text', async () => {
    const d = cliDeps('claude', {
      FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl'),
      FAKE_CLI_LINE_DELAY_MS: '150',
      FAKE_CLI_GRANDCHILD: '1',
      FAKE_CLI_HANG: '1',
    });
    const s = sink();
    const r = await createClaudeCli(d).runTurn(req({ timeoutMs: 1000 }), s, new AbortController().signal);
    expect(r).toMatchObject({ stopReason: 'error', errorKind: 'AI_TIMEOUT', text: '' });
    const seen = s.text.length;
    const dump = readDump(d.dump);
    await waitFor(() => !alive(dump.pid) && !alive(dump.grandchildPid!));
    await new Promise((res) => setTimeout(res, 400));
    expect(s.text.length).toBe(seen);
  });

  it('an outer abort signal cancels too', async () => {
    const d = cliDeps('claude', { FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl'), FAKE_CLI_HANG: '1' });
    const ctl = new AbortController();
    const p = createClaudeCli(d).runTurn(req(), sink(), ctl.signal);
    await waitFor(() => existsSync(d.dump));
    ctl.abort();
    expect((await p).stopReason).toBe('cancelled');
  });

  it('engine start sweeps stale sys-*.md', async () => {
    const d = makeDeps();
    const dir = path.join(d.paths.LOCAL, 'ai-scratch', 'claude-cli');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'sys-old.md'), 'x');
    writeFileSync(path.join(dir, 'keep.txt'), 'x');
    await sweepSystemFiles(d);
    expect(existsSync(path.join(dir, 'sys-old.md'))).toBe(false);
    expect(existsSync(path.join(dir, 'keep.txt'))).toBe(true);
  });

  it('detect: not installed / installed but signed out / signed in through ANTHROPIC_API_KEY', async () => {
    const none = makeDeps({ which: async () => null });
    expect((await createClaudeCli(none).detect()).state).toBe('not_installed');
    const signedOut = makeDeps();
    expect(await createClaudeCli(signedOut).detect()).toMatchObject({ found: true, state: 'installed_not_signed_in' });
    const viaKey = makeDeps({}, { ANTHROPIC_API_KEY: 'sk-test' });
    expect((await createClaudeCli(viaKey).detect()).state).toBe('ready');
  });
});

describe('codex-cli', () => {
  it('exact argv with COMBINED on stdin and `-`', async () => {
    const d = cliDeps('codex', { FAKE_CLI_FIXTURE: fx('codex/exec-json.jsonl') });
    const s = sink();
    const r = await createCodexCli(d).runTurn(req(), s, new AbortController().signal);
    const dump = readDump(d.dump);
    const scratch = path.join(d.paths.LOCAL, 'ai-scratch', 'codex-cli');
    expect(dump.argv).toEqual(['exec', '--json', '--skip-git-repo-check', '-C', scratch, '-c', 'sandbox_mode="read-only"', '-']);
    expect(dump.stdin).toBe('SYSTEM TEXT\n\nPROMPT TEXT with "quotes" & spaces');
    expect(dump.argv.join(' ')).not.toContain('PROMPT TEXT');
    expect(dump.cwd).toBe(scratch);
    expect(r).toMatchObject({ text: '<say>Hello, Vikas!</say>', sessionId: '01a14f5c-0ec1-7211-8c0b-2f4eaa695dfd' });
    expect(s.text.join('')).toBe('<say>Hello, Vikas!</say>');
  });

  it('a shell attempt seen only on stderr (real Windows read-only sandbox run) → AI_PROTOCOL_VIOLATION', async () => {
    const r = await createCodexCli(
      cliDeps('codex', {
        FAKE_CLI_FIXTURE: fx('codex/command-execution-sandbox-failed.jsonl'),
        FAKE_CLI_STDERR: fx('codex/command-execution-sandbox-failed.stderr.txt'),
      }),
    ).runTurn(req(), sink(), new AbortController().signal);
    expect(r).toMatchObject({ stopReason: 'error', errorKind: 'AI_PROTOCOL_VIOLATION', text: '' });
  });

  it('cheap purpose: -m and low effort; resume form keeps the read-only sandbox', async () => {
    const d = cliDeps('codex', { FAKE_CLI_FIXTURE: fx('codex/exec-json.jsonl') });
    const a = createCodexCli(d);
    await a.runTurn(req({ purpose: 'classify', model: 'gpt-5-mini', stream: false }), sink(), new AbortController().signal);
    expect(readDump(d.dump).argv.slice(-5)).toEqual(['-m', 'gpt-5-mini', '-c', 'model_reasoning_effort="low"', '-']);
    await a.runTurn(req({ resumeSessionId: 'TH-1' }), sink(), new AbortController().signal);
    expect(readDump(d.dump).argv).toEqual([
      'exec',
      'resume',
      'TH-1',
      '--json',
      '--skip-git-repo-check',
      '-c',
      'sandbox_mode="read-only"',
      '-',
    ]);
  });

  it('command_execution item → AI_PROTOCOL_VIOLATION; the text after it never reaches the sink', async () => {
    const s = sink();
    const r = await createCodexCli(cliDeps('codex', { FAKE_CLI_FIXTURE: fx('codex/command-execution.jsonl') })).runTurn(
      req(),
      s,
      new AbortController().signal,
    );
    expect(r).toMatchObject({ stopReason: 'error', errorKind: 'AI_PROTOCOL_VIOLATION', text: '' });
    expect(s.text.join('')).not.toContain('I listed the folder');
  });

  it('unknown cheap model → retried once without -m; later cheap turns skip -m', async () => {
    const d = cliDeps('codex', {
      FAKE_CLI_FIXTURE: fx('codex/unknown-model.jsonl'),
      FAKE_CLI_EXIT: '1',
      FAKE_CLI_FIXTURE_NO_MODEL: fx('codex/exec-json.jsonl'),
      FAKE_CLI_EXIT_NO_MODEL: '0',
    });
    const a = createCodexCli(d);
    const r = await a.runTurn(req({ purpose: 'classify', model: 'gpt-5-mini' }), sink(), new AbortController().signal);
    expect(r.stopReason).toBe('end');
    expect(readDump(d.dump).argv).not.toContain('-m');
    await a.runTurn(req({ purpose: 'classify', model: 'gpt-5-mini' }), sink(), new AbortController().signal);
    expect(readDump(d.dump).argv).not.toContain('-m');
  });

  it('usage limit "try again in 30 minutes" → AI_LIMIT with resetAt', async () => {
    const clock = new FakeClock();
    const r = await createCodexCli(
      cliDeps('codex', { FAKE_CLI_FIXTURE: fx('codex/turn-failed-limit.jsonl'), FAKE_CLI_EXIT: '1' }, { clock }),
    ).runTurn(req(), sink(), new AbortController().signal);
    expect(r).toMatchObject({ errorKind: 'AI_LIMIT', resetAt: clock.now() + 30 * 60_000 });
  });

  it('signed out (stderr) → AI_SIGNED_OUT', async () => {
    const r = await createCodexCli(cliDeps('codex', { FAKE_CLI_STDERR: fx('codex/signed-out.stderr.txt'), FAKE_CLI_EXIT: '1' })).runTurn(
      req(),
      sink(),
      new AbortController().signal,
    );
    expect(r.errorKind).toBe('AI_SIGNED_OUT');
  });
});

describe('gemini-cli', () => {
  it('argv: --output-format stream-json [--model M]; COMBINED on stdin', async () => {
    const d = cliDeps('gemini', { FAKE_CLI_FIXTURE: fx('gemini/stream-json.jsonl') });
    const r = await createGeminiCli(d).runTurn(
      req({ model: 'gemini-2.5-flash', purpose: 'classify' }),
      sink(),
      new AbortController().signal,
    );
    const dump = readDump(d.dump);
    expect(dump.argv).toEqual(['--output-format', 'stream-json', '--model', 'gemini-2.5-flash']);
    expect(dump.stdin).toBe('SYSTEM TEXT\n\nPROMPT TEXT with "quotes" & spaces');
    expect(r.text).toBe('<say>Hello Vikas</say>');
    expect(r.usage.tokensIn).toBe(100);
  });
  it('no stream-json in --help → plain text mode, NULL usage', async () => {
    const d = cliDeps('gemini', { FAKE_CLI_FIXTURE: fx('gemini/text-mode.txt'), FAKE_CLI_HELP: fx('gemini/help-no-json.txt') });
    const r = await createGeminiCli(d).runTurn(req(), sink(), new AbortController().signal);
    expect(readDump(d.dump).argv).toEqual([]);
    expect(r).toMatchObject({ text: 'Hello Vikas\nsecond line', stopReason: 'end' });
    expect(r.usage.tokensIn).toBeNull();
  });
  it('tool_use → AI_PROTOCOL_VIOLATION; quota stderr → AI_LIMIT', async () => {
    const v = await createGeminiCli(cliDeps('gemini', { FAKE_CLI_FIXTURE: fx('gemini/tool-use.jsonl') })).runTurn(
      req(),
      sink(),
      new AbortController().signal,
    );
    expect(v.errorKind).toBe('AI_PROTOCOL_VIOLATION');
    const q = await createGeminiCli(cliDeps('gemini', { FAKE_CLI_STDERR: fx('gemini/quota.stderr.txt'), FAKE_CLI_EXIT: '1' })).runTurn(
      req(),
      sink(),
      new AbortController().signal,
    );
    expect(q.errorKind).toBe('AI_LIMIT');
    expect(q.resetAt).toBeDefined();
  });
});
