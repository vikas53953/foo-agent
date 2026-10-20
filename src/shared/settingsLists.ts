// Spec: 08-0 §A.1 (zoom steps), 08-2 §11.2 / 08-0 §E.8 (provider ids). The plain lists of settings.ts with no zod, so
// the renderer's first script can read them without the schema library (AT-322, P1 T10). settings.ts re-exports them.
export const ZOOM_STEPS = [80, 90, 100, 110, 125, 150, 175, 200] as const;

export const PROVIDER_IDS = [
  'claude-cli',
  'codex-cli',
  'gemini-cli',
  'openai-key',
  'anthropic-key',
  'google-key',
  'ollama',
  'fake',
] as const;
