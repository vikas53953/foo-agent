// Spec: 08-2 §6.6 (detect evidence per provider, no network but the two localhost checks with a 1 s timeout; prefer the
// real `.exe`, 08-2 §6.3), 08-4 §30.5 (local models listed, sorted by size, largest first), 08-3 §22.3 (FOO_FAKE_AI).
// fs, env, which and fetch are injected (AdapterDeps) so detection is hermetic in tests.
import path from 'node:path';
import type { ProviderId } from '../../shared/types';
import type { DetectResult } from './types';
import type { AdapterDeps } from './deps';

export const OLLAMA_BASE = 'http://127.0.0.1:11434';
export const LMSTUDIO_BASE = 'http://127.0.0.1:1234/v1';
export const LOCAL_DETECT_TIMEOUT_MS = 1000;

export const KEY_ENV: Record<'openai-key' | 'anthropic-key' | 'google-key', string[]> = {
  'openai-key': ['OPENAI_API_KEY'],
  'anthropic-key': ['ANTHROPIC_API_KEY'],
  'google-key': ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};

type Deps = Pick<AdapterDeps, 'fs' | 'env' | 'platform' | 'which' | 'fetch' | 'clock' | 'getKey'>;

function home(deps: Deps): string {
  return (deps.platform === 'win32' ? deps.env.USERPROFILE : deps.env.HOME) ?? deps.env.USERPROFILE ?? deps.env.HOME ?? '';
}

const pj = (deps: Deps, ...p: string[]): string => (deps.platform === 'win32' ? path.win32.join(...p) : path.posix.join(...p));

async function firstExisting(deps: Deps, paths: (string | null)[]): Promise<string | null> {
  for (const p of paths) if (p && (await deps.fs.exists(p).catch(() => false))) return p;
  return null;
}

/** `where`/`which` may give a `.cmd` shim; a real `.exe` next to it or in the known folder wins. */
async function findBinary(deps: Deps, name: string, known: string[]): Promise<string | null> {
  const found = await deps.which(name).catch(() => null);
  const exeFirst: (string | null)[] = [];
  if (found && deps.platform === 'win32' && /\.(cmd|bat)$/i.test(found)) exeFirst.push(found.replace(/\.(cmd|bat)$/i, '.exe'));
  return firstExisting(deps, [...known.filter((k) => /\.exe$/i.test(k) || deps.platform !== 'win32'), ...exeFirst, found, ...known]);
}

async function detectCli(deps: Deps, name: string, known: string[], signedInFiles: string[], signedInEnv: string[]): Promise<DetectResult> {
  const bin = await findBinary(deps, name, known);
  if (!bin) return { found: false, state: 'not_installed' };
  const signed = (await firstExisting(deps, signedInFiles)) !== null || signedInEnv.some((k) => !!deps.env[k]);
  return { found: true, state: signed ? 'ready' : 'installed_not_signed_in', binaryPath: bin };
}

async function getJson(deps: Deps, url: string): Promise<unknown> {
  const ctl = new AbortController();
  const t = deps.clock.setTimeout(() => ctl.abort(), LOCAL_DETECT_TIMEOUT_MS);
  try {
    const r = await deps.fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    deps.clock.clearTimeout(t);
  }
}

interface OllamaTag {
  name?: string;
  model?: string;
  size?: number;
  remote_host?: string;
  details?: { family?: string; families?: string[] | null };
}

/**
 * A model that runs on this PC and can chat. Real /api/tags (2026-10-18) also lists Ollama cloud models (`remote_host`,
 * size ≈ 300 bytes: the reply would leave the PC, so not "AI on this PC") and embedding models (`nomic-bert`; /api/chat
 * answers "does not support chat"). Both are left out.
 */
export function isLocalChatModel(m: OllamaTag): boolean {
  if (m.remote_host) return false;
  const name = m.name ?? m.model ?? '';
  const fams = [m.details?.family ?? '', ...(m.details?.families ?? [])];
  if (/embed/i.test(name) || fams.some((f) => /bert/i.test(f))) return false;
  return name !== '';
}

export async function detectOllama(deps: Deps): Promise<DetectResult> {
  const j = (await getJson(deps, `${OLLAMA_BASE}/api/tags`)) as { models?: OllamaTag[] } | null;
  if (!j || !Array.isArray(j.models)) return { found: false, state: 'not_installed' };
  const models = j.models
    .filter(isLocalChatModel)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .map((m) => m.name ?? m.model ?? '')
    .filter(Boolean);
  return { found: true, state: 'running_local', models };
}

/** LM Studio (J2 rung 5, driven through openai-key with a base URL override, 08-2 §6.1). */
export async function detectLmStudio(deps: Deps): Promise<DetectResult> {
  const j = (await getJson(deps, `${LMSTUDIO_BASE}/models`)) as { data?: { id?: string }[] } | null;
  if (!j || !Array.isArray(j.data)) return { found: false, state: 'not_installed' };
  return { found: true, state: 'running_local', models: j.data.map((m) => m.id ?? '').filter(Boolean) };
}

export async function detectProvider(id: ProviderId, deps: Deps): Promise<DetectResult> {
  const h = home(deps);
  const win = deps.platform === 'win32';
  const npm = (b: string): string[] => (win && deps.env.APPDATA ? [pj(deps, deps.env.APPDATA, 'npm', `${b}.cmd`)] : []);
  switch (id) {
    case 'claude-cli':
      return detectCli(
        deps,
        'claude',
        [pj(deps, h, '.local', 'bin', win ? 'claude.exe' : 'claude'), ...npm('claude')],
        [pj(deps, h, '.claude', '.credentials.json')],
        ['ANTHROPIC_API_KEY'],
      );
    case 'codex-cli':
      return detectCli(deps, 'codex', npm('codex'), [pj(deps, h, '.codex', 'auth.json')], []);
    case 'gemini-cli':
      return detectCli(deps, 'gemini', npm('gemini'), [pj(deps, h, '.gemini', 'oauth_creds.json')], []);
    case 'openai-key':
    case 'anthropic-key':
    case 'google-key': {
      const vault = await deps.getKey(id).catch(() => null);
      if (vault) return { found: true, state: 'ready' };
      const envKeyName = KEY_ENV[id].find((k) => !!deps.env[k]);
      if (envKeyName) return { found: true, state: 'key_in_env', envKeyName };
      return { found: false, state: 'not_installed' };
    }
    case 'ollama':
      return detectOllama(deps);
    case 'fake':
      return deps.env.FOO_FAKE_AI ? { found: true, state: 'ready' } : { found: false, state: 'not_installed' };
  }
}
