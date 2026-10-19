// Spec: 08-3 §12.6 (forget writes tombstone `{hash, origin_kind, forgotten_at, expires_at = +90 d}` to the DB and
// `memory\.tombstones`), §12.1 ("never saved": a fact whose hash has a live tombstone for the same origin kind, 90 days, J17),
// 08-1 §4.3.9 (`memory_tombstones` PK (hash, origin_kind)), CR-0010 §(b) 13 (insert-or-replace; delete by `{hash}|{originKind}`;
// main writes `memory/.tombstones` through `file.write`). The mirror holds one JSON object per line, the DB row's columns.
import type { EngineTombstone } from '../../main/db/queries';
import type { MemoryOrigin } from '../../shared/types';
import type { DbOp } from '../protocol';

export const TOMBSTONE_MS = 90 * 24 * 60 * 60_000;
export const TOMBSTONES_FILE = 'memory/.tombstones';

export function tombstoneOp(hash: string, originKind: MemoryOrigin, now: number): DbOp {
  return {
    op: 'insert',
    table: 'memory_tombstones',
    row: { hash, origin_kind: originKind, forgotten_at: now, expires_at: now + TOMBSTONE_MS },
  };
}

export function liftTombstoneOp(hash: string, originKind: MemoryOrigin): DbOp {
  return { op: 'delete', table: 'memory_tombstones', id: `${hash}|${originKind}` };
}

/** `memory\.tombstones`: the live tombstones, one JSON line each, oldest first. */
export function tombstonesText(rows: readonly EngineTombstone[]): string {
  return rows
    .map((r) => `${JSON.stringify({ hash: r.hash, origin_kind: r.originKind, forgotten_at: r.forgottenAt, expires_at: r.expiresAt })}\n`)
    .join('');
}
