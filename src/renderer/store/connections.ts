// Spec: 08-5 §5 `connections.ts { rows }` (mirrors Bootstrap.connections), rule 2 (rev), 08-1 §3.3 connection:upsert.
// M8 T3: the newest QR code (08-1 §3.3 whatsapp:qr) and the mirrors hidden with C-8 in this window (06-2 §6.8 "Groups I
// read" shows them again; the chat list drops archived chats and no read lists them).
import type { ChatRow, ConnectionRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export interface ConnectionsState {
  rows: ConnectionRow[];
  /** M8 T3: the newest `whatsapp:qr` code of the running link attempt (08-3 §16.4.4). */
  qr: { png: string; expiresAt: number } | null;
  /** M8 T3: mirrors hidden with `chat:archive { on: true }`, by chat id, so Settings can show them again. */
  hiddenMirrors: Record<string, ChatRow>;
}

export const initialConnections = (): ConnectionsState => ({ rows: [], qr: null, hiddenMirrors: {} });

export function upsertConnectionReducer(s: ConnectionsState, row: ConnectionRow): void {
  const i = s.rows.findIndex((r) => r.id === row.id);
  if (i < 0) s.rows.push(row);
  else if (acceptRev('connection', row.id, s.rows[i], row)) s.rows[i] = row;
}

export const selectConnections = (s: RootState) => s.connections.rows;
export const selectWaQr = (s: RootState) => s.connections.qr;
/** One WhatsApp account (08-1 §4.3.10): an Unlink's row stays here as `disconnected`, so the newest link attempt wins. */
export const selectWhatsAppRow = (s: RootState) =>
  s.connections.rows.reduce<ConnectionRow | null>(
    (best, r) => (r.app === 'whatsapp' && (!best || r.connectedAt >= best.connectedAt) ? r : best),
    null,
  );
export const selectHiddenMirrors = (s: RootState) => s.connections.hiddenMirrors;
