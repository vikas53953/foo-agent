// Spec: 08-2 §6.3.1 (key-mode calls fetch the key with `vault.use({ purpose: 'ai_call', name })` from `foo/ai_key/{providerId}`,
// 08-0 §E.8; never logged), §6.6 (a key in the vault is a detected key row), 08-3 §22.3 (FOO_TEST runs never look at the real
// PC). CR-0020 (b) pick 8: a FOO_TEST run may name `FOO_TEST_AI_HOME`, a folder that stands in for the user's home, so the J2
// ladder sees fake helpers (`{home}/bin/claude`, `{home}/.claude/.credentials.json`, …) and nothing of the machine it runs on.
import { join } from 'node:path';
import type { ProviderId } from '../../shared/types';
import type { MainLink } from '../protocol';
import type { AiFs } from './deps';

const KEY_IDS: readonly ProviderId[] = ['openai-key', 'anthropic-key', 'google-key'];

/** The adapters' `getKey`: main's vault answers the engine only; a missing key or a refused read is null. */
export function vaultKeyReader(
  link: Pick<MainLink, 'request'>,
  /** CR-0025: why a key could not be read (the vault's error kind, never the value), for the tech log. */
  onMiss?: (providerId: ProviderId, why: string) => void,
): (providerId: ProviderId) => Promise<string | null> {
  return async (providerId) => {
    if (!KEY_IDS.includes(providerId)) return null;
    const r = await link.request<string>('vault.use', { purpose: 'ai_call', name: providerId }).catch(() => null);
    if (r?.ok && typeof r.value === 'string' && r.value) return r.value;
    const why = r === null ? 'NO_REPLY' : r.ok ? 'EMPTY' : [r.error.kind, r.error.message].filter(Boolean).join(':');
    if (why !== 'VAULT_MISSING') onMiss?.(providerId, why); // no key saved is the usual case, not news
    return null;
  };
}

/** The env the ladder reads in a FOO_TEST run with a stand-in home: home folders point there and no real key is visible. */
export function testHomeEnv(env: Record<string, string | undefined>, home: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming') };
  for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) delete out[k];
  return out;
}

/** `which` inside the stand-in home: only `{home}/bin/{name}` (or `.exe` / `.cmd`) counts. */
export function testHomeWhich(home: string, fs: Pick<AiFs, 'exists'>): (bin: string) => Promise<string | null> {
  return async (bin) => {
    for (const name of [bin, `${bin}.exe`, `${bin}.cmd`]) {
      const p = join(home, 'bin', name);
      if (await fs.exists(p).catch(() => false)) return p;
    }
    return null;
  };
}
