// Spec: 08-0 §E.8 / G-M9-13 (vault names `foo/web_key/{exa|tavily|firecrawl|browseruse}`; `vault.use` purpose `web_tool`),
// 08-2 §8.3.12 a (the user's own keys only, never in chat), §11.4 placement (a value first seen in the engine is added to the
// SecretRegistry before first use). A thin adapter over M5's `vault.use({ purpose: 'web_tool', name })` message; until M5
// lands the engine uses the in-memory fake, which holds nothing in production. No second key store.
import type { WebKeys, WebProvider } from './types';

export interface VaultUse {
  (req: { purpose: 'web_tool'; name: string }): Promise<string | null>;
}

export const webKeyName = (p: WebProvider): string => `foo/web_key/${p}`;

export function vaultWebKeys(vaultUse: VaultUse, onValue?: (handle: string, value: string) => void): WebKeys {
  return {
    async use(p) {
      const name = webKeyName(p);
      const value = await vaultUse({ purpose: 'web_tool', name });
      if (value) onValue?.(name, value);
      return value || null;
    },
  };
}

/** In-memory stand-in for M5's vault (tests, and production until M5: empty). */
export function memoryVault(values: Readonly<Record<string, string>> = {}): VaultUse {
  return async (req) => (req.purpose === 'web_tool' ? (values[req.name] ?? null) : null);
}
