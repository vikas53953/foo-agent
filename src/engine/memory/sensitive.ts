// Spec: 08-3 §12.4.1 (sensitive facts: a deterministic engine rule run on every add/update/manual edit before the AI's label is
// read; sensitive when the category ∈ {health, money, religion, politics, family} or the text matches one of five pattern
// families, case-insensitive, NFKC, Latin and Devanagari/Gurmukhi; contact details count only when the fact is about another
// person: `kind='person'`, a `people\` file, or a name in `contacts_index`; sensitive and guessed → dropped and logged
// `memory.dropped_sensitive`, no chip; sensitive and said → saved with `private` forced on), §12.1, AT-076, R-33. The patterns
// are §12.4.1's, copied as written.
import type { MemoryKind, MemoryProvenance } from './fileFormat';

const SENSITIVE_CATEGORIES: ReadonlySet<string> = new Set(['health', 'money', 'religion', 'politics', 'family']);

const HEALTH =
  /\b(allerg|diabet|bp|blood pressure|thyroid|pregnan|asthma|depress|anxiet|medicine|tablet|dose|doctor|hospital|surgery|disease|hiv|cancer)\w*|एलर्जी|दवा|डॉक्टर|बीमार|ਦਵਾਈ|ਡਾਕਟਰ/i;
const MONEY = /₹\s?\d|\b(rs\.?|inr|rupees?|lakh|crore|salary|loan|emi|debt|balance)\b|रुपय|तनख्वाह|ਤਨਖ਼ਾਹ/i;
const RELIGION =
  /\b(hindu|muslim|sikh|christian|jain|buddhist|temple|mosque|church|gurdwara|fast(ing)?|roza|vrat|puja|namaz)\b|मंदिर|मस्जिद|पूजा|ਗੁਰਦੁਆਰਾ/i;
const POLITICS = /\b(bjp|congress|aap|vote[sd]?|party|election|modi|rahul|kejriwal)\b|चुनाव|वोट|ਵੋਟ/i;
const CONTACT = /(\+91[\s-]?\d{5}[\s-]?\d{5}|\b\d{10}\b|\b\d{6}\b.*(road|nagar|colony|sector|street|marg)|lives? at|address)/i;

export interface SensitiveInput {
  text: string;
  /** The AI's or the classify turn's label; stored for the filter, and only ever adds sensitivity here. */
  category: string;
  kind: MemoryKind;
  /** The target file (relative to {DATA}); a `memory/people/` file means the fact is about another person. */
  file?: string;
  /** Display names from `contacts_index`. */
  contacts?: readonly string[];
}

const norm = (s: string) => s.normalize('NFKC');

function namesAnotherPerson(input: SensitiveInput, text: string): boolean {
  if (input.kind === 'person' || input.file?.startsWith('memory/people/')) return true;
  const lower = text.toLowerCase();
  return (input.contacts ?? []).some((name) =>
    norm(name)
      .toLowerCase()
      .split(/\s+/u)
      .some((part) => part.length > 1 && new RegExp(`(^|[^\\p{L}\\p{M}])${escape(part)}($|[^\\p{L}\\p{M}])`, 'u').test(lower)),
  );
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isSensitive(input: SensitiveInput): boolean {
  if (SENSITIVE_CATEGORIES.has(input.category)) return true;
  const text = norm(input.text);
  if (HEALTH.test(text) || MONEY.test(text) || RELIGION.test(text) || POLITICS.test(text)) return true;
  return CONTACT.test(text) && namesAnotherPerson(input, text);
}

export type SensitiveDecision = { save: false; log: 'memory.dropped_sensitive' } | { save: true; sensitive: boolean; private: boolean };

/** §12.4.1 applied to one op: what to save, decided before (and regardless of) the AI's own `private` request. */
export function sensitiveRule(op: SensitiveInput & { provenance: MemoryProvenance; private: boolean }): SensitiveDecision {
  if (!isSensitive(op)) return { save: true, sensitive: false, private: op.private };
  if (op.provenance === 'guessed') return { save: false, log: 'memory.dropped_sensitive' };
  return { save: true, sensitive: true, private: true };
}
