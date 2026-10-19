// Spec: 08-1 §4.6 rule 2 (`messages.text`, `messages.text_for_ai`, `messages.transcript`, `drafts.text`,
// `tool_calls.args/result`, `activity.summary`, `activity.fields`, `cards.payload` and `suggestions.text` are written only
// through `Store.writeRedacted()` or the `redact` list of a DbOp insert, which call the Redactor), 08-2 §11.4 (R2 every DB
// text column; R7 activity summaries; main's Redactor scrubs the registry of record, then the patterns).
import { systemClock } from '../../shared/clock';
import { Redactor } from '../../shared/redactor';
import { mainRegistry } from '../secrets/registerValue';

/** §4.6 rule 2: the text columns that only ever hold redacted text. JSON columns have every string leaf redacted. */
export const REDACTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  messages: ['text', 'text_for_ai', 'transcript'],
  drafts: ['text'],
  tool_calls: ['args', 'result'],
  activity: ['summary', 'fields'],
  cards: ['payload'],
  suggestions: ['text'],
};

const redactor = new Redactor({ clock: systemClock, registry: mainRegistry() });

/** `Store.writeRedacted` (R2): a stored text after the registry and pattern scrub. */
export function writeRedacted(text: string): string {
  return redactor.redact(text).text;
}

/** Every string leaf of a JSON value through {@link writeRedacted} (keys stay). */
export function writeRedactedJson<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return writeRedacted(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/**
 * A row about to be written: each §4.6 rule 2 column of `table` (plus `extra`, a DbOp's `redact` list) redacted. A JSON
 * column given as text is parsed, redacted leaf by leaf and written back as JSON text.
 */
export function redactRow(table: string, row: Record<string, unknown>, extra: readonly string[] = []): Record<string, unknown> {
  const out = { ...row };
  for (const col of new Set([...(REDACTED_COLUMNS[table] ?? []), ...extra])) {
    const v = out[col];
    if (typeof v === 'string') {
      let parsed: unknown;
      try {
        parsed = v.trim().startsWith('{') || v.trim().startsWith('[') ? JSON.parse(v) : undefined;
      } catch {
        parsed = undefined;
      }
      out[col] = parsed === undefined ? writeRedacted(v) : JSON.stringify(writeRedactedJson(parsed));
    } else if (v && typeof v === 'object') out[col] = writeRedactedJson(v);
  }
  return out;
}
