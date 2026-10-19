// Spec: 08-3 §12.2 (the files are the truth and `memory_index` is their cache: `memory_index.file` relative to {DATA} with
// forward slashes, `chat:{chatId}` → scope 'chat' + `chat_id` (X-112), helper notes → scope 'helper', the full origin reference
// kept in `memory_index.origin`, not in the file), §12.4.1 (the sensitive flag is the engine's rule, re-run on every manual
// edit), 08-1 §2.5 (the rows go to main as one `db.tx`; main rebuilds `memory_fts` in it), §4.3.9 (memory_index columns).
// reindex(file text) → the index ops that make `memory_index` match one parsed file.
import type { EngineFact } from '../../main/db/queries';
import type { DbOp } from '../protocol';
import type { MemoryScope } from '../../shared/types';
import type { ParsedFact } from './fileFormat';
import { isSensitive } from './sensitive';

/** Index-only columns a moved or restored line keeps (the file cannot hold them). */
export type KeptColumns = Pick<EngineFact, 'origin' | 'category' | 'learnedAt' | 'lastUsedAt' | 'useCount'>;

export interface IndexInput {
  file: string;
  /** The facts of the file as it now stands on disk. */
  facts: readonly ParsedFact[];
  /** `memory.byFile(file)`. */
  rows: readonly EngineFact[];
  /** Rows of other files whose id now appears in this file (the line moved). */
  moved: ReadonlyMap<string, EngineFact>;
  /** Columns to restore for ids that have no row (undo, a move done by the engine). */
  kept?: ReadonlyMap<string, Partial<KeptColumns>>;
  now: number;
  /** The user's local date, YYYY-MM-DD. */
  today: string;
}

export function scopeOf(file: string, chatId: string | null): MemoryScope {
  if (file.startsWith('helpers/')) return 'helper';
  return chatId ? 'chat' : 'global';
}

/** A new line's `learned_at`: now for today's date, else midday UTC of the written date (the file has no time). */
function learnedAt(date: string, today: string, now: number): number {
  return date === today ? now : Date.parse(`${date}T12:00:00Z`);
}

/** The file-owned columns of one parsed line, as `memory_index` names them. */
function fileColumns(file: string, f: ParsedFact, category: string | null): Record<string, unknown> {
  return {
    file,
    line_no: f.lineNo,
    scope: scopeOf(file, f.chatId),
    chat_id: f.chatId,
    text: f.text,
    provenance: f.provenance,
    origin_kind: f.origin,
    reason: f.reason,
    kind: f.kind,
    private: f.private ? 1 : 0,
    sensitive: isSensitive({ text: f.text, category: category ?? 'other', kind: f.kind, file }) ? 1 : 0,
    hash: f.hash,
  };
}

/** The same columns read back from a row, for a changed-or-not comparison. */
function rowColumns(r: EngineFact): Record<string, unknown> {
  return {
    file: r.file,
    line_no: r.lineNo,
    scope: r.scope,
    chat_id: r.chatId,
    text: r.text,
    provenance: r.provenance,
    origin_kind: r.originKind,
    reason: r.reason,
    kind: r.kind,
    private: r.private ? 1 : 0,
    sensitive: r.sensitive ? 1 : 0,
    hash: r.hash,
  };
}

export function indexOps(input: IndexInput): DbOp[] {
  const ops: DbOp[] = [];
  const seen = new Set<string>();
  const byId = new Map(input.rows.map((r) => [r.id, r]));
  for (const f of input.facts) {
    if (seen.has(f.id)) continue; // a pasted duplicate line keeps its first place
    seen.add(f.id);
    const row = byId.get(f.id) ?? input.moved.get(f.id);
    if (row) {
      const next = fileColumns(input.file, f, row.category);
      const cur = rowColumns(row);
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(next)) if (cur[k] !== v) set[k] = v;
      if (row.originKind !== f.origin) set.origin = f.origin;
      if (Object.keys(set).length) ops.push({ op: 'update', table: 'memory_index', id: f.id, set });
      continue;
    }
    const kept = input.kept?.get(f.id);
    ops.push({
      op: 'insert',
      table: 'memory_index',
      row: {
        id: f.id,
        ...fileColumns(input.file, f, kept?.category ?? null),
        origin: kept?.origin ?? f.origin,
        category: kept?.category ?? null,
        learned_at: kept?.learnedAt ?? learnedAt(f.date, input.today, input.now),
        last_used_at: kept?.lastUsedAt ?? null,
        use_count: kept?.useCount ?? 0,
      },
    });
  }
  for (const r of input.rows) if (!seen.has(r.id)) ops.push({ op: 'delete', table: 'memory_index', id: r.id });
  return ops;
}
