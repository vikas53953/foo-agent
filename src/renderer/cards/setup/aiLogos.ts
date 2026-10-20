// Spec: 02-2 §F17.6 (app logos: bundled files in `resources/logos/`, never fetched at runtime, never recoloured; allowed on the
// first-run AI rows), CR-0021 §F7.1 "real app logos on white tiles" (AT-314). A key row wears its maker's mark; "Your own key"
// has no maker, so it keeps the key icon on the same tile.
import claude from '../../../../resources/logos/claude.svg';
import gemini from '../../../../resources/logos/gemini.svg';
import ollama from '../../../../resources/logos/ollama.svg';
import openai from '../../../../resources/logos/openai.svg';
import type { RowId } from './aiFinderModel';

const LOGO: Record<RowId, string | null> = {
  'claude-cli': claude,
  'anthropic-key': claude,
  'codex-cli': openai,
  'openai-key': openai,
  'gemini-cli': gemini,
  'google-key': gemini,
  ollama,
  fake: null,
  'own-key': null,
};

/** The bundled logo for a finder row, or null for "Your own key". */
export const logoFor = (id: RowId): string | null => LOGO[id];
