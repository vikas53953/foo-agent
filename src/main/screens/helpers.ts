// Spec: 08-1 §3.2 rows owned by M13 ticket T6: helper:create, helper:update, helper:delete, group:create, group:update, group:delete, files:list (06-1 §3–§5; 08-3 §17).
// T1 (CR-0017) lands the empty seam; T6 registers each channel here with handle() from IpcRouter.
import type { AppContext } from '../ipc/IpcRouter';

export function registerHelpers(_ctx: AppContext): void {}
