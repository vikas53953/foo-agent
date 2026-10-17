// Spec: 08-5 §5 `connections.ts { rows }` (mirrors Bootstrap.connections), rule 2 (rev), 08-1 §3.3 connection:upsert.
import type { ConnectionRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export interface ConnectionsState {
  rows: ConnectionRow[];
}

export const initialConnections = (): ConnectionsState => ({ rows: [] });

export function upsertConnectionReducer(s: ConnectionsState, row: ConnectionRow): void {
  const i = s.rows.findIndex((r) => r.id === row.id);
  if (i < 0) s.rows.push(row);
  else if (acceptRev('connection', row.id, s.rows[i], row)) s.rows[i] = row;
}

export const selectConnections = (s: RootState) => s.connections.rows;
