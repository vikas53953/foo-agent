// Spec: docs/build-method.md (lead merges each ticket PR into the milestone branch), 11-fidelity §11.5.3 FID-18 (one trace
// row per link). Three-way merges for the row files every ticket touches, so a ticket merge stops only on real source
// conflicts (P1 + R1 retro, /mnt/project-files/foo/retro/findings.md struggle 1). Pure functions; scripts/merge-ticket.ts
// reads the git stages and writes the result.
import { HEADER, parseCsv } from './trace-check';

const ID_CELLS = ['AT / ART / PERF', 'UX step', 'BP ref'].map((h) => HEADER.indexOf(h));
const MILESTONE = HEADER.indexOf('Milestone');
const STATUS = HEADER.indexOf('Status');

export interface RowMerge {
  text: string;
  conflicts: string[];
}

function splitLines(text: string): string[] {
  return text.split('\n').filter((l) => l.trim() !== '');
}

/** A trace row's identity: its id cells plus its milestone (ART-26a has one row per milestone). */
function traceKey(line: string): string {
  const cells = parseCsv(line + '\n')[0] ?? [];
  return [...ID_CELLS, MILESTONE].map((i) => (cells[i] ?? '').trim()).join('|');
}

function traceStatus(line: string): string {
  return ((parseCsv(line + '\n')[0] ?? [])[STATUS] ?? '').trim();
}

/** Keyed three-way merge of spec/trace.csv. A row both sides changed differently resolves to the live one when exactly
 *  one side is live (a ticket flipping its own row); otherwise it is a conflict. Rows only theirs added are appended. */
export function mergeTrace(base: string, ours: string, theirs: string): RowMerge {
  const [header, ...oursRows] = splitLines(ours);
  const index = (text: string) =>
    new Map(
      splitLines(text)
        .slice(1)
        .map((l) => [traceKey(l), l]),
    );
  const b = index(base);
  const t = index(theirs);
  const conflicts: string[] = [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of oursRows) {
    const key = traceKey(o);
    seen.add(key);
    const bl = b.get(key);
    const tl = t.get(key);
    if (tl === undefined) {
      if (bl === undefined || bl === o) {
        if (bl === undefined) out.push(o); // ours added it; a row theirs deleted and ours kept unchanged stays deleted
        continue;
      }
      conflicts.push(`trace.csv: ${key} changed here and deleted in the ticket`);
      out.push(o);
      continue;
    }
    if (tl === o || tl === bl) out.push(o);
    else if (o === bl) out.push(tl);
    else if (traceStatus(o) === 'live' && traceStatus(tl) !== 'live') out.push(o);
    else if (traceStatus(tl) === 'live' && traceStatus(o) !== 'live') out.push(tl);
    else {
      conflicts.push(`trace.csv: ${key} changed on both sides`);
      out.push(o);
    }
  }
  for (const [key, tl] of t) if (!seen.has(key) && !b.has(key)) out.push(tl);
  return { text: [header ?? HEADER.join(','), ...out].join('\n') + '\n', conflicts };
}

/** Three-way merge of an append-mostly row file (docs/decisions/*.tsv): our lines in order, minus lines theirs removed,
 *  plus the lines theirs added, in their order. The header stays first. */
export function mergeLines(base: string, ours: string, theirs: string): RowMerge {
  const b = new Set(splitLines(base));
  const o = splitLines(ours);
  const t = splitLines(theirs);
  const tSet = new Set(t);
  const kept = o.filter((l, i) => i === 0 || !b.has(l) || tSet.has(l));
  const have = new Set(kept);
  const added = t.filter((l) => !b.has(l) && !have.has(l));
  return { text: [...kept, ...added].join('\n') + '\n', conflicts: [] };
}

interface Pending {
  keys: Record<string, string>;
  [k: string]: unknown;
}

/** Three-way merge of scripts/copy-pending.json keys: ours ∪ (added by theirs) − (removed by theirs). Tickets remove the
 *  keys they now render, so a plain union would bring used keys back and fail check-copy. */
export function mergePending(base: string, ours: string, theirs: string): RowMerge {
  const [b, o, t] = [base, ours, theirs].map((s) => JSON.parse(s) as Pending) as [Pending, Pending, Pending];
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.keys)) if (!(k in b.keys) || k in t.keys) keys[k] = v;
  for (const [k, v] of Object.entries(t.keys)) if (!(k in b.keys) && !(k in keys)) keys[k] = v;
  return { text: JSON.stringify({ ...o, keys }, null, 2) + '\n', conflicts: [] };
}
