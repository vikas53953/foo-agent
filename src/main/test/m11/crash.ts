// Spec: 08-3 §22.8 (test channels), 09 §9.21 (renderer crash), CR-0015. M11 T5 owns this file after T1; stub until T5.
import type { ChannelGuard } from '../../ipc/guard';

export function registerCrashTestHooks(guard: ChannelGuard): void {
  guard.handle('test:crashRenderer', () => {
    throw new Error('not built yet: M11 T5');
  });
}
