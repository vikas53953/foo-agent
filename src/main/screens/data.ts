// Spec: 08-1 §3.2 rows owned by M13 ticket T6: chat:delete, data:deleteOlderThan (08-1 §4.6 rule 3, l.1175–1176; X-129).
// T1 (CR-0017) lands the empty seam; T6 registers each channel here with handle() from IpcRouter.
import type { AppContext } from '../ipc/IpcRouter';

export function registerData(_ctx: AppContext): void {}
