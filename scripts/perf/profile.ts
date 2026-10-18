// Spec: G-M14-25 (PERF runs the shipped build unchanged: the runner copies the perf data into the REAL {DATA} of a dedicated
// test account / CI profile, no FOO_PERF variant, no env override), 08-0 §E.6 ({DATA} = %APPDATA%\foo), 10-acceptance-2 §E.1.
// A {DATA} that already holds someone's foo is never touched: the runner claims only an empty folder or one it marked.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';

export const PROFILE_MARKER = '.foo-perf-profile';
/** foo's own files in {DATA}; everything else there is Chromium's profile, which a real install keeps between launches. */
const FOO_FILES = ['data', 'settings.json', 'logs', 'jobs', 'activity.jsonl'];

/** {DATA} as Electron's app.getPath('appData') + "foo" resolves it for the measured build. */
export function realDataDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === 'win32') return win32.join(env.APPDATA ?? win32.join(home, 'AppData', 'Roaming'), 'foo');
  if (platform === 'darwin') return posix.join(home, 'Library', 'Application Support', 'foo');
  return posix.join(env.XDG_CONFIG_HOME ?? posix.join(home, '.config'), 'foo');
}

/** Marks `dir` as the perf profile, or throws when it already holds a real foo. */
export function claimProfile(dir: string): void {
  if (existsSync(join(dir, PROFILE_MARKER))) return;
  if (existsSync(dir)) {
    const held = readdirSync(dir).filter((f) => f === 'data' || f === 'settings.json');
    if (held.length > 0) {
      throw new Error(
        `${dir} is not a perf profile: it holds ${held.join(' and ')}. Run PERF on a dedicated Windows account (G-M14-25), or move that foo data away first.`,
      );
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, PROFILE_MARKER),
    'This folder is the foo performance profile (test/perf/runner.ts). Its foo data is replaced on every run.\n',
  );
}

/** Puts a fresh copy of the perf data in place before a cold launch, so every run starts from the same E.1 data set. */
export function loadProfile(dir: string, perfData: string): void {
  if (!existsSync(join(dir, PROFILE_MARKER))) throw new Error(`${dir} is not claimed as the perf profile`);
  for (const f of FOO_FILES) rmSync(join(dir, f), { recursive: true, force: true });
  cpSync(join(perfData, 'data'), join(dir, 'data'), { recursive: true });
  if (existsSync(join(perfData, 'settings.json'))) cpSync(join(perfData, 'settings.json'), join(dir, 'settings.json'));
}
