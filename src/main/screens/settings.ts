// Spec: 08-1 §3.2 rows owned by M13 ticket T3: settings:undo, suggestions:listDismissed, suggestions:restoreDismissed, routine:pauseAll, routine:resumeAll, files:pickFolder (06-2 §6.4–§6.7; 08-1 §4.4.2).
// T1 (CR-0017) lands the empty seam; T3 registers each channel here with handle() from IpcRouter.
import type { AppContext } from '../ipc/IpcRouter';

export function registerSettings(_ctx: AppContext): void {}
