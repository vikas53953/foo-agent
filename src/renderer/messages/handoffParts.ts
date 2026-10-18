// Spec: 05-3 §5.18.1 (handoff marker: helper names in the line are Link buttons to that helper's chat; foo → helper,
// helper back, helper → helper), §5.18.3 (each name a Tab stop, `thread-marker-link` with `data-index` in reading order).
// The engine writes the words (04 §19.5); the marker only finds the helpers' names in them.
import type { HelperRow } from '../../shared/types';

export type MarkerHelper = Pick<HelperRow, 'id' | 'name' | 'chatId' | 'colorToken'>;
export type MarkerPart<H extends MarkerHelper = MarkerHelper> = { text: string } | { helper: H; index: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The line split into text and helper names (whole words, as written), in reading order. */
export function handoffParts<H extends MarkerHelper>(text: string, helpers: readonly H[]): MarkerPart<H>[] {
  const named = helpers.filter((h) => h.name.trim());
  if (!named.length) return [{ text }];
  const byName = new Map(named.map((h) => [h.name, h]));
  // Longest first, so "Trips Pro" wins over "Trips".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  const out: MarkerPart<H>[] = [];
  let at = 0;
  let index = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ helper: byName.get(m[0])!, index: index++ });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
