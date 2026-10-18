// Spec: 08-1 §2.2 (startup order: M11's modules install after IPC and the window, before the engine forks), CR-0015 (each
// M11 ticket owns one install file, so no ticket edits src/main/index.ts).
import type { BrowserWindow } from 'electron';
import type { AppContext } from './ipc/IpcRouter';
import type { LoadedNative } from './native/fooNative';

export interface InstallDeps {
  ctx: AppContext;
  /** The main window, or null while it is closed or not made yet. */
  window(): BrowserWindow | null;
  native: LoadedNative;
  /** Started with `--hidden` (start at login, 09 §9.7): tray only. */
  hidden: boolean;
  /** FOO_TEST run (08-3 §22.1). */
  testRun: boolean;
}

export type Install = (deps: InstallDeps) => void;
