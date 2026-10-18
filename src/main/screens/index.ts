// Spec: 08-1 §3.2 (the M13 invoke rows), CR-0017 (M13 ticket map T1: one registration seam so the wave-2 tickets never edit
// IpcRouter.ts). Each area file is owned by one ticket: settings T3, activity + spend T4, search T5, helpers + data T6.
import type { AppContext } from '../ipc/IpcRouter';
import { registerActivity } from './activity';
import { registerData } from './data';
import { registerHelpers } from './helpers';
import { registerSearch } from './search';
import { registerSettings } from './settings';
import { registerSpend } from './spend';

/** Called once from registerIpc. */
export function registerScreens(ctx: AppContext): void {
  registerSettings(ctx);
  registerActivity(ctx);
  registerSpend(ctx);
  registerSearch(ctx);
  registerHelpers(ctx);
  registerData(ctx);
}
