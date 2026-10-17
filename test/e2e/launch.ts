// Launch helper: a FOO_TEST=1 run with its own data folders (08-0 §E.6).
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function testDirs() {
  const base = mkdtempSync(join(tmpdir(), 'foo-e2e-'));
  return { FOO_DATA_DIR: join(base, 'data'), FOO_LOCAL_DIR: join(base, 'local'), FOO_OUT_DIR: join(base, 'out') };
}

export async function launch(dirs = testDirs(), extraArgs: string[] = []): Promise<ElectronApplication> {
  const args = ['.', ...extraArgs];
  if (process.platform === 'linux') args.push('--no-sandbox');
  return electron.launch({ args, env: { ...process.env, FOO_TEST: '1', ...dirs } as Record<string, string> });
}
