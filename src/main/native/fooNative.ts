// Spec: 08-5 §6 (exports and their "unsupported" fallbacks), 08-0 §E.2, 09 §9.19.2 (`require('foo-native')` in main only).
// CR-0015 (G-M11-03): the typed accessor every main module uses. T2 adds the built `.node`; until it loads (Linux, CI
// without the addon, a missing file) every call returns the fallback, so foo runs without it.
import type * as Native from '../../../native/foo-native';

export type FooNative = typeof Native;
export type { HelloResult, NetworkCost, OcrResult, ToastSetting, TrackedWindowEvent } from '../../../native/foo-native';

const voiceUnavailable = () => Object.assign(new Error('VOICE_UNAVAILABLE'), { kind: 'VOICE_UNAVAILABLE' as const });
const noop = (): void => undefined;

/** 08-5 §6 fallback column, one value per export. */
export const FALLBACK: FooNative = {
  assignToJobObject: noop,
  killJobObject: noop,
  verifyUser: () => Promise.resolve('unavailable'),
  synthesize: () => Promise.reject(voiceUnavailable()),
  networkCost: () => 'unknown',
  toastRemove: noop,
  toastRemoveGroup: noop,
  toastClear: noop,
  toastSetting: () => 'enabled',
  textScaleFactor: () => 1,
  watchTextScale: noop,
  keyboardLayouts: () => [],
  focusActive: () => null,
  trackWindow: () => -1,
  untrackWindow: noop,
  findWindowByPid: () => null,
  ocrRead: () => Promise.resolve({ status: 'unavailable', lines: [] }),
  blackout: () => Promise.reject(new Error('OCR_UNAVAILABLE')),
};

export interface LoadedNative {
  api: FooNative;
  /** False when every call is the fallback. */
  available: boolean;
}

/**
 * Loads the addon. A missing export (an older or partial build) falls back one function at a time. `load` is the test
 * seam; without it the addon is only tried on Windows, as `require('foo-native')` (T2 decides where it resolves from).
 */
export function loadFooNative(load?: () => unknown): LoadedNative {
  let mod: Partial<FooNative> | null = null;
  try {
    if (load) mod = load() as Partial<FooNative>;
    // A native addon can only be loaded with require (08-0 §E.2: `require('foo-native')` in main only).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    else if (process.platform === 'win32') mod = require('foo-native') as Partial<FooNative>;
  } catch (e) {
    console.warn('foo-native not loaded; using fallbacks', e instanceof Error ? e.message : e);
  }
  if (!mod) return { api: FALLBACK, available: false };
  const api = { ...FALLBACK };
  for (const key of Object.keys(FALLBACK) as (keyof FooNative)[]) {
    const fn = mod[key];
    if (typeof fn === 'function') (api as Record<string, unknown>)[key] = fn;
  }
  // native/foo-native/index.js loads even without its .node (it hands out fallback.js) and says so in `available`.
  return { api, available: (mod as { available?: unknown }).available !== false };
}

let loaded: LoadedNative | null = null;

/** The process-wide addon (main only). */
export function fooNative(): LoadedNative {
  loaded ??= loadFooNative();
  return loaded;
}
