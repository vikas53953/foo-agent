// Launch helper: a FOO_TEST=1 run with its own data folders (08-0 §E.6). `env` adds variables for this run only, such as
// FOO_FAKE_AI (08-3 §22.3: the fake AI's JSON Lines script; without it a FOO_TEST run starts no engine).
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function testDirs() {
  const base = mkdtempSync(join(tmpdir(), 'foo-e2e-'));
  return { FOO_DATA_DIR: join(base, 'data'), FOO_LOCAL_DIR: join(base, 'local'), FOO_OUT_DIR: join(base, 'out') };
}

export async function launch(dirs = testDirs(), extraArgs: string[] = [], env: Record<string, string> = {}): Promise<ElectronApplication> {
  const args = ['.', ...extraArgs];
  if (process.platform === 'linux') args.push('--no-sandbox');
  // colorScheme: null stops Playwright's default 'light' emulation, so prefers-color-scheme follows nativeTheme as in the real app.
  const app = await electron.launch({
    args,
    colorScheme: null,
    env: { ...process.env, FOO_TEST: '1', ...dirs, ...env } as Record<string, string>,
  });
  if (process.platform === 'win32') {
    // TEMPORARY (round 5): round 4 saw an "Error" window on the stuck main process, Electron's dialog for an uncaught
    // exception in main. Write each one to a file, so the dump can name it.
    const file = join(dirs.FOO_DATA_DIR, '..', 'main-uncaught.txt');
    await app.evaluate((_e, f) => {
      const fs = process.getBuiltinModule('node:fs');
      process.on('uncaughtException', (err) => {
        // Kept going on purpose: the dialog would hold the app, and the dump only needs the stack.
        fs.appendFileSync(f, `${new Date().toISOString()} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      });
    }, file);
    watchClose(app, dirs.FOO_DATA_DIR);
  }
  return app;
}

/**
 * TEMPORARY diagnostic (AT-451 hang on windows-latest, removed before merge): Playwright's close waits for the app's process
 * to close, which needs every process holding its stdout/stderr pipes to end. When a close runs over 20 s, log whether the
 * main process is still alive and which electron / node / Edge processes are left, with their parents. It changes nothing.
 */
function watchClose(app: ElectronApplication, dataDir: string): void {
  const real = app.close.bind(app);
  let stderr = '';
  app.process().stderr?.on('data', (b: Buffer) => (stderr = (stderr + b.toString('utf8')).slice(-6_000)));
  const logTail = () => {
    const dir = join(dataDir, 'logs');
    if (!existsSync(dir)) return '(no logs folder)';
    return readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').slice(-25).join('\n'))
      .join('\n');
  };
  app.close = async () => {
    const pid = app.process().pid;
    const started = Date.now();
    const dump = (at: string) => {
      const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(electron|node|msedge|cmd|conhost|powershell|where|tasklist)\\.exe$' } | ForEach-Object { $c = ($_.CommandLine + '') -replace '\\s+', ' '; '{0} parent {1} {2} {3}' -f $_.ProcessId, $_.ParentProcessId, $_.Name, $c.Substring(0, [Math]::Min(160, $c.Length)) }`;
      let out: string;
      try {
        out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
          encoding: 'utf8',
          timeout: 20_000,
          windowsHide: true,
        });
      } catch (e) {
        out = `(process list failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)})`;
      }
      const titles = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue | ForEach-Object { 'window of {0}: "{1}" responding {2}' -f $_.Id, $_.MainWindowTitle, $_.Responding } }`;
      let win: string;
      try {
        win = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', titles], {
          encoding: 'utf8',
          timeout: 20_000,
          windowsHide: true,
        });
      } catch (e) {
        win = `(window list failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)})`;
      }
      const err = stderr
        .split('\n')
        .filter((l) => !/dbus|gpu|command_buffer|DevTools listening|Debugger|nodejs\.org/.test(l))
        .join('\n');
      console.log(
        `DIAG close of pid ${pid} still waiting after ${at}; exitCode ${app.process().exitCode}; processes:\n${out}\n${win}\nDIAG stderr tail:\n${err}\nDIAG tech log tail:\n${logTail()}\nDIAG uncaught so far:\n${existsSync(join(dataDir, '..', 'main-uncaught.txt')) ? readFileSync(join(dataDir, '..', 'main-uncaught.txt'), 'utf8') : 'none'}`,
      );
    };
    const t1 = setTimeout(() => dump('20 s'), 20_000);
    const t2 = setTimeout(() => dump('90 s'), 90_000);
    try {
      await real();
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      const ms = Date.now() - started;
      if (ms > 5_000) console.log(`DIAG close of pid ${pid} took ${ms} ms`);
      const caught = join(dataDir, '..', 'main-uncaught.txt');
      if (existsSync(caught)) console.log(`DIAG uncaught in main (pid ${pid}):\n${readFileSync(caught, 'utf8')}`);
    }
  };
}
