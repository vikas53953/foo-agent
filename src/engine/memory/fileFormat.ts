// Spec: 08-3 §12.2 (memory file format: a fact is `^- (.+?)\s{2}\{(.+)\}\s*$`; ` · `-separated brace tokens provenance,
// ISO date, origin label, optional `from …`, kind, `private`, `chat:{chatId}` (about-you.md only), full `f_{UUIDv7}` id; the 7
// origin labels map 1:1 to MemoryOrigin, case-sensitive; brace-less `- ` lines are you said, today, `manual` and get their id
// and brace at reindex; the `private` token is authoritative and `## Private` is rewritten from it; CRLF read, UTF-8 LF
// without BOM written; unparseable lines kept untouched and reported), X-06 (kind; derived from the folder when missing),
// X-112 (`chat:{chatId}`), 08-0 §B.2 (MemoryKind, MemoryProvenance, MemoryOrigin, MemoryCategory), §12.4 (`add.text` ≤ 120,
// `kind='person'` needs `person`, category from the closed list).
import type { MemoryCategory, MemoryKind, MemoryOrigin, MemoryProvenance } from '../../shared/types';
import { factHash } from './hash';

export type { MemoryCategory, MemoryKind, MemoryOrigin, MemoryProvenance };

export const MEMORY_KINDS: readonly MemoryKind[] = ['person', 'preference', 'place', 'fact'];
export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  'food',
  'travel',
  'health',
  'money',
  'people',
  'places',
  'work',
  'style',
  'home',
  'family',
  'religion',
  'politics',
  'other',
];

/** §12.2 origin labels as written in the file (and shown by the Memory page filter). */
export const ORIGIN_LABELS: Readonly<Record<MemoryOrigin, string>> = {
  chat: 'chat',
  gmail: 'Gmail',
  gcal: 'Calendar',
  whatsapp: 'WhatsApp',
  manual: 'you typed it',
  setup: 'setup',
  job: 'a task',
};
const PROVENANCE_LABELS: Readonly<Record<MemoryProvenance, string>> = { said: 'you said', guessed: 'I guessed' };
const ORIGIN_BY_LABEL = new Map(Object.entries(ORIGIN_LABELS).map(([o, l]) => [l, o as MemoryOrigin]));
const PROVENANCE_BY_LABEL = new Map(Object.entries(PROVENANCE_LABELS).map(([p, l]) => [l, p as MemoryProvenance]));

const FACT_LINE = /^- (.+?)\s{2}\{(.+)\}\s*$/;
const FACT_ID = /^f_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIVATE_HEADING = '## Private';
const SEP = ' · ';
export const ABOUT_YOU_FILE = 'memory/about-you.md';

/** One fact as the file holds it. */
export interface MemoryFact {
  id: string;
  text: string;
  provenance: MemoryProvenance;
  /** YYYY-MM-DD. */
  date: string;
  /** Null when the line carries no origin label (the §12.2 example's guessed fact); never invented. */
  origin: MemoryOrigin | null;
  /** The whole `from …` token, e.g. "from 4 bookings". */
  reason: string | null;
  kind: MemoryKind;
  private: boolean;
  /** Set only in about-you.md (scope `chat`, X-112). */
  chatId: string | null;
}

export interface ParsedFact extends MemoryFact {
  /** 1-based line in the text that was parsed. */
  lineNo: number;
  hash: string;
}

/** A line kept as it is: an unparseable line, or a heading other than the title and `## Private`. */
export interface KeptLine {
  text: string;
  /** Found under `## Private`; written back there. */
  private: boolean;
}

export type MemoryEntry = { type: 'fact'; fact: MemoryFact } | { type: 'line'; line: KeptLine };

/** A memory file in order; the writer turns it back into text. */
export interface MemoryDoc {
  /** Relative to {DATA}, forward slashes (`memory/about-you.md`, `memory/people/{slug}.md`, `helpers/{id}/notes.md`). */
  file: string;
  /** The `# …` line, e.g. "# About you". */
  title: string | null;
  entries: MemoryEntry[];
}

export interface BadLine {
  lineNo: number;
  text: string;
}

export interface ParseResult {
  doc: MemoryDoc;
  facts: ParsedFact[];
  /** The MEMORY_PARSE list (J17 "I couldn't read 2 lines …"). */
  badLines: BadLine[];
  /** True when a brace-less line got its brace or a `## Private` line got its token: write the file once (§12.2). */
  rewrite: boolean;
}

export interface ParseOptions {
  file: string;
  /** The user's local date, YYYY-MM-DD, for brace-less lines. */
  today: string;
  /** Mints `f_{UUIDv7}` ids for brace-less lines. */
  newId: () => string;
}

/** X-06: kind when the line has no kind token. */
export function kindForFile(file: string): MemoryKind {
  if (file.startsWith('memory/people/')) return 'person';
  if (file.startsWith('memory/preferences/')) return 'preference';
  return 'fact';
}

function isCalendarDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The brace tokens of one line, or null when any token is illegal. */
function readTokens(tokens: string[], file: string): (Omit<MemoryFact, 'text' | 'private'> & { private: boolean }) | null {
  if (tokens.length < 3) return null;
  const provenance = PROVENANCE_BY_LABEL.get(tokens[0]!);
  const date = tokens[1]!;
  const id = tokens[tokens.length - 1]!;
  if (!provenance || !isCalendarDate(date) || !FACT_ID.test(id)) return null;
  // §12.2's own example ("Prefers window seats") has no origin label: the label is read when present, never invented.
  const origin = tokens.length > 3 ? (ORIGIN_BY_LABEL.get(tokens[2]!) ?? null) : null;
  let reason: string | null = null;
  let kind: MemoryKind | null = null;
  let priv = false;
  let chatId: string | null = null;
  for (const t of tokens.slice(origin ? 3 : 2, -1)) {
    if (/^from \S/.test(t) && reason === null) reason = t;
    else if ((MEMORY_KINDS as readonly string[]).includes(t) && kind === null) kind = t as MemoryKind;
    else if (t === 'private' && !priv) priv = true;
    else if (/^chat:\S+$/.test(t) && chatId === null && file === ABOUT_YOU_FILE) chatId = t.slice('chat:'.length);
    else return null;
  }
  return { id, provenance, date, origin, reason, kind: kind ?? kindForFile(file), private: priv, chatId };
}

export function parseMemoryFile(text: string, opts: ParseOptions): ParseResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const doc: MemoryDoc = { file: opts.file, title: null, entries: [] };
  const facts: ParsedFact[] = [];
  const badLines: BadLine[] = [];
  let rewrite = false;
  let underPrivate = false;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trimEnd();
    if (line.trim() === '') return;
    if (line.trim() === PRIVATE_HEADING) {
      underPrivate = true;
      return;
    }
    if (/^#\s/.test(line) && doc.title === null && doc.entries.length === 0) {
      doc.title = line;
      return;
    }
    if (/^#{1,6}\s/.test(line)) {
      underPrivate = false;
      doc.entries.push({ type: 'line', line: { text: raw, private: false } });
      return;
    }
    const keep = () => {
      doc.entries.push({ type: 'line', line: { text: raw, private: underPrivate } });
      badLines.push({ lineNo, text: raw });
    };
    if (!line.startsWith('- ')) return keep();
    const m = FACT_LINE.exec(line);
    let fact: MemoryFact | null = null;
    if (m) {
      const tokens = readTokens(m[2]!.split(SEP), opts.file);
      const factText = m[1]!.trim();
      if (tokens && factText) fact = { ...tokens, text: factText };
    } else if (!/[{}]/.test(line) && line.slice(2).trim()) {
      fact = {
        id: opts.newId(),
        text: line.slice(2).trim(),
        provenance: 'said',
        date: opts.today,
        origin: 'manual',
        reason: null,
        kind: kindForFile(opts.file),
        private: false,
        chatId: null,
      };
      rewrite = true;
    }
    if (!fact) return keep();
    if (underPrivate && !fact.private) {
      fact.private = true;
      rewrite = true;
    }
    doc.entries.push({ type: 'fact', fact });
    facts.push({ ...fact, lineNo, hash: factHash(fact.text) });
  });

  return { doc, facts, badLines, rewrite };
}

export function formatFactLine(fact: MemoryFact, file: string): string {
  const tokens = [PROVENANCE_LABELS[fact.provenance], fact.date];
  if (fact.origin) tokens.push(ORIGIN_LABELS[fact.origin]);
  if (fact.reason) tokens.push(fact.reason);
  if (fact.kind !== kindForFile(file)) tokens.push(fact.kind);
  if (fact.private) tokens.push('private');
  if (fact.chatId) tokens.push(`chat:${fact.chatId}`);
  tokens.push(fact.id);
  return `- ${fact.text}  {${tokens.join(SEP)}}`;
}

/** UTF-8 text with LF line ends and no BOM; `## Private` holds exactly the private facts (and lines kept from there). */
export function writeMemoryFile(doc: MemoryDoc): string {
  const open: string[] = [];
  const priv: string[] = [];
  for (const e of doc.entries) {
    const isPrivate = e.type === 'fact' ? e.fact.private : e.line.private;
    const text = e.type === 'fact' ? formatFactLine(e.fact, doc.file) : e.line.text;
    (isPrivate ? priv : open).push(text);
  }
  const out = doc.title === null ? [...open] : [doc.title, ...open];
  if (priv.length > 0) {
    if (out.length > 0) out.push('');
    out.push(PRIVATE_HEADING, ...priv);
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

export type AddCheck = { ok: true } | { ok: false; reason: 'text' | 'person' | 'category' };

/** §12.4: `text` 1–120 chars, `kind='person'` needs `person`, `category` (when given) from the closed list. */
export function validateAdd(add: { text: string; kind: MemoryKind; person?: string; category?: string }): AddCheck {
  const text = add.text.trim();
  if (text.length === 0 || [...add.text].length > 120) return { ok: false, reason: 'text' };
  if (add.kind === 'person' && !add.person?.trim()) return { ok: false, reason: 'person' };
  if (add.category !== undefined && !(MEMORY_CATEGORIES as readonly string[]).includes(add.category)) {
    return { ok: false, reason: 'category' };
  }
  return { ok: true };
}
