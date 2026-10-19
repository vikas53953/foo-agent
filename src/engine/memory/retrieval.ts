// Spec: 08-4 §24.16 (memory retrieval for parts 5 and 5b: identity rows always, outside the 4,000-char cap; the pinned set
// `use_count DESC, learned_at DESC` while the lines stay ≤ 4,000 chars; up to 8 further FTS rows `bm25 ASC, use_count DESC,
// learned_at DESC`; the query build, step turns included; Art. 14 group exclusion and tombstones, applied by the named
// queries; line format), §24.1 (intake and step get part 5 in the system and 5b in the prompt), 08-3 §12.5, Art. 14.
import type { EngineFact } from '../../main/db/queries';
import type { StepRow } from '../../shared/types';
import type { DbOp } from '../protocol';
import { formatFactLine, type MemoryLine } from '../prompt/PromptBuilder';

/** A named query through main (`db.query`); resolves null when main refuses. */
export type MemoryQuery = <T>(name: string, ...args: unknown[]) => Promise<T | null>;

export const IDENTITY_FILE = 'memory/identity.md';
const PINNED_CAP = 4_000;
const TURN_FACTS_MAX = 8;

/** One offered fact: the PromptBuilder line input plus its formatted line and the row it came from. */
export interface OfferedFact extends MemoryLine {
  line: string;
  fact: EngineFact;
}

export interface MemoryParts {
  /** Identity rows first, then the pinned set (system part 5). */
  part5: OfferedFact[];
  /** Turn facts, ≤ 8 (prompt part 5b). */
  part5b: OfferedFact[];
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * §24.16 item 3 query build: NFC; every character that is not a letter, mark or number becomes a space; tokens of ≥ 2
 * grapheme clusters, duplicates dropped, each in double quotes, joined with ` OR `. No tokens → null (no turn set).
 */
export function ftsMatch(text: string): string | null {
  const words = text
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]/gu, ' ')
    .split(' ');
  const tokens: string[] = [];
  for (const tok of words) if (tok && !tokens.includes(tok) && [...graphemes.segment(tok)].length >= 2) tokens.push(tok);
  return tokens.length ? tokens.map((t) => `"${t}"`).join(' OR ') : null;
}

/**
 * §24.16 item 3, step turns: the job's last user message + `jobs.title` + the current step's slot values (the running or
 * waiting step, else the first pending one).
 */
export function stepQueryText(asked: string, title: string, steps: Pick<StepRow, 'state' | 'slots'>[]): string {
  const current = steps.find((s) => s.state === 'running' || s.state === 'waiting_user') ?? steps.find((s) => s.state === 'pending');
  const slots = current ? Object.values(current.slots).filter((v): v is string => typeof v === 'string') : [];
  return [asked, title, ...slots].join(' ');
}

function offer(f: EngineFact, timeZone: string, now: number): OfferedFact {
  const m: MemoryLine = { id: f.id, text: f.text, said: f.provenance === 'said' ? 'user' : 'guess', learnedAt: f.learnedAt };
  if (f.file === IDENTITY_FILE) m.identity = true;
  return { ...m, line: formatFactLine(m, timeZone, now), fact: f };
}

/**
 * Parts 5 and 5b for one turn in `chatId`. `text` is the query text (intake: the user's message). The named queries apply
 * the Art. 14 group rule, so a group chat never gets a private, about-you or ungranted chat-scope fact here.
 */
export async function buildMemoryParts(
  query: MemoryQuery,
  o: { chatId: string; text: string; timeZone: string; now: number },
): Promise<MemoryParts> {
  const scoped = (await query<EngineFact[]>('memoryByScope', o.chatId)) ?? [];
  const identity: OfferedFact[] = [];
  const pinned: OfferedFact[] = [];
  let size = 0;
  let full = false;
  for (const f of scoped) {
    const x = offer(f, o.timeZone, o.now);
    if (x.identity) {
      identity.push(x);
      continue;
    }
    // Lines are joined with "\n"; the set stops at the first line that would cross the cap (spec order is kept).
    if (full) continue;
    const add = (pinned.length ? 1 : 0) + x.line.length;
    if (size + add > PINNED_CAP) {
      full = true;
      continue;
    }
    pinned.push(x);
    size += add;
  }
  const part5 = [...identity, ...pinned];
  const match = ftsMatch(o.text);
  if (!match) return { part5, part5b: [] };
  const hits =
    (await query<EngineFact[]>(
      'memorySearch',
      o.chatId,
      match,
      TURN_FACTS_MAX,
      part5.map((x) => x.id),
    )) ?? [];
  return { part5, part5b: hits.slice(0, TURN_FACTS_MAX).map((f) => offer(f, o.timeZone, o.now)) };
}

/**
 * §24.16 item 6: the uses of a turn. Only ids offered in parts 5/5b as sent (`offered`, after the budget trims) count, once
 * each; any other id the AI names is ignored. `memory_index` gets `last_used_at` and `use_count + 1` (the count read for this
 * turn, since a DbOp `update` sets values, so a parallel turn's use can be lost); `memory_uses` one row each.
 */
export function memoryUseOps(
  named: string[],
  offered: string[],
  memory: MemoryParts,
  at: number,
  where: { chatId: string; jobId: string | null },
): DbOp[] {
  const facts = new Map([...memory.part5, ...memory.part5b].map((x) => [x.id, x.fact]));
  const ops: DbOp[] = [];
  for (const id of new Set(named)) {
    const f = offered.includes(id) ? facts.get(id) : undefined;
    if (!f) continue;
    ops.push(
      { op: 'update', table: 'memory_index', id, set: { last_used_at: at, use_count: f.useCount + 1 } },
      { op: 'insert', table: 'memory_uses', row: { fact_id: id, chat_id: where.chatId, job_id: where.jobId, at } },
    );
  }
  return ops;
}
