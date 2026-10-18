// Spec: 09 §9.20 (updates), CR-0015 (G-M11-14). Stub landed by M11 T1 so src/main/index.ts never changes again; M11 T5
// replaces this file.
import { fail } from '../../shared/errors';
import type { InstallDeps } from '../installDeps';
import { handle } from '../ipc/IpcRouter';

/** electron-updater, `update:status`, the restart gates. Until T5: never checks. */
export function installUpdater(deps: InstallDeps): void {
  void deps;
  handle('app:restart', () => fail('UNKNOWN', 'not built yet: M11 T5'));
  handle('app:downloadUpdate', () => fail('UNKNOWN', 'not built yet: M11 T5'));
}
