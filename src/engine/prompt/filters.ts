// Spec: 08-2 §7.6 (output filters on every <say>: 1 banned words with mapped plain words, an unmapped one needs one rewrite
// turn, still failing → the sentence is dropped; 2 filler sentences removed; 3 tables kept as they are, CR-0053; 4 Redactor
// last),
// 08-4 §25.8 (Hindi and Punjabi script forms, `(?<![\p{L}\p{M}])…(?![\p{L}\p{M}])` with the `u` flag; agent / agent loop /
// tool call mappings), Article 2 (the banned list; the
// copy of record is scripts/check-copy.ts, X-140 — test/unit/m3-prompt-filters.test.ts keeps the two in step).
import type { Redactor } from '../redact/Redactor';

/** Article 2 + 08-2 §7.6 + 08-4 §25.8, the words the `{bannedList}` of rewrite.md names. */
export const BANNED_LIST = [
  'API',
  'token',
  'CLI',
  'OAuth',
  'server',
  'cron',
  'webhook',
  'MCP',
  'JSON',
  'prompt',
  'model',
  'terminal',
  'command',
  'error code',
  'stack',
  'timeout',
  'localhost',
  'LLM',
  'agent',
  'agent loop',
  'tool call',
] as const;

interface Rule {
  /** Regex source of the word and its forms (matched whole word, case-insensitive). */
  re: string;
  /** Plain word for the singular and plural forms; null = unmapped (needs a rewrite). */
  to: [singular: string, plural: string] | null;
}

// Longest phrases first so "API key" and "agent loop" win over "API" and "agent". The Latin forms equal check-copy's
// BANNED regex plus "agents?", "tool calls?" and "API keys?".
const LATIN: Rule[] = [
  { re: 'api keys?', to: ['key', 'keys'] },
  { re: 'agent loops?', to: ['helper', 'helpers'] },
  { re: 'tool calls?', to: ['step', 'steps'] },
  { re: 'error codes?', to: null },
  { re: 'timed out', to: null },
  { re: 'time ?-?outs?', to: null },
  { re: 'api', to: ['connection', 'connections'] },
  { re: 'tokens?', to: ['key', 'keys'] },
  { re: 'cli', to: ['helper app', 'helper apps'] },
  { re: 'oauth', to: ['sign in', 'sign in'] },
  { re: 'servers?', to: ['service', 'services'] },
  { re: 'cron', to: ['routine', 'routines'] },
  { re: 'webhooks?', to: null },
  { re: 'mcp', to: null },
  { re: 'json', to: null },
  { re: 'prompts?', to: ['message', 'messages'] },
  { re: 'models?', to: ['AI', 'AI'] },
  { re: 'terminals?', to: ['helper app', 'helper apps'] },
  { re: 'commands?', to: ['helper app', 'helper apps'] },
  { re: 'stack', to: null },
  { re: 'localhost', to: null },
  { re: 'llms?', to: null },
  { re: 'agents?', to: ['helper', 'helpers'] },
];

// 08-4 §25.8: script forms and their same-script plain words (model, command, terminal → Latin, kept as is).
const SCRIPT: { re: string; to: string }[] = [
  { re: 'टोकन|टोकेन', to: 'की' },
  { re: 'ਟੋਕਨ', to: 'ਕੁੰਜੀ' },
  { re: 'सर्वर', to: 'सेवा' },
  { re: 'ਸਰਵਰ', to: 'ਸੇਵਾ' },
  { re: 'प्रॉम्प्ट|प्रांप्ट', to: 'संदेश' },
  { re: 'मॉडल|मोडल', to: 'AI' },
  { re: 'ਮਾਡਲ', to: 'AI' },
  { re: 'कमांड|टर्मिनल', to: 'helper app' },
  { re: 'ਕਮਾਂਡ', to: 'helper app' },
  { re: 'एपीआई', to: 'कनेक्शन' },
];

// Whole word: no letter, mark or digit on either side (Unicode aware, so Devanagari matras count as part of the word).
const B = '(?<![\\p{L}\\p{M}\\p{N}_])';
const E = '(?![\\p{L}\\p{M}\\p{N}_])';
const LATIN_RE = LATIN.map((r) => ({ ...r, rx: new RegExp(`${B}(?:${r.re})${E}`, 'giu') }));
const SCRIPT_RE = SCRIPT.map((r) => ({ ...r, rx: new RegExp(`(?<![\\p{L}\\p{M}])(?:${r.re})(?![\\p{L}\\p{M}])`, 'gu') }));
const ANY_BANNED = new RegExp(
  `${B}(?:${LATIN.map((r) => r.re).join('|')})${E}|(?<![\\p{L}\\p{M}])(?:${SCRIPT.map((r) => r.re).join('|')})(?![\\p{L}\\p{M}])`,
  'iu',
);
const UNMAPPED_RE = new RegExp(
  `${B}(?:${LATIN.filter((r) => !r.to)
    .map((r) => r.re)
    .join('|')})${E}`,
  'giu',
);

/** Every banned word or form left in `text` (mapped or not). */
export function findBanned(text: string): string[] {
  return [...text.matchAll(new RegExp(ANY_BANNED.source, 'giu'))].map((m) => m[0]);
}

/** The unmapped banned words in `text` (those only a rewrite can remove). */
export function findUnmapped(text: string): string[] {
  return [...text.matchAll(UNMAPPED_RE)].map((m) => m[0]);
}

function atSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index);
  return /(?:^|[.?!।]\s+|\n\s*|^[\s>*_-]*)$/u.test(before);
}

/** Replaces mapped banned words; the replacement starts with a capital when the word did (or opened a sentence). */
export function mapBannedWords(text: string): string {
  let out = text;
  for (const r of LATIN_RE) {
    if (!r.to) continue;
    const to = r.to;
    out = out.replace(r.rx, (m: string, offset: number, whole: string) => {
      const plural = /s$/i.test(m);
      let word = plural ? to[1] : to[0];
      const capital = /^\p{Lu}/u.test(m);
      const titleCase = /^\p{Lu}\p{Ll}/u.test(m);
      if (word !== 'AI' && (titleCase || (capital && atSentenceStart(whole, offset)))) word = word[0]!.toUpperCase() + word.slice(1);
      return word;
    });
  }
  for (const r of SCRIPT_RE) out = out.replace(r.rx, r.to);
  return out;
}

/** 08-2 §7.6 step 2 (J7 step 5): the filler phrases whose sentences are removed. */
export const FILLER = ['Great question', 'How can I help you', 'I apologize for the confusion', 'As an AI', 'I hope this helps'] as const;
const FILLER_RE = new RegExp(FILLER.map((f) => f.replace(/ /g, '\\s+')).join('|'), 'iu');

/**
 * Splits text into sentences, each keeping its trailing whitespace (so joining them gives the text back). A sentence ends at
 * . ? ! । or a line break followed by whitespace or the end (08-4 §25.5 item 2).
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.?!।\n](?=\s|$)\s*/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const end = m.index + m[0].length;
    out.push(text.slice(last, end));
    last = end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Removes every sentence that contains a filler phrase. */
export function removeFiller(text: string): string {
  return splitSentences(text)
    .filter((s) => !FILLER_RE.test(s))
    .join('');
}

export interface FilterOptions {
  /**
   * `messages.lang` of the reply's user message. Reserved: mappings follow the script of the word itself (08-4 §25.8), so the
   * language does not change the output today.
   */
  lang?: 'en' | 'hi' | 'pa' | 'mixed';
  /** Step 4. Omitted only in tests that check steps 1–3 alone. */
  redactor?: Pick<Redactor, 'scrub'>;
}

export interface FilterResult {
  text: string;
  /** An unmapped banned word is left: one rewrite turn is needed (08-2 §7.6 step 1). */
  needsRewrite: boolean;
  unmapped: string[];
}

/**
 * 08-2 §7.6 steps 1, 2 and 4 over one `<say>` (or one sentence of it): mapped banned words replaced, filler sentences
 * removed, then the Redactor; tables pass through (step 3, CR-0053). `needsRewrite` says an unmapped banned word remains.
 */
export function filterSay(text: string, opts: FilterOptions = {}): FilterResult {
  let out = mapBannedWords(text);
  out = removeFiller(out);
  if (opts.redactor) out = opts.redactor.scrub(out).text;
  const unmapped = findUnmapped(out);
  return { text: out, needsRewrite: unmapped.length > 0, unmapped };
}

/** Drops every sentence that still holds a banned word (08-2 §7.6 step 1: "still failing → the sentence is dropped"). */
export function dropBannedSentences(text: string): string {
  return splitSentences(text)
    .filter((s) => findBanned(s).length === 0)
    .join('');
}

/**
 * The whole §7.6 pipeline for a finished `<say>`: filter; if a word needs it, one `rewrite` turn (null = the turn failed),
 * filter again, and drop any sentence that still has a banned word.
 */
export async function filterReply(
  text: string,
  opts: FilterOptions & { rewrite: (text: string) => Promise<string | null> },
): Promise<string> {
  const first = filterSay(text, opts);
  if (!first.needsRewrite) return first.text;
  const rewritten = await opts.rewrite(first.text);
  if (rewritten === null) return dropBannedSentences(first.text);
  return dropBannedSentences(filterSay(rewritten, opts).text);
}
