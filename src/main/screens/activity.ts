// Spec: 08-1 §3.2 rows owned by M13 ticket T4: activity:list, activity:saveCsv (06-3 §9; 08-1 §3.2, X-124).
// T1 (CR-0017) lands the empty seam; T4 registers each channel here with handle() from IpcRouter.
import type { AppContext } from '../ipc/IpcRouter';

export function registerActivity(_ctx: AppContext): void {}
