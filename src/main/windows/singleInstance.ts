// Spec: 09-windows §9.5 (single instance and activation; CR-0036 / X-194: a lock left by a crashed foo), 08-1 §2.2 step 1.
// CR-0036: when foo crashed (or was ended in Task Manager), its helper processes can outlive it for a moment and keep the
// lock, and a double-click then quit in silence. The owner's pid is kept beside the lock; a new start that cannot get the
// lock while that pid is dead ends the dead foo's helpers and tries again, so a real user always gets a window.
import { app, type BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { takeLock, type LockResult, type LockSeams } from './staleLock';

export type { LockResult } from './staleLock';

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: it exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function endChildrenOf(pid: number): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve();
  // taskkill /T needs the parent alive; the helpers of a dead parent are found by their ParentProcessId instead. Pids are
  // reused, so only processes running this same foo.exe are ended.
  const exe = process.execPath.replace(/'/g, "''");
  const script = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Where-Object { $_.ExecutablePath -eq '${exe}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 8_000, windowsHide: true }, () =>
      resolve(),
    );
  });
}

/** The lock's owner file sits beside the lock itself (Chromium keeps the lock in userData). */
export function ownerFile(): string {
  return join(app.getPath('userData'), 'foo-main.pid');
}

export function electronLockSeams(log: (evt: string, kind?: string) => void): LockSeams {
  const file = ownerFile();
  return {
    request: () => app.requestSingleInstanceLock(),
    readOwner: () => {
      try {
        const pid = Number.parseInt(readFileSync(file, 'utf8').trim(), 10);
        return Number.isInteger(pid) && pid > 0 ? pid : null;
      } catch {
        return null;
      }
    },
    writeOwner: (pid) => {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${pid}\n`, 'utf8');
      } catch {
        // Without the file a later crash falls back to the plain §9.5 rule; a dead owner's pid must not stay behind.
        try {
          rmSync(file, { force: true });
        } catch {
          // left as it is; readOwner treats a running pid as a live foo
        }
      }
    },
    alive: pidAlive,
    endChildren: endChildrenOf,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    log,
  };
}

/** A clean quit leaves no owner behind. */
export function releaseOwner(): void {
  try {
    if (Number.parseInt(readFileSync(ownerFile(), 'utf8'), 10) === process.pid) rmSync(ownerFile(), { force: true });
  } catch {
    // nothing to remove
  }
}

/** Anything but `ours`: the caller quits at once (after saying why, for `held`). */
export async function claimSingleInstance(
  getWindow: () => BrowserWindow | null,
  onDeepLink: (url: string) => void,
  log: (evt: string, kind?: string) => void = () => undefined,
): Promise<LockResult> {
  const lock = await takeLock(electronLockSeams(log));
  if (lock !== 'ours') return lock;
  app.on('second-instance', (_event, argv) => {
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus(); // user-initiated activation (second launch) only
    }
    const url = argv.find((a) => a.startsWith('foo://'));
    if (url) onDeepLink(url);
  });
  return 'ours';
}
