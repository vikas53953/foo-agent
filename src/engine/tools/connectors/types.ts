// Spec: 08-3 §16.1.3 (Google calls: one access token in RAM, refresh on 401 once, `invalid_grant` → needs_signin), §16.6
// (connector interface), §22.4 (connectors are faked in tests through the same seams); CR-0012 (M8 ticket seams).
// The seams M8's parallel tickets agree on: T2 (Google sign-in) implements `GoogleAccess` and `ConnTokenStore`; T4 (Gmail,
// Calendar, Contacts) only consumes them. Tests pass fakes from test/fakes/connectors/.

/** One HTTP call. `fetch`-shaped so the real one is `globalThis.fetch` and tests pass a fake that records hosts. */
export type HttpFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/** The Google side of 08-3 §16.1.3, as the Gmail / Calendar / People callers see it. */
export interface GoogleAccess {
  /** A live access token (RAM only). Rejects with `CONN_EXPIRED` / `CONN_REVOKED` when Google refuses the refresh token. */
  accessToken(): Promise<string>;
  /** Called on a 401: drops the access token and refreshes once; the caller retries its request once. */
  refreshAfter401(): Promise<string>;
  /** Called on a 403 `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT`: flips the granted flag, emits `connection:upsert`. */
  scopeMissing(flag: 'read' | 'draft' | 'send' | 'calendarWrite' | 'contactsRead'): Promise<void>;
  /** The signed-in address (from the id_token, never a Gmail call), for "Open in Gmail" `authuser`. */
  email(): string | null;
}

/** Where the Google refresh token lives (08-2 §11.2 row `foo/conn_token/google`, JSON `{refresh_token, scope, issued_at}`).
 * M5's SecretVault is the real store; until it lands T2 uses an in-memory store behind this interface (needs M5). */
export interface ConnTokenStore {
  read(name: 'foo/conn_token/google'): Promise<{ refresh_token: string; scope: string; issued_at: number } | null>;
  write(name: 'foo/conn_token/google', value: { refresh_token: string; scope: string; issued_at: number }): Promise<void>;
  delete(name: 'foo/conn_token/google'): Promise<void>;
}
