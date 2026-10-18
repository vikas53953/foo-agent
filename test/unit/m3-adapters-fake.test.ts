// 08-3 §22.3 (fake AI), 08-4 §30.10 row fake, 08-2 §6.6 / §6.10 (detectAll order, verify, choose), §6.9 (lanes, ≤ 4 CLIs).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import type { ProviderId } from '../../src/shared/types';
import { createFake } from '../../src/engine/ai/fake';
import { AiRegistry, LADDER, toDetectRow } from '../../src/engine/ai/AiRegistry';
import { CliLimiter, LaneLimiter } from '../../src/engine/ai/lanes';
import { createAdapters } from '../../src/engine/ai/index';
import type { AiAdapter, DetectResult, VerifyResult } from '../../src/engine/ai/types';
import { makeDeps, req, sink, cleanupTmp } from './m3-adapters-helpers';

afterAll(cleanupTmp);

function fakeDeps(lines: unknown[], clock = new FakeClock()) {
  const d = makeDeps({ clock });
  const script = path.join(d.root, 'script.jsonl');
  writeFileSync(script, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  d.env.FOO_FAKE_AI = script;
  const turns = (): Record<string, unknown>[] =>
    readFileSync(path.join(d.paths.DATA, 'test', 'turns.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  return { d, clock, turns };
}
const sig = () => new AbortController().signal;

describe('fake AI (08-3 §22.3)', () => {
  it('first matching unused line answers; once defaults to true; once:false repeats; usage default', async () => {
    const { d, turns } = fakeDeps([
      { match: { purpose: 'intake', promptIncludes: 'pizza' }, reply: 'A' },
      {
        match: { purpose: 'intake' },
        reply: 'B',
        once: false,
        usage: { tokensIn: 5, tokensOut: 6, cacheRead: null, cacheWrite: null, costUsd: 0.01 },
      },
    ]);
    const a = createFake(d);
    const s = sink();
    const r1 = await a.runTurn(req({ prompt: 'order pizza', turnId: 'f1' }), s, sig());
    expect(r1).toEqual({
      text: 'A',
      usage: { tokensIn: 0, tokensOut: 0, cacheRead: null, cacheWrite: null, costUsd: null },
      stopReason: 'end',
    });
    expect(s.text).toEqual(['A']);
    expect((await a.runTurn(req({ prompt: 'order pizza' }), sink(), sig())).text).toBe('B');
    expect((await a.runTurn(req({ prompt: 'x' }), sink(), sig())).usage.tokensIn).toBe(5);
    expect((await a.runTurn(req({ prompt: 'x' }), sink(), sig())).text).toBe('B');
    expect(turns().map((t) => t.matchedLine)).toEqual([1, 2, 2, 2]);
    expect(turns()[0]).toEqual({ turnId: 'f1', purpose: 'intake', system: 'SYSTEM TEXT', prompt: 'order pizza', matchedLine: 1 });
  });

  it('chatId and attachments must hold when given; attachments logged as { bytes, sha256 }', async () => {
    const { d, turns } = fakeDeps([
      { match: { purpose: 'intake', chatId: 'c2' }, reply: 'chat2' },
      { match: { purpose: 'read_attachment', attachments: 1 }, reply: 'saw it' },
    ]);
    const png = path.join(d.root, 'p.png');
    writeFileSync(png, 'PNGBYTES');
    const a = createFake(d);
    expect((await a.runTurn(req({ chatId: 'c1' }), sink(), sig())).errorKind).toBe('FAKE_AI_NO_MATCH');
    expect((await a.runTurn(req({ chatId: 'c2' }), sink(), sig())).text).toBe('chat2');
    expect((await a.runTurn(req({ purpose: 'read_attachment' }), sink(), sig())).errorKind).toBe('FAKE_AI_NO_MATCH');
    const r = await a.runTurn(
      req({ purpose: 'read_attachment', attachments: [{ path: png, mime: 'image/png', bytes: 8 }] }),
      sink(),
      sig(),
    );
    expect(r.text).toBe('saw it');
    const t = turns();
    expect(t[0]).toMatchObject({ matchedLine: null, noMatch: true });
    expect(t[3]!.attachments).toEqual([{ bytes: 8, sha256: createHash('sha256').update('PNGBYTES').digest('hex') }]);
    expect(JSON.stringify(t[3])).not.toContain('PNGBYTES');
  });

  it('error makes the turn fail with that kind; delayMs runs on the injected clock; cancel during the delay', async () => {
    const { d, clock } = fakeDeps([
      { match: { purpose: 'step' }, error: 'AI_LIMIT' },
      { match: { purpose: 'intake' }, reply: 'late', delayMs: 5000 },
      { match: { purpose: 'intake' }, reply: 'never', delayMs: 5000 },
    ]);
    const a = createFake(d);
    expect(await a.runTurn(req({ purpose: 'step' }), sink(), sig())).toMatchObject({ stopReason: 'error', errorKind: 'AI_LIMIT' });
    let done = false;
    const p = a.runTurn(req(), sink(), sig()).then((r) => ((done = true), r));
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    clock.advance(5000);
    expect((await p).text).toBe('late');
    const p2 = a.runTurn(req({ turnId: 'slow' }), sink(), sig());
    await new Promise((r) => setTimeout(r, 10));
    await a.cancel('slow');
    expect((await p2).stopReason).toBe('cancelled');
  });

  it('verify goes through the script', async () => {
    const { d, turns } = fakeDeps([{ match: { purpose: 'verify' }, reply: 'Ready.' }]);
    expect((await createFake(d).verify(sig())).ok).toBe(true);
    expect(turns()[0]).toMatchObject({ purpose: 'verify', prompt: 'Reply with the word ready' });
    const { d: d2 } = fakeDeps([{ match: { purpose: 'verify' }, reply: 'nope' }]);
    expect((await createFake(d2).verify(sig())).ok).toBe(false);
  });
});

function stubAdapter(id: ProviderId, detect: DetectResult, delayMs: number, verify: VerifyResult = { ok: true, latencyMs: 1 }): AiAdapter {
  return {
    id,
    billing: id.endsWith('-key') ? 'key' : id === 'ollama' ? 'local' : 'plan',
    detect: () => new Promise((r) => setTimeout(() => r(detect), delayMs)),
    probe: async () => ({
      stdinPrompt: true,
      systemPromptFile: true,
      appendSystemPrompt: true,
      resume: true,
      disableTools: 'flag',
      jsonStream: true,
      modelFlag: true,
      vision: false,
    }),
    verify: async () => verify,
    runTurn: async () => ({
      text: 'ok',
      usage: { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null },
      stopReason: 'end',
    }),
    cancel: async () => undefined,
    estimate: () => ({ tokensIn: 1, tokensOutMax: 1, costPaise: null }),
    classifyError: () => 'UNKNOWN',
  };
}

describe('AiRegistry (08-2 §6.10)', () => {
  const found: DetectResult = { found: true, state: 'ready', binaryPath: '/bin/x' };
  const missing: DetectResult = { found: false, state: 'not_installed' };
  function registry(verifyOk: Partial<Record<ProviderId, boolean>> = {}) {
    const delays = [60, 10, 30, 0, 50, 20, 5, 0];
    const ids = [...LADDER, 'fake'] as ProviderId[];
    const adapters = Object.fromEntries(
      ids.map((id, i) => [id, stubAdapter(id, i % 2 ? missing : found, delays[i]!, { ok: verifyOk[id] ?? false, latencyMs: 1 })]),
    ) as Record<ProviderId, AiAdapter>;
    return new AiRegistry(adapters, { clock: new FakeClock(), fakeEnabled: false });
  }

  it('detectAll runs in parallel and emits in ladder order', async () => {
    const seen: ProviderId[] = [];
    const t0 = Date.now();
    const rows = await registry().detectAll((r) => seen.push(r.providerId));
    expect(Date.now() - t0).toBeLessThan(200);
    expect(seen).toEqual(LADDER);
    expect(rows.map((r) => r.state)).toEqual(['testing', 'not_found', 'testing', 'not_found', 'testing', 'not_found', 'testing']);
    expect(rows[0]).toEqual({ providerId: 'claude-cli', found: true, path: '/bin/x', state: 'testing', signedIn: true });
  });

  it('DetectResult → DetectRow', () => {
    expect(toDetectRow('codex-cli', { found: true, state: 'installed_not_signed_in' }).state).toBe('not_signed_in');
    expect(toDetectRow('openai-key', { found: true, state: 'key_in_env', envKeyName: 'OPENAI_API_KEY' }).state).toBe('not_signed_in');
    expect(toDetectRow('ollama', { found: true, state: 'running_local' }).state).toBe('testing');
  });

  it('choose needs a verified primary (and backup)', async () => {
    const reg = registry({ 'codex-cli': true, ollama: true });
    expect(reg.choose('codex-cli')).toEqual({ ok: false, error: { kind: 'AI_NOT_VERIFIED' } });
    await reg.verify('codex-cli');
    await reg.verify('claude-cli');
    const c = reg.choose('codex-cli', 'claude-cli');
    expect(c.ok).toBe(false);
    await reg.verify('ollama');
    const ok = reg.choose('codex-cli', 'ollama');
    expect(ok).toMatchObject({
      ok: true,
      value: { primary: 'codex-cli', backup: 'ollama', displayName: 'ChatGPT', billing: 'plan', state: 'ok', usingBackup: false },
    });
    expect(reg.choose('codex-cli', 'codex-cli')).toMatchObject({ ok: true, value: { backup: null } });
  });

  it('createAdapters gives one adapter per ProviderId with no side effects', () => {
    const d = makeDeps();
    const all = createAdapters(d);
    expect(Object.keys(all).sort()).toEqual([...LADDER, 'fake'].sort());
    for (const [id, a] of Object.entries(all)) expect(a.id).toBe(id);
  });
});

describe('lanes (08-2 §6.9)', () => {
  it('CLI children ≤ 4, extra calls wait FIFO without error', async () => {
    const lim = new CliLimiter(4);
    const order: number[] = [];
    const releases: (() => void)[] = [];
    const ps = Array.from({ length: 7 }, (_, i) =>
      lim.acquire().then((rel) => {
        order.push(i);
        releases.push(rel);
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(lim.active).toBe(4);
    expect(lim.waiting).toBe(3);
    expect(order).toEqual([0, 1, 2, 3]);
    releases[0]!();
    releases[0]!(); // double release is a no-op
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(lim.active).toBe(4);
    releases[2]!();
    releases[1]!();
    await Promise.all(ps);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('an aborted waiter leaves the queue', async () => {
    const lim = new CliLimiter(1);
    const rel = await lim.acquire();
    const ctl = new AbortController();
    const p = lim.acquire(ctl.signal);
    ctl.abort();
    await expect(p).rejects.toThrow('aborted');
    expect(lim.waiting).toBe(0);
    rel();
    expect(lim.active).toBe(0);
  });

  it('job 3; chat 1 per chat and 2 total; background 1 and never while 3 jobs are WORKING', async () => {
    const l = new LaneLimiter();
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const jobs = await Promise.all([0, 1, 2].map(() => l.acquire({ lane: 'job' })));
    let fourth = false;
    void l.acquire({ lane: 'job' }).then(() => (fourth = true));
    const a1 = await l.acquire({ lane: 'chat', chatId: 'a' });
    let a2 = false;
    void l.acquire({ lane: 'chat', chatId: 'a' }).then(() => (a2 = true));
    const b1 = await l.acquire({ lane: 'chat', chatId: 'b' });
    let c1 = false;
    void l.acquire({ lane: 'chat', chatId: 'c' }).then(() => (c1 = true));
    l.setWorkingJobs(3);
    let bg = false;
    void l.acquire({ lane: 'background' }).then(() => (bg = true));
    await tick();
    expect({ fourth, a2, c1, bg }).toEqual({ fourth: false, a2: false, c1: false, bg: false });
    l.setWorkingJobs(2);
    await tick();
    expect(bg).toBe(true);
    jobs[0]!();
    b1();
    await tick();
    expect(fourth).toBe(true);
    expect(a2).toBe(false); // chat a still has its one turn
    expect(c1).toBe(true);
    a1();
    await tick();
    expect(a2).toBe(true); // a's own turn ended: its next one starts (c + a = 2 total)
    expect(l.counts.chat).toBe(2);
    let d1 = false;
    void l.acquire({ lane: 'chat', chatId: 'd' }).then(() => (d1 = true));
    await tick();
    expect(d1).toBe(false); // 2 total
  });
});
