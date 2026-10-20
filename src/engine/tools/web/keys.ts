// Spec: 08-0 §E.8 / G-M9-13 (vault names `foo/web_key/{exa|tavily|firecrawl|browseruse}`; `vault.use` purpose `web_tool`),
// 08-2 §8.3.12 a (the user's own keys only, never in chat), §11.4 placement (a value first seen in the engine is added to the
// SecretRegistry before first use). A thin adapter over M5's `vault.use({ purpose: 'web_tool', name })` message (Engine.ts);
// tests use the in-memory fake. No second key store.
import type { WebKeys, WebProvider } from './types';

export interface VaultUse {
  (req: { purpose: 'web_tool'; name: string }): Promise<string | null>;
}

export const webKeyName = (p: WebProvider): string => `foo/web_key/${p}`;

export function vaultWebKeys(vaultUse: VaultUse, onValue?: (handle: string, value: string) => void): WebKeys {
  return {
    async use(p) {
      // M5's vault takes the `{name}` part and builds the target itself (08-1 §3.2, SecretVault.use).
      const value = await vaultUse({ purpose: 'web_tool', name: p });
      if (value) onValue?.(webKeyName(p), value);
      return value || null;
    },
  };
}

/** In-memory stand-in for M5's vault in tests, keyed by vault target. */
export function memoryVault(values: Readonly<Record<string, string>> = {}): VaultUse {
  return async (req) => (req.purpose === 'web_tool' ? (values[`foo/web_key/${req.name}`] ?? null) : null);
}
