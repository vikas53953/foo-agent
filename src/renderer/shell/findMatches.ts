// Spec: 03-shell-2 §3.6.3 (find bar: local search over the loaded messages; Enter next, Shift+Enter previous; "{i} of {n}"),
// J22 step 5. Pure.
import type { MessageRow } from '../../shared/types';

export interface FindMatch {
  messageId: string;
  start: number;
  end: number;
}

export function findMatches(messages: MessageRow[], query: string): FindMatch[] {
  const q = query.trim().toLocaleLowerCase('en-IN');
  if (!q) return [];
  const out: FindMatch[] = [];
  for (const m of messages) {
    // Text and voice transcripts only: cards draw their own content (M2), so their matches could not be highlighted here.
    if (m.kind === 'marker' || m.kind === 'card') continue;
    const text = m.text.toLocaleLowerCase('en-IN');
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) out.push({ messageId: m.id, start: i, end: i + q.length });
  }
  return out;
}

/** Next (dir 1) or previous (dir −1) match index, wrapping; −1 when there are none. */
export function stepMatch(current: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  return (current + dir + count) % count;
}
