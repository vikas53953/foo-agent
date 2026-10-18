// Spec: 08-1 §3.2 rows owned by M13 ticket T5: search:query, search:recent, search:clearRecent, search:ask (06-3 §12; G-M13-16).
// T1 (CR-0017) lands the empty seam; T5 registers each channel here with handle() from IpcRouter.
import type { AppContext } from '../ipc/IpcRouter';

export function registerSearch(_ctx: AppContext): void {}
