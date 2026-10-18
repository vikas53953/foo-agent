// M11 pack §5 Job Object row (CR-0007 §(e), 08-2 §5.4 l.119): a fake CLI that spawns 2 grandchildren; (a) Stop → the
// whole tree is gone ≤ 1 s; (b) engine crash → the supervisor's exit hook kills the jobs, no orphan; (c) main exits →
// KILL_ON_JOB_CLOSE takes the tree; (d) addon missing → the taskkill fallback still kills the tree. Needs the real
// addon, so it runs on windows-latest (CI builds it with `pnpm native:build`); elsewhere the POSIX group kill is M3's.
import { fork, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ProcessHost, type ProcJobs } from '../../../src/engine/ai/ProcessHost';
import { JobObjects, type JobNative } from '../../../src/main/proc/JobObjects';
import { nodeAiFs } from '../../../src/engine/ai/index';
import { systemClock } from '../../../src/shared/clock';
import { cleanupTmp, tmp } from '../../unit/m3-adapters-helpers';

afterAll(cleanupTmp);

const require = createRequire(import.meta.url);
const win = process.platform === 'win32';
const FAKES = path.resolve(__dirname, '../../fakes/cli');
const SPAWNER = path.join(FAKES, 'spawner.js');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function goneWithin(pids: number[], ms: number): Promise<number> {
  const t0 = Date.now();
  while (pids.some(alive)) {
    if (Date.now() - t0 > ms) throw new Error(`still alive after ${ms} ms: ${pids.filter(alive).join(' ')}`);
    await new Promise((r) => setTimeout(r, 10));
  }
  return Date.now() - t0;
}

const pidsOf = (line: string): number[] =>
  line
    .replace(/^PIDS /, '')
    .split(' ')
    .map(Number);

function linked(jobs: JobObjects): ProcJobs {
  return { track: (pid, purpose) => void jobs.track(pid, purpose), kill: async (pid) => jobs.kill(pid) };
}

function host(jobs: ProcJobs, env: Record<string, string> = {}): ProcessHost {
  const root = tmp('foo-m11-job-');
  return new ProcessHost({
    env: { ...process.env, ...env },
    platform: process.platform,
    fs: nodeAiFs,
    execPath: process.execPath,
    clock: systemClock,
    paths: { LOCAL: root, DATA: root },
    jobs,
  });
}

/** Runs the fake CLI through ProcessHost and returns its PIDS once printed, plus the stop handle. */
async function runCli(ph: ProcessHost) {
  const ctl = new AbortController();
  let line = '';
  const done = ph.run({
    providerId: 'claude-cli',
    bin: process.execPath,
    args: [SPAWNER],
    stdin: 'prompt',
    timeoutMs: 60_000,
    signal: ctl.signal,
    onLine: (l) => {
      if (l.startsWith('PIDS ')) line = l;
    },
  });
  const t0 = Date.now();
  while (!line) {
    if (Date.now() - t0 > 10_000) throw new Error('the fake CLI never printed its PIDS');
    await new Promise((r) => setTimeout(r, 10));
  }
  return { pids: pidsOf(line), stop: () => ctl.abort(), done };
}

const nativeAddon = (): JobNative => require('../../../native/foo-native/index.js') as JobNative;

describe('Job Object (windows-latest)', () => {
  it.runIf(win)('the addon is built and loads', () => {
    expect(nativeAddon().available).toBe(true);
  });

  it.runIf(win)('(a) Stop kills the CLI and both grandchildren within 1 s', async () => {
    const jobs = new JobObjects(nativeAddon());
    const cli = await runCli(host(linked(jobs)));
    expect(cli.pids.every(alive)).toBe(true);
    const t0 = Date.now();
    cli.stop();
    await goneWithin(cli.pids, 1000);
    expect(Date.now() - t0).toBeLessThanOrEqual(1000);
    expect((await cli.done).cancelled).toBe(true);
  });

  it.runIf(win)('(a) a grandchild started before proc.track landed is still swept by taskkill', async () => {
    const jobs = new JobObjects(nativeAddon());
    const cli = await runCli(host(linked(jobs), { SPAWNER_EARLY: '1' }));
    cli.stop();
    await goneWithin(cli.pids, 3000);
    await cli.done;
  });

  it.runIf(win)('(b) engine crash: the supervisor exit hook kills the tracked tree, no orphan', async () => {
    const jobs = new JobObjects(nativeAddon());
    const engine = fork(path.join(FAKES, 'engine.js'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let pids: number[] = [];
    await new Promise<void>((resolve) => {
      engine.on('message', (m: { pid?: number; line?: string }) => {
        if (m.pid) {
          jobs.track(m.pid, 'ai_cli');
          engine.send('tracked');
        }
        if (m.line?.startsWith('PIDS ')) {
          pids = pidsOf(m.line);
          resolve();
        }
      });
    });
    const exited = new Promise<void>((r) => engine.on('exit', () => r()));
    engine.kill('SIGKILL'); // TerminateProcess on the engine only, like a crash
    await exited;
    expect(pids.every(alive)).toBe(true); // without the hook these would be orphans
    expect(jobs.killAll()).toBe(1); // EngineSupervisor.onExit = () => jobs.killAll() (src/main/index.ts)
    await goneWithin(pids, 1000);
  });

  it.runIf(win)('(c) main exiting closes the job handle: KILL_ON_JOB_CLOSE takes the tree', async () => {
    const main = spawn(process.execPath, [path.join(FAKES, 'main.js')], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const line = await new Promise<string>((resolve) => {
      let buf = '';
      main.stdout.on('data', (b: Buffer) => {
        buf += String(b);
        const m = /PIDS [\d ]+/.exec(buf);
        if (m) resolve(m[0].trim());
      });
    });
    const pids = pidsOf(line);
    expect(pids.every(alive)).toBe(true);
    main.kill('SIGKILL');
    await goneWithin(pids, 1000);
  });

  it.runIf(win)('(d) addon missing: proc.kill answers native:false and taskkill still kills the tree', async () => {
    const fallback = require('../../../native/foo-native/fallback.js') as JobNative;
    const jobs = new JobObjects({ ...fallback, available: false });
    const cli = await runCli(host(linked(jobs)));
    cli.stop();
    await goneWithin(cli.pids, 3000);
    await cli.done;
  });
});
