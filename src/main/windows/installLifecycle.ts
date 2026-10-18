// Spec: 09 §9.7 (start at login), §9.8.2 (close choice), §9.8.4 (quit flow), 08-1 §2.3, CR-0015 (G-M11-15, G-M11-28). Stub
// landed by M11 T1 so src/main/index.ts never changes again; M11 T4 replaces this file.
import { fail } from '../../shared/errors';
import type { InstallDeps } from '../installDeps';
import { handle } from '../ipc/IpcRouter';

/** Close to tray, the C-18 and quit dialogs, start at login, battery saver and clock checks. Until T4: closing quits. */
export function installLifecycle(deps: InstallDeps): void {
  void deps;
  handle('app:closeChoice', () => fail('UNKNOWN', 'not built yet: M11 T4'));
}
