// Spec: 08-3 §16.1 (Connect: Authorization Code + PKCE S256, loopback redirect, scopes, granted map X-127, one refresh token
// X-73, access token in RAM, refresh on 401 once, `invalid_grant` → needs_signin, 403 scope → flag false), §16.1.1 (client
// file, authorization URL params, token endpoint, id_token email checked against iss + aud, revoke), §16.6 (google.connect),
// §21.2 (CONN_EXPIRED / CONN_REVOKED / OAUTH_DENIED); 08-2 §11.4 (masked address). Process-agnostic: only the `HttpFetch` and
// `ConnTokenStore` seams (types.ts), so main's sign-in and the engine's connector calls share one implementation.
import { createHash, randomBytes } from 'node:crypto';
import { fail, ok, type Result } from '../../../shared/errors';
import type { ConnectionRow, ErrorKind } from '../../../shared/types';
import type { ConnTokenStore, GoogleAccess, HttpFetch } from './types';

export type GoogleApp = 'gmail' | 'gcal' | 'contacts';
export type Granted = ConnectionRow['granted'];
export type GrantedFlag = keyof Granted;

export const GOOGLE_APPS: readonly GoogleApp[] = ['gmail', 'gcal', 'contacts'];
export const GOOGLE_VAULT_NAME = 'foo/conn_token/google';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const G = 'https://www.googleapis.com/auth/';
/** §16.1 Scopes, per app; `openid email` is always asked. */
const APP_SCOPES: Record<GoogleApp, string[]> = {
  gmail: [`${G}gmail.readonly`, `${G}gmail.compose`],
  gcal: [`${G}calendar.events`],
  contacts: [`${G}contacts.readonly`],
};

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface GoogleEndpoints {
  token: string;
  revoke: string;
}

/**
 * Google's token and revoke endpoints. A FOO_TEST run may point them at a local fake (FOO_TEST_GOOGLE_BASE); any other run
 * always uses Google's (ART-15b: no other host).
 */
export function googleEndpoints(env: Record<string, string | undefined>): GoogleEndpoints {
  const base = env.FOO_TEST === '1' && env.FOO_TEST_GOOGLE_BASE ? env.FOO_TEST_GOOGLE_BASE : 'https://oauth2.googleapis.com';
  return { token: `${base}/token`, revoke: `${base}/revoke` };
}

/** `connection:connect { scopes? }`: the default is all three. */
export const scopeList = (scopes: readonly GoogleApp[] | undefined): GoogleApp[] =>
  GOOGLE_APPS.filter((a) => !scopes?.length || scopes.includes(a));

export function scopeString(scopes: readonly GoogleApp[]): string {
  return ['openid', 'email', ...scopeList(scopes).flatMap((a) => APP_SCOPES[a])].join(' ');
}

/** PKCE S256 (RFC 7636) and the 128-bit `state`. `random` is injectable for the RFC test vector. */
export function pkcePair(random: (n: number) => Buffer = randomBytes): { verifier: string; challenge: string; state: string } {
  const verifier = random(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(16).toString('base64url'),
  };
}

export interface AuthUrlParams {
  client: GoogleClient;
  redirectUri: string;
  scopes: readonly GoogleApp[];
  challenge: string;
  state: string;
  /** `consent`: first connect and every incremental consent; `reconnect`: select_account + login_hint. */
  mode: 'consent' | 'reconnect';
  loginHint?: string;
}

export function buildAuthUrl(p: AuthUrlParams): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.client.clientId,
    redirect_uri: p.redirectUri,
    scope: scopeString(p.scopes),
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: 'true',
    state: p.state,
  });
  if (p.mode === 'reconnect') {
    q.set('prompt', 'select_account');
    if (p.loginHint) q.set('login_hint', p.loginHint);
  } else q.set('prompt', 'consent');
  return `${AUTH_URL}?${q.toString()}`;
}

/** X-127: the granted map from a token or refresh response's space-separated `scope`. */
export function grantedFromScope(scope: string): Granted {
  const has = new Set(scope.split(/\s+/).filter(Boolean));
  const compose = has.has(`${G}gmail.compose`);
  return {
    read: has.has(`${G}gmail.readonly`),
    draft: compose,
    send: compose,
    calendarWrite: has.has(`${G}calendar.events`),
    contactsRead: has.has(`${G}contacts.readonly`),
  };
}

/** What a Gmail / Calendar / People call was doing, so a 403 scope refusal names the right flag. */
export type GoogleCallKind = 'gmail_read' | 'gmail_draft' | 'gmail_send' | 'calendar' | 'contacts';
const FLAG_OF: Record<GoogleCallKind, GrantedFlag> = {
  gmail_read: 'read',
  gmail_draft: 'draft',
  gmail_send: 'send',
  calendar: 'calendarWrite',
  contacts: 'contactsRead',
};

/** §16.1 Tokens: HTTP 403 `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT` → the flag to set false. */
export function scopeFlagFrom403(call: GoogleCallKind, body: unknown): GrantedFlag | null {
  const text = JSON.stringify(body ?? '');
  return /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(text) ? FLAG_OF[call] : null;
}

/** §16.1.1: the account e-mail is the id_token `email` claim, checked against `iss` and `aud`. */
export function emailFromIdToken(idToken: string, clientId: string): string | null {
  const part = idToken.split('.')[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { iss?: unknown; aud?: unknown; email?: unknown };
    const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issOk || claims.aud !== clientId || typeof claims.email !== 'string' || !claims.email.includes('@')) return null;
    return claims.email;
  } catch {
    return null;
  }
}

/** 0001 `connections.account_label` / 08-2 §11.4: `v***@gmail.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

async function postForm(http: HttpFetch, url: string, form: Record<string, string>) {
  return http(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

export interface TokenGrant {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scope: string;
  email: string;
}

/** §16.1.1 token endpoint: code → tokens. No refresh_token, a refusal or a bad id_token → `OAUTH_DENIED`. */
export async function exchangeCode(
  http: HttpFetch,
  endpoints: GoogleEndpoints,
  p: { client: GoogleClient; code: string; verifier: string; redirectUri: string },
): Promise<Result<TokenGrant>> {
  let res;
  try {
    res = await postForm(http, endpoints.token, {
      grant_type: 'authorization_code',
      code: p.code,
      code_verifier: p.verifier,
      client_id: p.client.clientId,
      client_secret: p.client.clientSecret,
      redirect_uri: p.redirectUri,
    });
  } catch {
    return fail('NET_OFFLINE');
  }
  if (res.status !== 200) return fail('OAUTH_DENIED');
  const j = (await res.json()) as Record<string, unknown>;
  const email = typeof j.id_token === 'string' ? emailFromIdToken(j.id_token, p.client.clientId) : null;
  if (typeof j.refresh_token !== 'string' || typeof j.access_token !== 'string' || !email) return fail('OAUTH_DENIED');
  return ok({
    refreshToken: j.refresh_token,
    accessToken: j.access_token,
    expiresIn: typeof j.expires_in === 'number' ? j.expires_in : 3600,
    scope: typeof j.scope === 'string' ? j.scope : '',
    email,
  });
}

/** §16.1 Tokens / §21.2: `invalid_grant` → `CONN_EXPIRED`, or `CONN_REVOKED` when Google says the token was revoked. */
export async function refreshAccess(
  http: HttpFetch,
  endpoints: GoogleEndpoints,
  client: GoogleClient,
  refreshToken: string,
): Promise<Result<{ accessToken: string; expiresIn: number; scope: string | null }>> {
  let res;
  try {
    res = await postForm(http, endpoints.token, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    });
  } catch {
    return fail('NET_OFFLINE');
  }
  const j = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (res.status !== 200 || typeof j.access_token !== 'string') {
    if (j.error === 'invalid_grant') return fail(/revoked/i.test(String(j.error_description ?? '')) ? 'CONN_REVOKED' : 'CONN_EXPIRED');
    return fail(res.status === 429 ? 'CONN_RATE_LIMITED' : 'CONN_EXPIRED');
  }
  return ok({
    accessToken: j.access_token,
    expiresIn: typeof j.expires_in === 'number' ? j.expires_in : 3600,
    scope: typeof j.scope === 'string' ? j.scope : null,
  });
}

/** §16.1 Limits: Disconnect Google revokes the token at Google. Best effort: false when Google could not be reached. */
export async function revokeToken(http: HttpFetch, endpoints: GoogleEndpoints, token: string): Promise<boolean> {
  try {
    const res = await postForm(http, endpoints.revoke, { token });
    return res.status === 200 || res.status === 400; // 400: already invalid at Google
  } catch {
    return false;
  }
}

/** The error a `GoogleAccess` call rejects with: callers fail their tool call with this kind. */
export class GoogleAccessError extends Error {
  constructor(readonly kind: ErrorKind) {
    super(kind);
  }
}

export interface GoogleAccessDeps {
  http: HttpFetch;
  endpoints: GoogleEndpoints;
  client: () => GoogleClient | null;
  tokens: ConnTokenStore;
  email: () => string | null;
  /** `invalid_grant`: all three rows `needs_signin` (§16.1 Tokens). */
  onLost: (kind: 'CONN_EXPIRED' | 'CONN_REVOKED') => void;
  /** 403 scope refusal: the flag goes false and `connection:upsert` follows. */
  onScopeMissing: (flag: GrantedFlag) => Promise<void>;
  /** The scope of every refresh response (the granted map is recomputed from it). */
  onScope?: (scope: string) => void;
}

/** §16.1 Tokens: one access token in RAM, refreshed when missing and once after a 401. */
export function createGoogleAccess(d: GoogleAccessDeps): GoogleAccess & { forget(): void } {
  let access: string | null = null;
  const refresh = async (): Promise<string> => {
    access = null;
    const stored = await d.tokens.read(GOOGLE_VAULT_NAME);
    const client = d.client();
    if (!stored || !client) throw new GoogleAccessError('CONN_EXPIRED');
    const r = await refreshAccess(d.http, d.endpoints, client, stored.refresh_token);
    if (!r.ok) {
      if (r.error.kind === 'CONN_EXPIRED' || r.error.kind === 'CONN_REVOKED') d.onLost(r.error.kind);
      throw new GoogleAccessError(r.error.kind);
    }
    if (r.value.scope) d.onScope?.(r.value.scope);
    access = r.value.accessToken;
    return access;
  };
  return {
    accessToken: () => (access ? Promise.resolve(access) : refresh()),
    refreshAfter401: refresh,
    scopeMissing: (flag) => d.onScopeMissing(flag),
    email: () => d.email(),
    forget: () => {
      access = null;
    },
  };
}
