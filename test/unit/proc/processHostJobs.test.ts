// 08-2 §5.4 l.119 (Stop: Job Object first, `taskkill /PID {pid} /T /F` fallback), M11 pack §4.1 (G-M11-01, CR-0015):
// ProcessHost sends `proc.track` right after spawn and before stdin is written; Stop sends `proc.kill`, waits ≤ 1 s for
// the reply, then sweeps with taskkill unless the Job Object already took the tree; POSIX keeps the group kill.
// A fake spawn stands in for Windows so the order is checked on every OS.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { ProcessHost, KILL_REPLY_WAIT_MS, type ProcJobs } from '../../../src/engine/ai/ProcessHost';
import { FakeClock } from '../../../src/shared/clock';
import type { AdapterDeps } from '../../../src/engine/ai/deps';
import { nodeAiFs } from '../../../src/engine/ai/index';
import { tmp, cleanupTmp, waitFor } from '../m3-adapters-helpers';
import { afterAll } from 'vitest';

afterAll(cleanupTmp);

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  constructor(
    readonly pid: number,
    private log: string[],
  ) {
    super();
  }
  stdin = Object.assign(new EventEmitter(), {
    end: () => void this.log.push('stdin'),
  });
  exit(code: number): void {
    this.exitCode = code;
    this.emit('close', code);
  }
}

function setup(jobs: ProcJobs | undefined, platform: NodeJS.Platform = 'win32') {
  const log: string[] = [];
  const children: FakeChild[] = [];
  const clock = new FakeClock(0);
  const spawn = ((cmd: string, args: string[]) => {
    if (cmd === 'taskkill') {
      log.push(`taskkill ${args.join(' ')}`);
      return Object.assign(new EventEmitter(), { pid: 1 });
    }
    log.push('spawn');
    const c = new FakeChild(500 + children.length, log);
    children.push(c);
    return c;
  }) as unknown as AdapterDeps['spawn'];
  const root = tmp('foo-m11-ph-');
  const host = new ProcessHost({
    spawn,
    env: {},
    platform,
    fs: nodeAiFs,
    execPath: process.execPath,
    clock,
    paths: { LOCAL: root, DATA: root },
    jobs,
  });
  return { host, log, children, clock };
}

function recordingJobs(log: string[], answer: (pid: number) => Promise<{ native: boolean }>): ProcJobs {
  return {
    track: (pid, purpose) => void log.push(`track ${pid} ${purpose}`),
    kill: (pid) => {
      log.push(`kill ${pid}`);
      return answer(pid);
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function run(host: ProcessHost, ctl: AbortController, purpose?: 'ai_cli' | 'whisper') {
  return host.run({
    providerId: 'claude-cli',
    bin: 'claude.exe',
    args: [],
    stdin: 'p',
    timeoutMs: 60_000,
    signal: ctl.signal,
    onLine: () => undefined,
    ...(purpose ? { purpose } : {}),
  });
}

describe('ProcessHost + Job Object (Windows path)', () => {
  it('tracks the pid right after spawn, before stdin is written (purpose ai_cli by default)', async () => {
    const log: string[] = [];
    const s = setup(recordingJobs(log, async () => ({ native: true })));
    s.log.push = log.push.bind(log);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    expect(log.slice(0, 3)).toEqual(['spawn', 'track 500 ai_cli', 'stdin']);
    s.children[0]!.exit(0);
    await p;
  });

  it('whisper runs are tracked with purpose whisper', async () => {
    const log: string[] = [];
    const s = setup(recordingJobs(log, async () => ({ native: true })));
    const ctl = new AbortController();
    const p = run(s.host, ctl, 'whisper');
    await waitFor(() => s.children.length > 0);
    await flush();
    expect(log).toContain('track 500 whisper');
    s.children[0]!.exit(0);
    await p;
  });

  it('Stop → proc.kill; native:true and the child gone → no taskkill', async () => {
    const log: string[] = [];
    const s = setup(
      recordingJobs(log, async () => {
        s.children[0]!.exit(1); // TerminateJobObject took the tree
        return { native: true };
      }),
    );
    s.log.push = log.push.bind(log);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    ctl.abort();
    const r = await p;
    await flush();
    expect(r.cancelled).toBe(true);
    expect(log.filter((l) => l.startsWith('kill') || l.startsWith('taskkill'))).toEqual(['kill 500']);
  });

  it('Stop → native:false (addon missing) → taskkill /PID /T /F', async () => {
    const log: string[] = [];
    const s = setup(recordingJobs(log, async () => ({ native: false })));
    s.log.push = log.push.bind(log);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    ctl.abort();
    await flush();
    expect(log.filter((l) => l.startsWith('kill') || l.startsWith('taskkill'))).toEqual(['kill 500', 'taskkill /PID 500 /T /F']);
    s.children[0]!.exit(1);
    await p;
  });

  it('Stop → no reply within 1 s → taskkill sweep anyway', async () => {
    const log: string[] = [];
    const s = setup(recordingJobs(log, () => new Promise(() => undefined)));
    s.log.push = log.push.bind(log);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    ctl.abort();
    await flush();
    expect(log.some((l) => l.startsWith('taskkill'))).toBe(false);
    s.clock.advance(KILL_REPLY_WAIT_MS - 1);
    await flush();
    expect(log.some((l) => l.startsWith('taskkill'))).toBe(false);
    s.clock.advance(1);
    await flush();
    expect(log.filter((l) => l.startsWith('taskkill'))).toEqual(['taskkill /PID 500 /T /F']);
    s.children[0]!.exit(1);
    await p;
  });

  it('native:true but the child still running → taskkill sweep too (belt and braces, pack §7)', async () => {
    const log: string[] = [];
    const s = setup(recordingJobs(log, async () => ({ native: true })));
    s.log.push = log.push.bind(log);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    ctl.abort();
    await flush();
    expect(log.filter((l) => l.startsWith('taskkill'))).toEqual(['taskkill /PID 500 /T /F']);
    s.children[0]!.exit(1);
    await p;
  });

  it('a child that exits on its own releases its job (proc.kill), never a taskkill on a dead pid', async () => {
    const log: string[] = [];
    const s = setup(recordingJobs(log, async () => ({ native: true })));
    s.log.push = log.push.bind(log);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    s.children[0]!.exit(0);
    await p;
    await flush();
    expect(log.filter((l) => l.startsWith('kill') || l.startsWith('taskkill'))).toEqual(['kill 500']);
  });

  it('without a jobs link (no main) Windows keeps the plain taskkill', async () => {
    const s = setup(undefined);
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    ctl.abort();
    await flush();
    expect(s.log.filter((l) => l.startsWith('taskkill'))).toEqual(['taskkill /PID 500 /T /F']);
    s.children[0]!.exit(1);
    await p;
  });

  it('POSIX never sends proc.track or proc.kill', async () => {
    const log: string[] = [];
    const s = setup(
      recordingJobs(log, async () => ({ native: true })),
      'linux',
    );
    const ctl = new AbortController();
    const p = run(s.host, ctl);
    await waitFor(() => s.children.length > 0);
    await flush();
    s.children[0]!.exit(0);
    await p;
    expect(log).toEqual([]);
  });
});
