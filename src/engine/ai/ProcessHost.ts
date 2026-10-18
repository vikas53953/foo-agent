// Spec: 08-2 §6.3 common CLI rules (prompt on stdin only, npm `.cmd` shim → target JS run with foo's Electron as Node,
// cwd {LOCAL}\ai-scratch\{providerId}\, env scrub, windowsHide, kill the whole tree, line reader UTF-8 + CRLF, stderr
// ≤ 40 lines × 4,000 chars, per-turn timeout), §6.5 / 08-4 §30.4 (probe capture: 8 s, 2 MiB cap), 08-4 §30.7 (no late text).
// No foo-native Job Object yet: `killTree` is the one place a Job Object replaces later (implementation-notes M3).
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { ProviderId } from '../../shared/types';
import type { AdapterDeps } from './deps';

export const STDERR_MAX_LINES = 40;
export const STDERR_MAX_LINE_CHARS = 4000;
const SCRUBBED_ENV = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];

/** env = user env minus CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, plus NO_COLOR=1, TERM=dumb (08-2 §6.3). */
export function scrubEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (SCRUBBED_ENV.some((s) => s.toUpperCase() === k.toUpperCase())) continue;
    out[k] = v;
  }
  out.NO_COLOR = '1';
  out.TERM = 'dumb';
  return out;
}

export function scratchDir(LOCAL: string, providerId: ProviderId): string {
  return path.join(LOCAL, 'ai-scratch', providerId);
}

/** Only what a file name may hold (the turn id goes into `sys-{turnId}.md`). */
export function safeTurnId(turnId: string): string {
  return turnId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'turn';
}

/**
 * The target JS of an npm `.cmd` shim, e.g. `"%dp0%\node_modules\@openai\codex\bin\codex.js" %*` → absolute path.
 * Null when the shim does not name one (then the CLI is not run: no shell, 08-2 §6.3).
 */
export function parseCmdShim(cmdPath: string, shimText: string): string | null {
  const m = /"%~?dp0%?\\?([^"%]+?\.(?:c|m)?js)"/i.exec(shimText);
  if (!m?.[1]) return null;
  const rel = m[1].replace(/\\/g, '/');
  return path.join(path.dirname(cmdPath), rel);
}

export interface Command {
  command: string;
  args: string[];
  extraEnv: Record<string, string>;
}

/** `.cmd`/`.bat` → foo's Electron as Node running the shim's target JS; anything else runs as is. */
export async function resolveCommand(bin: string, args: string[], deps: Pick<AdapterDeps, 'fs' | 'execPath'>): Promise<Command | null> {
  if (!/\.(cmd|bat)$/i.test(bin)) return { command: bin, args, extraEnv: {} };
  let text: string;
  try {
    text = await deps.fs.readText(bin);
  } catch {
    return null;
  }
  const js = parseCmdShim(bin, text);
  if (!js) return null;
  return { command: deps.execPath, args: [js, ...args], extraEnv: { ELECTRON_RUN_AS_NODE: '1' } };
}

/** Kills the process and all its descendants. Idempotent; never throws. A Job Object replaces this later. */
export function killTree(pid: number | undefined, platform: NodeJS.Platform = process.platform): void {
  if (pid === undefined || pid <= 0) return;
  if (platform === 'win32') {
    try {
      const k = nodeSpawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      k.on('error', () => undefined);
    } catch {
      /* already gone */
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL'); // the child leads its own process group (spawned detached)
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/** Splits a byte stream into lines: UTF-8 across chunk boundaries, `\r\n` and `\n` both end a line. */
export class LineReader {
  private decoder = new StringDecoder('utf8');
  private buf = '';
  constructor(private readonly onLine: (line: string) => void) {}
  push(chunk: Buffer | string): void {
    this.buf += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      this.onLine(line);
    }
  }
  end(): void {
    this.buf += this.decoder.end();
    if (this.buf.length > 0) this.onLine(this.buf.replace(/\r$/, ''));
    this.buf = '';
  }
}

/** Keeps the last 40 stderr lines, each cut to 4,000 chars (OMB-03 §5.5). */
export class StderrTail {
  private lines: string[] = [];
  private reader = new LineReader((l) => {
    this.lines.push(l.length > STDERR_MAX_LINE_CHARS ? l.slice(0, STDERR_MAX_LINE_CHARS) : l);
    if (this.lines.length > STDERR_MAX_LINES) this.lines.shift();
  });
  push(c: Buffer): void {
    this.reader.push(c);
  }
  text(): string {
    this.reader.end();
    return this.lines.join('\n');
  }
}

export interface RunSpec {
  providerId: ProviderId;
  bin: string;
  args: string[];
  /** Written to stdin then closed. The prompt never goes in `args`. */
  stdin: string;
  timeoutMs: number;
  signal: AbortSignal;
  onLine(line: string): void;
  /** Optional byte cap on stdout (probe: 2 MiB); the child is killed past it. */
  maxStdoutBytes?: number;
  /** Override cwd (probe runs in the scratch folder too, by default). */
  cwd?: string;
}

export interface RunOutcome {
  exitCode: number | null;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  /** Spawn failed (ENOENT, EACCES, ...) or the `.cmd` shim could not be resolved ('SHIM'). */
  spawnError?: string;
  truncated: boolean;
  pid?: number;
}

/** Spawns AI CLIs (08-2 §6.3). One per engine; the caller holds a CliLimiter slot around `run`. */
export class ProcessHost {
  private readonly live = new Set<ChildProcess>();
  constructor(private readonly deps: Pick<AdapterDeps, 'spawn' | 'env' | 'platform' | 'fs' | 'execPath' | 'clock' | 'paths'>) {}

  async run(spec: RunSpec): Promise<RunOutcome> {
    const cmd = await resolveCommand(spec.bin, spec.args, this.deps);
    if (!cmd) return { exitCode: null, stderr: '', timedOut: false, cancelled: false, spawnError: 'SHIM', truncated: false };
    const cwd = spec.cwd ?? scratchDir(this.deps.paths.LOCAL, spec.providerId);
    await this.deps.fs.mkdirp(cwd);
    if (spec.signal.aborted) return { exitCode: null, stderr: '', timedOut: false, cancelled: true, truncated: false };

    const spawn = this.deps.spawn ?? nodeSpawn;
    const posix = this.deps.platform !== 'win32';
    let child: ChildProcess;
    try {
      child = spawn(cmd.command, cmd.args, {
        cwd,
        env: { ...scrubEnv(this.deps.env), ...cmd.extraEnv },
        windowsHide: true,
        detached: posix, // own process group so killTree can take the grandchildren too
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (e) {
      return { exitCode: null, stderr: '', timedOut: false, cancelled: false, spawnError: errCode(e), truncated: false };
    }
    this.live.add(child);

    return new Promise<RunOutcome>((resolve) => {
      let finished = false;
      let timedOut = false;
      let cancelled = false;
      let truncated = false;
      let spawnError: string | undefined;
      let bytes = 0;
      const stderr = new StderrTail();
      const pid = child.pid;
      const kill = (): void => killTree(child.pid, this.deps.platform);
      const reader = new LineReader((line) => {
        if (!timedOut && !cancelled && !truncated) spec.onLine(line); // no late text after cancel/timeout (§30.7)
      });

      const timer = this.deps.clock.setTimeout(() => {
        timedOut = true;
        kill();
      }, spec.timeoutMs);
      const onAbort = (): void => {
        cancelled = true;
        kill();
      };
      spec.signal.addEventListener('abort', onAbort, { once: true });

      child.stdout?.on('data', (c: Buffer) => {
        bytes += c.length;
        if (spec.maxStdoutBytes !== undefined && bytes > spec.maxStdoutBytes) {
          if (!truncated) {
            truncated = true;
            kill();
          }
          return;
        }
        reader.push(c);
      });
      child.stderr?.on('data', (c: Buffer) => stderr.push(c));
      child.stdin?.on('error', () => undefined); // EPIPE when the CLI exits before reading
      child.on('error', (e) => {
        spawnError = errCode(e);
        done(null);
      });
      child.on('close', (code) => done(code));

      const done = (code: number | null): void => {
        if (finished) return;
        finished = true;
        this.deps.clock.clearTimeout(timer);
        spec.signal.removeEventListener('abort', onAbort);
        this.live.delete(child);
        if (!timedOut && !cancelled && !truncated) reader.end();
        // Belt and braces: a CLI that exits while its own children live must not leave them behind.
        if (posix && pid !== undefined) {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            /* group already empty */
          }
        }
        const out: RunOutcome = { exitCode: code, stderr: stderr.text(), timedOut, cancelled, truncated };
        if (spawnError !== undefined) out.spawnError = spawnError;
        if (pid !== undefined) out.pid = pid;
        resolve(out);
      };

      try {
        child.stdin?.end(spec.stdin, 'utf8');
      } catch {
        /* reported through 'error'/'close' */
      }
    });
  }

  /** Kills every live child (engine shutdown). */
  killAll(): void {
    for (const c of this.live) killTree(c.pid, this.deps.platform);
  }
}

function errCode(e: unknown): string {
  return (e as NodeJS.ErrnoException | undefined)?.code ?? 'SPAWN_FAILED';
}
