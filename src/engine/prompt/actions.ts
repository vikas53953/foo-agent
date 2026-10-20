// Spec: 04-2 §21.7 "Action chips" (X-180, CR-0022: at most 3, each `{ kind: 'call' | 'map' | 'calendar' | 'link'; label;
// value }`, stored as JSON `ActionChip[]` in the reply's `messages.actions`, 08-1 §4.2 item 6), CR-0022 AT-367. R1 T7.
// The spec does not say how the AI hands them over; like the `Suggestions:` line (CR-0021 pick 10) the AI ends its reply
// with one `Actions: [ … ]` line of JSON, the engine strips it from the bubble and keeps only chips that pass these checks
// (R1.tsv: fork logged by the lead). The app never invents one.
import type { ActionChip } from '../../shared/types';
import { findBanned } from './filters';

/** 04-2 §21.7: at most this many action chips. */
export const ACTIONS_MAX = 3;
/** A chip label is as short as a follow-up chip (04-2 §21.7: ≤ 40 characters); longer is dropped, never cut. */
export const ACTION_LABEL_MAX = 40;

const LINE = /(^|\n)[ \t]*actions[ \t]*:/iu;
const KINDS = new Set<ActionChip['kind']>(['call', 'map', 'calendar', 'link']);
/** A phone number: digits with spaces, brackets and dashes, an optional leading +. */
const PHONE = /^\+?[0-9][0-9 ()-]{5,19}$/;
/** An ISO date, or date and time (the chip adds it to the calendar). */
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** Index where the `Actions:` line starts in `text` (just after its line break), or -1. */
export function actionsLineStart(text: string): number {
  const m = LINE.exec(text);
  return m ? m.index + m[1]!.length : -1;
}

/** Whether a chip's value is what its kind acts on. */
function valueOk(kind: ActionChip['kind'], value: string): boolean {
  switch (kind) {
    case 'call':
      return PHONE.test(value);
    case 'map':
      // A place's words, never a link (main builds the maps link from them).
      return value.length <= 120 && !/[<>]|^[a-z][a-z0-9+.-]*:/iu.test(value);
    case 'calendar':
      return ISO.test(value) && !Number.isNaN(Date.parse(value));
    case 'link':
      try {
        return value.length <= 2048 && new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
  }
}

/** Drops malformed, unknown, banned-word and duplicate chips, keeps the first three; null when none is left. */
export function cleanActions(raw: unknown): ActionChip[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ActionChip[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { kind, label, value } = item as Record<string, unknown>;
    if (typeof kind !== 'string' || !KINDS.has(kind as ActionChip['kind'])) continue;
    if (typeof label !== 'string' || typeof value !== 'string') continue;
    const l = label.trim().replace(/\s+/gu, ' ');
    const v = value.trim();
    if (!l || [...l].length > ACTION_LABEL_MAX || findBanned(l).length) continue;
    if (!v || !valueOk(kind as ActionChip['kind'], v)) continue;
    if (out.some((o) => o.kind === kind && o.value === v)) continue;
    out.push({ kind: kind as ActionChip['kind'], label: l, value: v });
    if (out.length === ACTIONS_MAX) break;
  }
  return out.length ? out : null;
}

function jsonOrNull(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** The reply text without its `Actions:` line, and the chips that line held (null when none passed). */
export function splitActions(say: string): { text: string; actions: ActionChip[] | null } {
  const start = actionsLineStart(say);
  if (start === -1) return { text: say, actions: null };
  const nl = say.indexOf('\n', start);
  const end = nl === -1 ? say.length : nl;
  const line = say.slice(start, end);
  const text = say.slice(0, start) + (nl === -1 ? '' : say.slice(nl + 1));
  return { text, actions: cleanActions(jsonOrNull(line.slice(line.indexOf(':') + 1))) };
}
