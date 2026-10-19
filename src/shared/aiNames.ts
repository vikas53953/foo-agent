// Spec: 08-0 §B.4 (AI display names, shown as written; X-78), 06-1 §2.2 (the J2 rows in fixed order; a key row is named
// "{maker} key"; the consent block names the maker: "{OpenAI} needs its small free helper"), 08-0 §E.5 (`maker-pages.json`:
// the helpers foo knows are exactly claude-cli, codex-cli and gemini-cli, plus ollama's link-out; AT-155a).
import type { KeyProviderId, ProviderId } from './types';

/** 08-0 §B.4 display names (the same table as src/main/store/queries.ts AI_DISPLAY_NAME). */
export const AI_NAME: Record<ProviderId, string> = {
  'claude-cli': 'Claude',
  'codex-cli': 'ChatGPT',
  'gemini-cli': 'Gemini',
  'openai-key': 'OpenAI key',
  'anthropic-key': 'Anthropic key',
  'google-key': 'Google key',
  ollama: 'AI on this PC',
  fake: 'Test AI',
};

/** The company behind each AI (06-1 §2.2 consent block and key lines). */
export const AI_MAKER: Record<ProviderId, string> = {
  'claude-cli': 'Anthropic',
  'codex-cli': 'OpenAI',
  'gemini-cli': 'Google',
  'openai-key': 'OpenAI',
  'anthropic-key': 'Anthropic',
  'google-key': 'Google',
  ollama: 'Ollama',
  fake: 'foo',
};

export const KEY_PROVIDERS: readonly KeyProviderId[] = ['openai-key', 'anthropic-key', 'google-key'];
export const isKeyProvider = (id: string): id is KeyProviderId => (KEY_PROVIDERS as readonly string[]).includes(id);

/** The helpers foo can send the user to (AT-155a): only these open a maker's page; foo installs nothing (X-42). */
export const HELPER_PROVIDERS = ['claude-cli', 'codex-cli', 'gemini-cli', 'ollama'] as const;
export type HelperProviderId = (typeof HELPER_PROVIDERS)[number];
export const isHelperProvider = (id: string): id is HelperProviderId => (HELPER_PROVIDERS as readonly string[]).includes(id);
