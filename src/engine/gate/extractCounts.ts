// Spec: 08-4 §28.4 (second look, people / quantity: `extractCounts(text)` matches `(for|table for|party of|x|×) {n}`,
// `{n} (people|persons?|guests?|pax|log|logon|bande|jan)`, the script forms `{n} (जन|लोग|ਲੋਕ|ਜਣੇ)`, and the number words
// one–twelve, ek–barah, एक–बारह, ਇੱਕ–ਬਾਰਾਂ in the same positions; a number directly next to a time, a date or ₹ is ignored;
// the latest user statement wins). Pure. `jan` is a people word here (§28.4), so it is not read as January next to a number.

const WORDS: Record<string, number> = {};
const add = (n: number, ...forms: string[]) => forms.forEach((f) => (WORDS[f] = n));
add(1, 'one', 'ek', 'एक', 'ਇੱਕ', 'ਇਕ');
add(2, 'two', 'do', 'दो', 'ਦੋ');
add(3, 'three', 'teen', 'तीन', 'ਤਿੰਨ');
add(4, 'four', 'char', 'chaar', 'चार', 'ਚਾਰ');
add(5, 'five', 'paanch', 'panch', 'पांच', 'पाँच', 'ਪੰਜ');
add(6, 'six', 'chhe', 'chhah', 'chah', 'छह', 'छः', 'ਛੇ');
add(7, 'seven', 'saat', 'सात', 'ਸੱਤ');
add(8, 'eight', 'aath', 'आठ', 'ਅੱਠ');
add(9, 'nine', 'nau', 'नौ', 'ਨੌਂ', 'ਨੌ');
add(10, 'ten', 'das', 'दस', 'ਦਸ');
add(11, 'eleven', 'gyarah', 'gyaarah', 'ग्यारह', 'ਗਿਆਰਾਂ');
add(12, 'twelve', 'barah', 'baarah', 'बारह', 'ਬਾਰਾਂ');

const NUM = `(\\d{1,2}|${Object.keys(WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|')})`;
// Word edges that also hold for Devanagari and Gurmukhi (their vowel signs are marks, not letters).
const L = '(?<![\\p{L}\\p{M}\\p{N}])';
const R = '(?![\\p{L}\\p{M}\\p{N}])';

const BEFORE = new RegExp(`(?:${L}(?:table for|party of|for|x)|×)\\s*${NUM}${R}`, 'giu');
const AFTER = new RegExp(`${L}${NUM}\\s*(?:people|persons?|guests?|pax|logon|log|bande|jan|जन|लोग|ਲੋਕ|ਜਣੇ)${R}`, 'giu');

const MONTH = '(?:feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
/** What directly follows a number that is a time or a date, not a count. */
const TIME_OR_DATE_AFTER = new RegExp(`^(?::\\d|\\s*(?:am|pm|baje|o'?clock)${R}|(?:st|nd|rd|th)${R}|\\s*${MONTH}${R}|[/-]\\d)`, 'iu');

const valueOf = (raw: string): number | null => {
  if (/^\d+$/u.test(raw)) return Number(raw);
  return WORDS[raw.toLowerCase()] ?? null;
};

/** The count the text states last, or null. */
export function extractCounts(text: string): number | null {
  const hits: { at: number; n: number }[] = [];
  for (const re of [BEFORE, AFTER]) {
    for (const m of text.matchAll(re)) {
      const raw = m[1]!;
      const at = m.index + m[0].lastIndexOf(raw);
      const end = at + raw.length;
      // ₹ right before, or a time / date right after: not a count (§28.4).
      if (/[₹]\s*$/u.test(text.slice(Math.max(0, at - 2), at))) continue;
      if (re === BEFORE && TIME_OR_DATE_AFTER.test(text.slice(end))) continue;
      const n = valueOf(raw);
      if (n !== null && n > 0) hits.push({ at, n });
    }
  }
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.at >= a.at ? b : a)).n;
}

/** §28.4 "the latest user statement wins": statements oldest first. */
export function latestCount(statements: readonly string[]): number | null {
  for (let i = statements.length - 1; i >= 0; i--) {
    const n = extractCounts(statements[i]!);
    if (n !== null) return n;
  }
  return null;
}
