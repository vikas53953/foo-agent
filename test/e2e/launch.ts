// Launch helper: a FOO_TEST=1 run with its own data folders (08-0 §E.6). `env` adds variables for this run only, such as
// FOO_FAKE_AI (08-3 §22.3: the fake AI's JSON Lines script; without it a FOO_TEST run starts no engine).
import { _electron as electron, type ElectronApplication } from '@playwright/test';
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
  return electron.launch({ args, colorScheme: null, env: { ...process.env, FOO_TEST: '1', ...dirs, ...env } as Record<string, string> });
}
