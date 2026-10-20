// Spec: 04-2 §21.7 (follow-up chips come only from the reply's own suggestions: the AI ends its reply with
// `Suggestions: a | b | c`; the engine strips that line from the bubble, keeps ≤ 3 of ≤ 40 characters that pass Article 2's
// word filter and stores them in `messages.suggestions`; the app never invents one), CR-0021 pick 10, AT-308.
import { findBanned } from './filters';

/** 04-2 §21.7: at most this many follow-ups. */
export const SUGGESTIONS_MAX = 3;
/** 04-2 §21.7: a follow-up longer than this is dropped, never cut. */
export const SUGGESTION_MAX_CHARS = 40;

/** A line that starts with `Suggestions:` (any case, leading spaces allowed). */
const LINE = /(^|\n)[ \t]*suggestions[ \t]*:/giu;
/** A ``` fence line start (the bubble's fence rule, as the release gate's FENCE_LINE). */
const FENCE_LINE = /^[ \t]*```/gmu;

/**
 * Where the first line `line` (a /g pattern whose group 1 is the line break) matches outside a code fence starts, or -1.
 * Fenced text is verbatim (CR-0022 pick 14): a page script's `actions: [ … ]` line is the page's, never chips.
 */
export function lineStartOutsideFence(line: RegExp, text: string): number {
  line.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = line.exec(text))) {
    const at = m.index + m[1]!.length;
    if ((text.slice(0, at).match(FENCE_LINE)?.length ?? 0) % 2 === 0) return at;
  }
  return -1;
}

/** Index where the `Suggestions:` line starts in `text` (just after its line break), or -1. */
export function suggestionsLineStart(text: string): number {
  return lineStartOutsideFence(LINE, text);
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
