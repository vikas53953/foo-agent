// Spec: 08-0 §A.1. Defaults live only here.
import type { Settings } from './settings';

export const settingsDefaults: Settings = {
  schemaVersion: 2,
  app: { closeToTray: true, hardwareAcceleration: true, closeDialogShown: false },
  zoom: 100,
  appearance: { theme: 'system', useWindowsAccent: false, animations: 'full' },
  window: { maximized: false, sidebarWidth: 340, rightShellOpen: true },
  flags: { screenHands: false, hub: false, outlook: false, multiAccount: false },
};
