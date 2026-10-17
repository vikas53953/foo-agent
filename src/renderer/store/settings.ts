// Spec: 08-5 §5 `settings.ts { value: PublicSettings }` (settings:changed replaces it), 08-0 §A (settings keys).
import type { PublicSettings } from '../../shared/types';
import type { RootState } from './index';

export interface SettingsState {
  value: PublicSettings | null;
}

export const initialSettings = (): SettingsState => ({ value: null });

export const selectSettings = (s: RootState) => s.settings.value;
export const selectAgentName = (s: RootState) => s.settings.value?.identity.agentName ?? 'foo';
export const selectFirstName = (s: RootState) => s.settings.value?.user.firstName ?? null;
export const selectTimeZone = (s: RootState) => s.settings.value?.locale.timeZone ?? 'Asia/Kolkata';
export const selectSetupComplete = (s: RootState) => s.settings.value?.setup.complete ?? false;
export const selectSidebarWidth = (s: RootState) => s.settings.value?.window.sidebarWidth ?? 340;
export const selectRightShellOpen = (s: RootState) => s.settings.value?.window.rightShellOpen ?? true;
export const selectLastChatId = (s: RootState) => s.settings.value?.window.lastChatId ?? null;
