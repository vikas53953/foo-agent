// 08-2 §6.3, §6.5, 08-4 §30.7, §30.8 on a bad day: what foo's CLI adapters do when the AI's CLI is slow to wake, crashes
// mid-answer, or crashes and then works on the next try (the "bad day" switches of test/fakes/fake-cli). Runs the fake
// CLIs on this machine with the real captured streams; never a real provider.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createClaudeCli } from '../../src/engine/ai/claudeCli';
import { createCodexCli } from '../../src/engine/ai/codexCli';
import { CliLimiter } from '../../src/engine/ai/lanes';
import { alive, cleanupTmp, FIX, makeDeps, readDump, req, sink, waitFor } from './m3-adapters-helpers';

afterAll(cleanupTmp);

const posix = process.platform !== 'win32';
const fx = (p: string): string => path.join(FIX, p);

function claudeDeps(env: Record<string, string>, limit = 4) {
  const d = makeDeps(
    { cliLimiter: new CliLimiter(limit) },
    { FAKE_CLI_HELP: fx('claude/help.txt'), FAKE_CLI_VERSION: fx('claude/version.txt'), ...env },
  );
  d.env.FAKE_CLI_DUMP = path.join(d.root, 'dump.json');
  d.env.FAKE_CLI_STATE = path.join(d.root, 'runs.txt');
  const creds = path.join(d.home, '.claude/.credentials.json');
  mkdirSync(path.dirname(creds), { recursive: true });
  writeFileSync(creds, '{}');
  return d;
}

describe('bad day: slow cold start', () => {
  it('a CLI that is silent for a while before answering still gives the whole answer', async () => {
    const d = claudeDeps({ FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl'), FAKE_CLI_START_DELAY_MS: '1500' });
    const s = sink();
    const r = await createClaudeCli(d).runTurn(req({ timeoutMs: 20_000 }), s, new AbortController().signal);
    expect(r).toMatchObject({ text: '<say>Hello, Vikas!</say>', stopReason: 'end' });
    expect(s.text.join('')).toBe('<say>Hello, Vikas!</say>');
  });

  it('verify waits out a slow first start instead of calling the AI broken', async () => {
    const d = claudeDeps({ FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl'), FAKE_CLI_START_DELAY_MS: '1500' });
    expect(await createClaudeCli(d).verify(new AbortController().signal)).toMatchObject({ ok: true });
  });

  it.runIf(posix)('silent past the turn timeout → AI_TIMEOUT, the process is killed, nothing reaches the chat', async () => {
    const d = claudeDeps({ FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl'), FAKE_CLI_START_DELAY_MS: '30000' });
    const s = sink();
    const r = await createClaudeCli(d).runTurn(req({ timeoutMs: 800 }), s, new AbortController().signal);
    expect(r).toMatchObject({ stopReason: 'error', errorKind: 'AI_TIMEOUT', text: '' });
    const dump = readDump(d.env.FAKE_CLI_DUMP!);
    await waitFor(() => !alive(dump.pid));
    expect(s.text).toEqual([]);
  });
});

describe('bad day: crash mid-answer', () => {
  it('a CLI that dies halfway (no result line) → an error turn, never a half answer passed off as done', async () => {
    const d = claudeDeps({ FAKE_CLI_FIXTURE: fx('claude/stream-partial.jsonl'), FAKE_CLI_CRASH_AFTER_LINES: '3' });
    const r = await createClaudeCli(d).runTurn(req(), sink(), new AbortController().signal);
    expect(r.stopReason).toBe('error');
    expect(r.text).toBe('');
    expect(r.errorKind).not.toBe('AI_PROTOCOL_VIOLATION');
    expect(existsSync(readDump(d.env.FAKE_CLI_DUMP!).systemFile!.path)).toBe(false); // system file still cleaned up
  });

  it('codex dying halfway → an error turn too', async () => {
    const d = makeDeps(
      {},
      {
        FAKE_CLI_HELP: fx('codex/help.txt'),
        FAKE_CLI_EXEC_HELP: fx('codex/exec-help.txt'),
        FAKE_CLI_VERSION: fx('codex/version.txt'),
        FAKE_CLI_FIXTURE: fx('codex/exec-json.jsonl'),
        FAKE_CLI_CRASH_AFTER_LINES: '2',
      },
    );
    const auth = path.join(d.home, '.codex/auth.json');
    mkdirSync(path.dirname(auth), { recursive: true });
    writeFileSync(auth, '{}');
    const r = await createCodexCli(d).runTurn(req(), sink(), new AbortController().signal);
    expect(r.stopReason).toBe('error');
    expect(r.text).toBe('');
  });
});

describe('bad day: crash, then a restart', () => {
  it('after a crash the next turn runs normally: the lane is free and nothing is left behind', async () => {
    // One lane only: a slot the crash failed to give back would make the second turn wait forever.
    const d = claudeDeps({ FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl'), FAKE_CLI_FAIL_FIRST: '1' }, 1);
    const a = createClaudeCli(d);
    const first = await a.runTurn(req({ turnId: 'r1' }), sink(), new AbortController().signal);
    expect(first.stopReason).toBe('error');
    const second = await a.runTurn(req({ turnId: 'r2', stream: false }), sink(), new AbortController().signal);
    expect(second).toMatchObject({ text: 'ready', stopReason: 'end' });
    const scratch = path.join(d.paths.LOCAL, 'ai-scratch', 'claude-cli');
    expect(existsSync(path.join(scratch, 'sys-r1.md'))).toBe(false);
    expect(existsSync(path.join(scratch, 'sys-r2.md'))).toBe(false);
  });

  it('two crashes in a row, then fine: every turn ends, none hangs', async () => {
    const d = claudeDeps({ FAKE_CLI_FIXTURE: fx('claude/stream-no-partial.jsonl'), FAKE_CLI_FAIL_FIRST: '2' }, 1);
    const a = createClaudeCli(d);
    const kinds: string[] = [];
    for (const id of ['a', 'b', 'c']) kinds.push((await a.runTurn(req({ turnId: id }), sink(), new AbortController().signal)).stopReason);
    expect(kinds).toEqual(['error', 'error', 'end']);
  });
});
