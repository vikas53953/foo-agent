// Spec: 08-2 §5.3.1 (check vs do, Art. 3: a fixed lexicon matched before the AI, case-insensitive; Latin words with \b,
// Devanagari and Gurmukhi forms with (?<![\p{L}\p{M}])…(?![\p{L}\p{M}]) under the u flag; empty → intent 'read_only'), X-55
// (Verb), CR-0008 G-M4-14 ("cancel" alone is a stop word; "cancel {booking}" is the delete verb).
export type Verb = 'book' | 'buy' | 'pay' | 'send' | 'post' | 'delete' | 'add_calendar';

const latin = (words: string) => new RegExp(`\\b(?:${words})\\b`, 'iu');
const indic = (words: string) => new RegExp(`(?<![\\p{L}\\p{M}])(?:${words})(?![\\p{L}\\p{M}])`, 'u');

const LEXICON: Record<Verb, RegExp[]> = {
  book: [latin('book|reserve|book karo|book kar do|buk'), indic('बुक|ਬੁੱਕ')],
  buy: [latin('buy|order|purchase|kharid\\w*|khareed\\w*|mangwa\\w*|order karo'), indic('खरीद|ਖਰੀਦ')],
  pay: [latin('pay|transfer|pay karo|pay kar do|bhar do|bharo'), indic('भुगतान|ਭੁਗਤਾਨ')],
  send: [
    latin('send|reply|bhej|bhejo|bhej do'),
    // "email", "message", "text" are verbs only as the command ("email Asha…", "…and text him"), not "read my email".
    /(?:^|\b(?:please|and|then)\s+)(?:email|message|text)\b/iu,
    indic('भेज|ਭੇਜ'),
  ],
  post: [latin('post|tweet|publish|post karo'), indic('डालो')],
  delete: [latin('delete|remove|hata do|mita do|delete karo|cancel\\s+(?:my\\s+|the\\s+)?\\p{L}+'), indic('हटाओ|ਮਿਟਾ')],
  add_calendar: [
    latin(
      'add (?:it )?to (?:my )?calendar|put (?:it )?(?:on|in) my calendar|calendar it|block (?:time|\\w+ time)|calendar karo|calendar (?:me|pe) daal do',
    ),
    indic('कैलेंडर में डालो|ਕੈਲੰਡਰ ਵਿੱਚ ਪਾਓ'),
  ],
};

/** "get me" counts as buy unless "a table", "a slot", "an appointment", "the time" or "directions" follows within 3 words. */
const GET_ME = /\bget me\b((?:\s+\S+){0,3})/giu;
const NOT_BUY = /\b(a table|a slot|an appointment|the time|directions)\b/iu;

export function extractDoVerbs(text: string): Verb[] {
  const out = (Object.keys(LEXICON) as Verb[]).filter((v) => LEXICON[v].some((re) => re.test(text)));
  if (!out.includes('buy')) for (const m of text.matchAll(GET_ME)) if (!NOT_BUY.test(m[1] ?? '')) out.push('buy');
  return out;
}
