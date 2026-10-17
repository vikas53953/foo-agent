// Spec: 08-1 §3 (IPC contract: sender check + schema validation), §3.1 (platform info).
import { ipcMain, systemPreferences, type IpcMainEvent } from 'electron';
import type { PlatformInfo } from '../../shared/ipc';
import type { SettingsStore } from '../settings/Settings';
import { isTrustedUrl } from '../windows/protocol';

const trusted = (e: IpcMainEvent) => !!e.senderFrame && isTrustedUrl(e.senderFrame.url);

function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
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
