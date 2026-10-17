// Spec: 08-0 §E.6 (folders and test overrides, X-96).
import { app } from 'electron';
import { join } from 'node:path';

export interface FooPaths {
  /** {DATA} = %APPDATA%\foo */
  data: string;
  /** {LOCAL} = %LOCALAPPDATA%\foo */
  local: string;
  db: string;
  settings: string;
}

export const isTestRun = () => process.env.FOO_TEST === '1';

export function resolvePaths(): FooPaths {
  const { FOO_DATA_DIR, FOO_LOCAL_DIR, FOO_OUT_DIR } = process.env;
  if (isTestRun() && !(FOO_DATA_DIR && FOO_LOCAL_DIR && FOO_OUT_DIR)) {
    throw new Error('FOO_TEST=1 needs FOO_DATA_DIR, FOO_LOCAL_DIR and FOO_OUT_DIR');
  }
  const data = FOO_DATA_DIR ?? join(app.getPath('appData'), 'foo');
  const local = FOO_LOCAL_DIR ?? join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'foo');
  return { data, local, db: join(data, 'data', 'foo.db'), settings: join(data, 'settings.json') };
}
