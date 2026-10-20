// Spec: 08-3 §16.1 (connect → connecting; token with refresh_token → connected; `invalid_grant` → needs_signin on all three
// Google rows), §16.4 (WhatsApp linked / loggedOut), §21.2 (OAUTH_DENIED, OAUTH_TIMEOUT, CONN_EXPIRED, CONN_REVOKED,
// WA_LINK_FAILED, WA_UNLINKED); 0001 `connections` comment ("'connecting' is never kept past exit: at startup every
// 'connecting' row becomes 'disconnected'"); 08-0 §G.12 (connections model, X-74). The table of M8 pack §4.1, as one function.
import type { ConnectionRow } from '../../shared/types';

export type ConnStatus = ConnectionRow['status'];

export type ConnEvent =
  | 'connect' // connection:connect / whatsapp:linkStart / Reconnect / Link again
  | 'granted' // token with refresh_token / wa.linked
  | 'denied' // OAUTH_DENIED, OAUTH_TIMEOUT, NET_OFFLINE during sign-in, WA_LINK_FAILED
  | 'expired' // CONN_EXPIRED / CONN_REVOKED (Google)
  | 'unlinked' // WA_UNLINKED
  | 'app_start';

/** The next status, or null when the event does not apply in that status (the row stays as it is). */
export function nextStatus(from: ConnStatus | null, event: ConnEvent): ConnStatus | null {
  switch (event) {
    case 'connect':
      return 'connecting';
    case 'granted':
      return from === 'connecting' ? 'connected' : null;
    case 'denied':
      return from === 'connecting' ? 'disconnected' : null;
    case 'expired':
      return from === 'connected' ? 'needs_signin' : null;
    case 'unlinked':
      return from === 'connected' ? 'unlinked' : null;
    case 'app_start':
      return from === 'connecting' ? 'disconnected' : null;
  }
}

/** A row counts as connected for the cards and Settings: `connected` (granted flags still decide what is allowed). */
export const isConnected = (row: Pick<ConnectionRow, 'status'> | undefined): boolean => row?.status === 'connected';
