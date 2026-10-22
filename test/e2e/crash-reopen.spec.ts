// Spec: 09-windows §9.5 (single instance; CR-0036 / X-194: a lock left by a crashed foo never blocks the next start),
// J19 crash recovery (07-1 §J19: a crash is followed by a reopen that recovers the jobs). The real-AI run 8 bug: Task
// Manager style kill of the main foo.exe only, then an at-once double-click → no window, the new process quit in 0.7 s.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { launch, testDirs } from './launch';

/** The processes whose parent is `pid` (Windows only): name and pid, for the log when a reopen fails. */
function childrenOf(pid: number): string {
  if (process.platform !== 'win32') return '';
  try {
    return execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { "$($_.ProcessId) $($_.Name) $($_.CommandLine)" }`,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    )
      .split(/\r?\n/)
      .map((l) => l.replace(/--[a-z-]+=("[^"]*"|\S+)/g, '').slice(0, 160))
      .filter(Boolean)
      .join('\n');
  } catch {
    return '(could not list)';
  }
}

for (const gapMs of [0, 1_500]) {
  test(`J19 crash reopen: the main process is killed and foo is opened again ${gapMs ? `${gapMs} ms later` : 'at once'}; a window shows`, async () => {
    test.setTimeout(120_000);
    const dirs = testDirs();
    const first = await launch(dirs);
    const page = await first.firstWindow();
    await page.getByTestId('titlebar-strip').waitFor();
    // foo's main process itself: in a dev run Playwright's pid is a launcher whose child is the real main (CI at
    // 0c78bde showed the reopen meet a live foo), so the pid comes from inside the app.
    const pid = await first.evaluate(() => process.pid);
    const helpers = childrenOf(pid);
    // Only the main process dies, as in a crash or Task Manager's End task on it: its helpers are left to notice.
    process.kill(pid, 'SIGKILL');
    if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    let second;
    try {
      second = await launch(dirs);
      const again = await second.firstWindow({ timeout: 30_000 });
      await again.getByTestId('titlebar-strip').waitFor({ timeout: 30_000 });
      expect(await again.title()).toBe('foo');
    } catch (e) {
      console.log(`helpers of the killed main ${pid}:\n${helpers}\nstill alive:\n${childrenOf(pid)}`);
      throw e;
    } finally {
      await second?.close().catch(() => undefined);
    }
  });
}
