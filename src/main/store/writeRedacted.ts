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
  // M8 T3 (08-3 §16.4)
  wa_messages: ['text'],
};

const redactor = new Redactor({ clock: systemClock, registry: mainRegistry() });

/** `Store.writeRedacted` (R2): a stored text after the registry and pattern scrub. */
export function writeRedacted(text: string): string {
  return redactor.redact(text).text;
}

// M5 (CR-0009 G-M5-25): a JSON leaf that is exactly a foo id (08-0 §E.7 `{prefix}_{UUIDv7}`) is never a secret, but its
// 39+ characters of hex pass P17's length and entropy test; scrubbing it broke every stored card, activity and tool id.
const FOO_ID =
  /^(?:c|m|k|j|s|h|t|ap|py|dr|cn|tc|r|rr|act|nt|sg|hi|fl|bf|f|att)_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Every string leaf of a JSON value through {@link writeRedacted} (keys stay); whole foo ids pass unchanged. */
export function writeRedactedJson<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return FOO_ID.test(v) ? v : writeRedacted(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** The §4.6 rule 2 columns that hold JSON: every string leaf is redacted, keys and shape stay. */
export const REDACTED_JSON_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  tool_calls: ['args', 'result'],
  activity: ['fields'],
  cards: ['payload'],
};

/**
 * A row about to be written: each §4.6 rule 2 column of `table` (plus `extra`, a DbOp's `redact` list) redacted. Whether a
 * column is JSON comes from {@link REDACTED_JSON_COLUMNS}, never from its content: a JSON column given as text is parsed,
 * redacted leaf by leaf and written back as JSON text (text that does not parse is redacted whole); every other column is text.
 */
export function redactRow(table: string, row: Record<string, unknown>, extra: readonly string[] = []): Record<string, unknown> {
  const out = { ...row };
  const json = REDACTED_JSON_COLUMNS[table] ?? [];
  for (const col of new Set([...(REDACTED_COLUMNS[table] ?? []), ...extra])) {
    const v = out[col];
    if (typeof v === 'string' && json.includes(col)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(v);
      } catch {
        out[col] = writeRedacted(v);
        continue;
      }
      out[col] = JSON.stringify(writeRedactedJson(parsed));
    } else if (typeof v === 'string') out[col] = writeRedacted(v);
    else if (v && typeof v === 'object') out[col] = writeRedactedJson(v);
  }
  return out;
}
