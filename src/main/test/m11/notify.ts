// Spec: 08-3 §22.6 (fake Notifier), §22.8 (test channels), CR-0015. M11 T3 owns this file after T1; `test:toastSetting`
// is a stub until T3's toast-setting watch reads it.
import { z } from 'zod';
import type { ToastSettingValue } from '../../../shared/ipc';
import { deps } from '../../deps';
import type { ChannelGuard } from '../../ipc/guard';
import { RecordingNotifier } from '../fakeNotifier';

const TOAST_SETTINGS = [
  'enabled',
  'disabled_app',
  'disabled_user',
  'disabled_policy',
  'disabled_manifest',
] as const satisfies readonly ToastSettingValue[];
const toastSettingArg = z.object({ value: z.enum(TOAST_SETTINGS) }).strict();

export function registerNotifyTestHooks(guard: ChannelGuard): RecordingNotifier {
  const notifier = new RecordingNotifier();
  deps.notifier = notifier;
  guard.handle('test:notifier', () => notifier.shown());
  guard.handle('test:toastSetting', (raw: unknown) => {
    toastSettingArg.parse(raw);
    throw new Error('not built yet: M11 T3');
  });
  return notifier;
}
