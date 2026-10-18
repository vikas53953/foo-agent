// Spec: 06-1 §2.3 Card 2b (own picture: Windows file picker), §2.4 Card A (Windows display name, UJ-38), Card B (app peek,
// RAM only, D-09); 08-3 §22.2 (injected dependencies), §22.8 (test:* channels). CR-0016 picks G-M12-17, G-M12-18.
// The probes T4/T5 build (avatarFile, displayName, appPeek) read the injected value first; `undefined` = run the real probe.
import type { SetupApp } from '../../shared/types';
import type { SetupTestProbes } from '../../shared/ipc';

/** Set only by test:setup in FOO_TEST runs. Never logged: it can hold a display name (G-M12-18). */
export const setupTestProbes: SetupTestProbes = {};

export function setTestProbe<K extends keyof SetupTestProbes>(key: K, value: SetupTestProbes[K]): SetupTestProbes {
  setupTestProbes[key] = value;
  return { ...setupTestProbes };
}

export function resetTestProbes(): SetupTestProbes {
  for (const k of Object.keys(setupTestProbes) as (keyof SetupTestProbes)[]) delete setupTestProbes[k];
  return {};
}

/** The installed apps the app peek may report (only WhatsApp Desktop can pre-tick a chip, 06-1 line 398). */
export type PeekedApps = SetupApp[];
