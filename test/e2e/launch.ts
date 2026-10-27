// Launch helper: a FOO_TEST=1 run with its own data folders (08-0 §E.6). `env` adds variables for this run only, such as
// FOO_FAKE_AI (08-3 §22.3: the fake AI's JSON Lines script; without it a FOO_TEST run starts no engine).
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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
  if (process.platform === 'win32') watchClose(app);
  return app;
}

/**
 * TEMPORARY diagnostic (AT-451 hang on windows-latest, removed before merge): Playwright's close waits for the app's process
 * to close, which needs every process holding its stdout/stderr pipes to end. When a close runs over 20 s, log whether the
 * main process is still alive and which electron / node / Edge processes are left, with their parents. It changes nothing.
 */
function watchClose(app: ElectronApplication): void {
  const real = app.close.bind(app);
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
      console.log(`DIAG close of pid ${pid} still waiting after ${at}; exitCode ${app.process().exitCode}; processes:\n${out}`);
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
    }
  };
}
