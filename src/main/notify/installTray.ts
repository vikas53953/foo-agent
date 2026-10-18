// Spec: 09 §9.8.1, §9.8.3, §9.8.4. CR-0015: stub landed by M11 T1 so src/main/index.ts never changes again; M11 T4 replaces this file.
import type { InstallDeps } from '../installDeps';
/** The tray icon, tooltip and menu. Until T4: no tray (closing the window quits, as before M11). */
export function installTray(deps: InstallDeps): void {
  void deps;
}
