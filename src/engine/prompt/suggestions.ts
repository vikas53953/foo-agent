// Spec: 04-2 §21.7 (follow-up chips come only from the reply's own suggestions: the AI ends its reply with
// `Suggestions: a | b | c`; the engine strips that line from the bubble, keeps ≤ 3 of ≤ 40 characters that pass Article 2's
// word filter and stores them in `messages.suggestions`; the app never invents one), CR-0021 pick 10, AT-308.
import { findBanned } from './filters';

/** 04-2 §21.7: at most this many follow-ups. */
export const SUGGESTIONS_MAX = 3;
/** 04-2 §21.7: a follow-up longer than this is dropped, never cut. */
export const SUGGESTION_MAX_CHARS = 40;

/** A line that starts with `Suggestions:` (any case, leading spaces allowed). */
const LINE = /(^|\n)[ \t]*suggestions[ \t]*:/iu;

/** Index where the `Suggestions:` line starts in `text` (just after its line break), or -1. */
export function suggestionsLineStart(text: string): number {
  const m = LINE.exec(text);
  return m ? m.index + m[1]!.length : -1;
}

/** The reply text without its `Suggestions:` line, and the follow-ups that line held (null when none passed). */
export function splitSuggestions(say: string): { text: string; suggestions: string[] | null } {
  const start = suggestionsLineStart(say);
  if (start === -1) return { text: say, suggestions: null };
  const nl = say.indexOf('\n', start);
  const end = nl === -1 ? say.length : nl;
  const line = say.slice(start, end);
  const text = say.slice(0, start) + (nl === -1 ? '' : say.slice(nl + 1));
  return { text, suggestions: cleanSuggestions(line.slice(line.indexOf(':') + 1).split('|')) };
}

/** Trims, drops empty, too long, duplicate and banned-word items, keeps the first three; null when none is left. */
export function cleanSuggestions(items: readonly string[]): string[] | null {
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim().replace(/\s+/gu, ' ');
    if (!s || [...s].length > SUGGESTION_MAX_CHARS) continue;
    if (findBanned(s).length) continue;
    if (out.some((o) => o.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length === SUGGESTIONS_MAX) break;
  }
  return out.length ? out : null;
}
