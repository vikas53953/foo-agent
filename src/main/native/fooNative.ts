// Spec: 09 §9.19.2 (`foo-native`, loaded as require('foo-native') in main only; every export has a JS fallback so foo
// runs without the addon), 08-5 §6 (the export list), M11 pack §3 (typed accessor, `available` flag, logs
// NATIVE_UNAVAILABLE once).
import type * as FooNativeModule from 'foo-native';

export type FooNative = typeof FooNativeModule;

let cached: FooNative | null = null;

/** The addon (or its fallbacks). Loaded on first use; a missing `.node` on Windows is logged once. */
export function fooNative(): FooNative {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the addon is CommonJS and must load lazily in main
  const mod = require('foo-native') as FooNative;
  if (!mod.available && process.platform === 'win32') console.warn('NATIVE_UNAVAILABLE foo-native did not load; using fallbacks');
  cached = mod;
  return mod;
}
