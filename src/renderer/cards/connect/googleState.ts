// Spec: 05-3 §5.11.2 (Connect card states offered, opening, waiting, connected, partial, denied, expired, skipped; Offline
// is a look of offered), 08-1 §3.2 connection:connect (returns at once; the card follows connection:upsert), §3.3, X-74,
// X-127 (granted map; "Partly granted" when Calendar or Contacts was not granted, CR-0012 G-M8-04). One pure function: the
// card's look from its payload, the Google rows, what this card started, the network and whether the build has Google.
import type { ConnectPayload, ConnectionRow } from '../../../shared/types';

export type GoogleApp = 'gmail' | 'gcal' | 'contacts';
export type ConnectLook =
  | { state: 'offered'; offline: boolean; unavailable: boolean }
  | { state: 'opening' }
  | { state: 'waiting' }
  | { state: 'connected'; account: string }
  | { state: 'partial'; account: string; missing: 'send' | 'calendar' | 'contacts' }
  | { state: 'denied' }
  | { state: 'expired' }
  | { state: 'offline' }
  | { state: 'skipped' };

/** What this card did in this window: nothing, pressed (invoke in flight), or started a sign-in. */
export type LocalPhase = 'idle' | 'opening' | 'started' | 'skipped';

export const GOOGLE_ROW_APPS: readonly GoogleApp[] = ['gmail', 'gcal', 'contacts'];

/** `connection:connect` scopes for this card (05-3 §5.11.2: `payload.scopes`; Google variant: all three). */
export function cardScopes(p: ConnectPayload): GoogleApp[] {
  if (p.scopes?.length) return [...p.scopes];
  if (p.variant === 'one_app' && (p.app === 'gmail' || p.app === 'gcal' || p.app === 'contacts')) return [p.app];
  return [...GOOGLE_ROW_APPS];
}

export function connectLook(o: {
  payload: ConnectPayload;
  rows: ConnectionRow[];
  phase: LocalPhase;
  offline: boolean;
  available: boolean;
  cardState: string;
}): ConnectLook {
  if (o.phase === 'skipped' || o.cardState === 'skipped') return { state: 'skipped' };
  if (o.phase === 'opening') return { state: 'opening' };
  const scopes = cardScopes(o.payload);
  const rows = o.rows.filter((r) => scopes.includes(r.app as GoogleApp) && r.status !== 'disconnected');
  if (rows.some((r) => r.status === 'connecting')) return { state: o.phase === 'started' ? 'waiting' : 'opening' };
  const main = rows.find((r) => r.app === scopes[0]) ?? rows[0];
  if (main && main.status === 'connected') {
    const g = main.granted;
    const account = main.accountLabel;
    const allow = o.payload.variant === 'allow_send';
    if (scopes.includes('gmail') && g.read && !g.send) return allow ? offered(o) : { state: 'partial', account, missing: 'send' };
    if (allow) return { state: 'connected', account };
    if (scopes.includes('gcal') && !g.calendarWrite) return { state: 'partial', account, missing: 'calendar' };
    if (scopes.includes('contacts') && !g.contactsRead) return { state: 'partial', account, missing: 'contacts' };
    return { state: 'connected', account };
  }
  if (o.phase === 'started') {
    const kind = o.rows.find((r) => scopes.includes(r.app as GoogleApp))?.lastErrorKind ?? null;
    if (kind === 'OAUTH_TIMEOUT') return { state: 'expired' };
    if (kind === 'NET_OFFLINE') return { state: 'offline' };
    if (kind) return { state: 'denied' };
  }
  return offered(o);
}

const offered = (o: { offline: boolean; available: boolean }): ConnectLook => ({
  state: 'offered',
  offline: o.offline,
  unavailable: !o.available,
});
