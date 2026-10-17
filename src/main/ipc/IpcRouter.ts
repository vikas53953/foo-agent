// Spec: 08-1 §3 (IPC contract: sender check + schema validation), §3.1 (platform info); 08-3 §22.8 (test:* refused
// outside test runs, through ChannelGuard).
import { ipcMain, systemPreferences, type IpcMainEvent } from 'electron';
import type { PlatformInfo } from '../../shared/ipc';
import type { SettingsStore } from '../settings/Settings';
import { ChannelGuard } from './guard';
import { isTrustedUrl } from '../windows/protocol';

const trusted = (e: IpcMainEvent) => !!e.senderFrame && isTrustedUrl(e.senderFrame.url);

function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
}

let guard: ChannelGuard | null = null;

/** Every invoke channel registers through this guard: sender-checked, and test:* refused unless FOO_TEST runs. */
export function channels(): ChannelGuard {
  guard ??= new ChannelGuard(ipcMain, (url) => isTrustedUrl(url));
  return guard;
}

export function registerIpc(settings: SettingsStore): void {
  ipcMain.on('app:platform', (e) => {
    if (!trusted(e)) {
      e.returnValue = null;
      return;
    }
    const info: PlatformInfo = {
      os: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
      reducedMotion: reducedMotion(),
      animations: settings.get().appearance.animations,
    };
    e.returnValue = info;
  });
}
