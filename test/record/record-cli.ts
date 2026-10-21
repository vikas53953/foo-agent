// 08-2 §6.5, 08-4 §30.3 ("the fixtures captured then are binding"): records cassettes of the REAL Claude Code and Codex
// CLIs exactly as foo drives them. foo's own adapters run each scenario against the real CLI through a small wrapper that
// keeps a copy of stdout, stderr and the exit code; the adapter's result is saved beside it as the expected outcome.
// test/unit/cli-cassettes.test.ts then replays every cassette through the fake CLI and checks foo still reads it the
// same way. Run by .github/workflows/record-cli.yml (Linux, the owner's API keys); never with anyone else's login.
// Usage: tsx test/record/record-cli.ts <out dir>   (ANTHROPIC_API_KEY for claude; codex signed in with OPENAI_API_KEY)
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { systemClock } from '../../src/shared/clock';
import { createClaudeCli } from '../../src/engine/ai/claudeCli';
import { createCodexCli } from '../../src/engine/ai/codexCli';
import type { AdapterDeps } from '../../src/engine/ai/deps';
import { nodeAiFs } from '../../src/engine/ai/index';
import { CliLimiter } from '../../src/engine/ai/lanes';
import { loadPricing, paramsFor } from '../../src/engine/ai/models';
import type { AiAdapter, AiPurpose, TurnRequest, TurnResult } from '../../src/engine/ai/types';

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(process.argv[2] ?? 'cassettes');

export interface CassetteEntry {
  provider: 'claude' | 'codex';
  scenario: string;
  /** The request foo sent (system and prompt included), replayed as is. */
  req: Omit<TurnRequest, 'turnId'>;
  exitCode: number;
  /** What foo's adapter made of the real stream. */
  expect: { stopReason: TurnResult['stopReason']; text: string; errorKind?: string; hasSession: boolean; hasUsage: boolean };
}

// FOO/1 in miniature (08-2 §7.3): enough for the CLI to answer the way foo's prompts ask.
const SYSTEM = [
  'You are foo, a friendly personal assistant in a chat app. Reply ONLY in this format and nothing else:',
  '<say>your short reply</say>',
  '<act>{"decision":{"kind":"reply"},"usedMemoryIds":[]}</act>',
].join('\n');

function which(bin: string): string | null {
  try {
    return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

/** A wrapper named like the CLI: runs the real one and keeps stdout, stderr and the exit code under the name in `next`. */
function wrapper(binDir: string, name: string, real: string): void {
  const p = path.join(binDir, name);
  writeFileSync(
    p,
    [
      '#!/usr/bin/env bash',
      `out="$(cat "${path.join(binDir, 'next')}")"`,
      `"${real}" "$@" 2> "$out.stderr.txt" | tee "$out.jsonl"`,
      'code=${PIPESTATUS[0]}',
      'echo "$code" > "$out.exit"',
      'exit "$code"',
      '',
    ].join('\n'),
  );
  chmodSync(p, 0o755);
}

function deps(binDir: string, work: string): AdapterDeps {
  return {
    clock: systemClock,
    fetch,
    paths: { LOCAL: path.join(work, 'local'), DATA: path.join(work, 'data') },
    env: { ...process.env },
    platform: process.platform,
    getKey: async () => null,
    which: async (b) => (existsSync(path.join(binDir, b)) ? path.join(binDir, b) : null),
    fs: nodeAiFs,
    pricing: loadPricing(JSON.parse(readFileSync(path.join(ROOT, 'resources/pricing.json'), 'utf8'))),
    execPath: process.execPath,
    timeZone: 'Asia/Kolkata',
    cliLimiter: new CliLimiter(1),
  };
}

function request(purpose: AiPurpose, prompt: string, over: Partial<TurnRequest> = {}): Omit<TurnRequest, 'turnId'> {
  const p = paramsFor(purpose);
  return {
    purpose,
    system: SYSTEM,
    prompt,
    maxOutputTokens: p.maxOutputTokens,
    timeoutMs: 120_000,
    temperature: null,
    stream: p.stream,
    ...over,
  };
}

// Same-shaped fakes for anything that could identify the account or the runner (capture rules, cli-captures/README.md).
function redactor(): (s: string) => string {
  const ids = new Map<string, string>();
  const keys = [process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY].filter((k): k is string => !!k && k.length > 8);
  const home = os.homedir();
  const user = os.userInfo().username;
  return (s) => {
    let t = s;
    for (const k of keys) t = t.split(k).join('sk-REDACTED');
    t = t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => {
      if (!ids.has(m)) ids.set(m, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
      return ids.get(m)!;
    });
    t = t.split(home).join('/home/user');
    if (user.length > 2) t = t.split(user).join('user');
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'user@example.com');
    return t;
  };
}

async function record(
  provider: 'claude' | 'codex',
  make: (d: AdapterDeps) => AiAdapter,
  model: string | undefined,
): Promise<CassetteEntry[]> {
  const real = which(provider);
  if (!real) {
    console.log(`${provider}: not installed, skipped`);
    return [];
  }
  const dir = path.join(OUT, provider);
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(path.join(os.tmpdir(), `foo-record-${provider}-`));
  const binDir = path.join(work, 'bin');
  mkdirSync(binDir);
  wrapper(binDir, provider, real);
  const next = (name: string): void => writeFileSync(path.join(binDir, 'next'), path.join(dir, name));
  const redact = redactor();

  writeFileSync(path.join(dir, 'version.txt'), execFileSync(real, ['--version'], { encoding: 'utf8' }));
  writeFileSync(path.join(dir, 'help.txt'), execFileSync(real, ['--help'], { encoding: 'utf8' }));
  if (provider === 'codex') writeFileSync(path.join(dir, 'exec-help.txt'), execFileSync(real, ['exec', '--help'], { encoding: 'utf8' }));

  next('_detect'); // detect() already runs the CLI through the wrapper
  const a = make(deps(binDir, work));
  const state = await a.detect();
  if (state.state !== 'ready') {
    console.log(`${provider}: ${state.state}, skipped`);
    return [];
  }
  next('_probe');
  await a.probe();

  const scenarios: [string, Omit<TurnRequest, 'turnId'>][] = [
    ['verify', request('verify', 'Reply with the word ready', { system: '', model })],
    ['intake-stream', request('intake', 'User: hi! say hello back in five words or fewer.', { model })],
    ['chat-no-stream', request('chat', 'User: what is 2 + 2? answer in one short line.', { model, stream: false })],
    ['classify-cheap', request('classify', 'User: is "book a cab to the airport" a question or a task? one word.', { model })],
  ];
  const entries: CassetteEntry[] = [];
  let session: string | undefined;
  for (const [scenario, base] of [
    ...scenarios,
    ['resume', request('chat', 'User: and what is that times 3?', { model, stream: false })] as const,
  ]) {
    const r: Omit<TurnRequest, 'turnId'> = scenario === 'resume' ? { ...base, ...(session ? { resumeSessionId: session } : {}) } : base;
    if (scenario === 'resume' && !session) continue;
    next(scenario);
    const res = await a.runTurn(
      { ...r, turnId: `rec-${scenario}` },
      { onText: () => {}, onSession: () => {} },
      new AbortController().signal,
    );
    if (scenario === 'intake-stream' && res.sessionId) session = res.sessionId;
    const exitCode = Number(readFileSync(path.join(dir, `${scenario}.exit`), 'utf8').trim());
    entries.push({
      provider,
      scenario,
      req: scenario === 'resume' && r.resumeSessionId ? { ...r, resumeSessionId: redact(r.resumeSessionId) } : r,
      exitCode,
      expect: {
        stopReason: res.stopReason,
        text: res.text,
        ...(res.errorKind ? { errorKind: res.errorKind } : {}),
        hasSession: !!res.sessionId,
        hasUsage: res.usage.tokensOut !== null,
      },
    });
    console.log(`${provider} ${scenario}: ${res.stopReason}${res.errorKind ? ` ${res.errorKind}` : ''} "${res.text.slice(0, 60)}"`);
  }
  // Redact every file the wrapper wrote, the same way (ids keep their pairing across files).
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    writeFileSync(p, redact(readFileSync(p, 'utf8')));
  }
  for (const f of readdirSync(dir).filter((x) => x.startsWith('_'))) rmSync(path.join(dir, f));
  return entries;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const entries: CassetteEntry[] = [];
  if (process.env.ANTHROPIC_API_KEY)
    entries.push(...(await record('claude', createClaudeCli, process.env.RECORD_CLAUDE_MODEL || 'claude-haiku-5-5')));
  if (existsSync(path.join(os.homedir(), '.codex', 'auth.json'))) entries.push(...(await record('codex', createCodexCli, undefined)));
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ recorded: stamp, platform: process.platform, entries }, null, 2) + '\n');
  console.log(`${entries.length} cassettes in ${OUT}`);
  if (entries.length === 0) process.exit(1);
}

void main();
