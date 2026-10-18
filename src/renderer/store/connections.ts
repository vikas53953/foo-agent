// Spec: 08-5 §5 `connections.ts { rows }` (mirrors Bootstrap.connections), rule 2 (rev), 08-1 §3.3 connection:upsert.
import type { ConnectionRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export interface ConnectionsState {
  rows: ConnectionRow[];
  /** M8 T3: the newest `whatsapp:qr` code of the running link attempt (08-3 §16.4.4). */
  qr: { png: string; expiresAt: number } | null;
}

export const initialConnections = (): ConnectionsState => ({ rows: [], qr: null });

export function upsertConnectionReducer(s: ConnectionsState, row: ConnectionRow): void {
  const i = s.rows.findIndex((r) => r.id === row.id);
  if (i < 0) s.rows.push(row);
  else if (acceptRev('connection', row.id, s.rows[i], row)) s.rows[i] = row;
}

export const selectConnections = (s: RootState) => s.connections.rows;
export const selectWaQr = (s: RootState) => s.connections.qr;
export const selectWhatsAppRow = (s: RootState) => s.connections.rows.find((r) => r.app === 'whatsapp') ?? null;
