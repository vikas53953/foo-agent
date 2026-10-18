// Spec: 08-3 §22.8, CR-0015: M11's test channels, one file per ticket (notify T3, display T4, crash T5).
import type { ChannelGuard } from '../../ipc/guard';
import { registerCrashTestHooks } from './crash';
import { registerDisplayTestHooks } from './display';
import { registerNotifyTestHooks } from './notify';

export function registerM11TestHooks(guard: ChannelGuard): void {
  registerNotifyTestHooks(guard);
  registerDisplayTestHooks(guard);
  registerCrashTestHooks(guard);
}
