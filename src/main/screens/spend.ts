// Spec: 08-1 §3.2 rows owned by M13 ticket T4: spend:month (06-3 §10; 08-5 §3.2).
// T1 (CR-0017) lands the empty seam; T4 registers each channel here with handle() from IpcRouter.
import type { AppContext } from '../ipc/IpcRouter';

export function registerSpend(_ctx: AppContext): void {}
