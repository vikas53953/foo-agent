// Spec: 08-3 §12.2 (`people\{slug}.md`: the name as the user wrote it, NFKC, lower-cased, spaces → `-`, characters outside
// `\p{L}\p{N}-` removed, ≤ 40 chars, Devanagari/Gurmukhi kept as written (`people\माँ.md` is legal), then `safeName()`;
// `preferences\{topic}.md` topic ∈ travel, food, shopping, work, home, family, style, brief, other; anything else → other),
// §12.4 (topic = the category when it is a legal topic), 08-0 §E.7 (`safeName()`), CR-0010 G-M6-14 (combining marks \p{M} are
// kept: without them `माँ` would lose its vowel sign and nasal mark, and §12.2 names it as legal as written).
import { safeName } from '../../shared/safeName';

const MAX = 40;

export const PREFERENCE_TOPICS = ['travel', 'food', 'shopping', 'work', 'home', 'family', 'style', 'brief', 'other'] as const;
export type PreferenceTopic = (typeof PREFERENCE_TOPICS)[number];

/** Cuts to ≤ 40 code points without splitting a letter from its marks. */
function cut(s: string): string {
  let out = '';
  let count = 0;
  for (const { segment } of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(s)) {
    const n = [...segment].length;
    if (count + n > MAX) break;
    out += segment;
    count += n;
  }
  return out;
}

export function slug(name: string): string {
  const s = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s/gu, '-')
    .replace(/[^\p{L}\p{M}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeName(cut(s).replace(/-+$/, ''));
}

export function topicOf(category: string): PreferenceTopic {
  return (PREFERENCE_TOPICS as readonly string[]).includes(category) ? (category as PreferenceTopic) : 'other';
}
