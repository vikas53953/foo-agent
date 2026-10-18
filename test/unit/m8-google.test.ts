// M8 T2 (08-3 §16.1, §16.1.1; X-73, X-127): the Google sign-in seams on the fake token endpoint. Expected values come from the
// spec text: the authorization URL and its params, PKCE S256 (RFC 7636 appendix B vector), the granted map, the id_token
// checks, the refresh rules (401 once; `invalid_grant` → expired or revoked), 403 scope flags, and the masked label.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildAuthUrl,
  createGoogleAccess,
  emailFromIdToken,
  exchangeCode,
  googleEndpoints,
  grantedFromScope,
  maskEmail,
  pkcePair,
  refreshAccess,
  revokeToken,
  scopeList,
  scopeFlagFrom403,
} from '../../src/engine/tools/connectors/google';
import { MemoryConnTokenStore } from '../../src/main/vault/connTokenMemory';
import { ALL_SCOPES, FAKE_CLIENT, FAKE_EMAIL, FakeGoogle, fakeIdToken } from '../fakes/connectors/google-oauth';

const client = { clientId: FAKE_CLIENT.clientId, clientSecret: FAKE_CLIENT.clientSecret };
const G = 'https://www.googleapis.com/auth/';
const endpoints = googleEndpoints({});

describe('M8 T2 · authorization URL (08-3 §16.1.1)', () => {
  const redirectUri = 'http://127.0.0.1:50123/oauth2/callback';

  it('carries every §16.1.1 param, PKCE S256 and prompt=consent on a first connect', () => {
    const u = new URL(
      buildAuthUrl({ client, redirectUri, scopes: ['gmail', 'gcal', 'contacts'], challenge: 'CH', state: 'ST', mode: 'consent' }),
    );
    expect(`${u.origin}${u.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = Object.fromEntries(u.searchParams);
    expect(p).toEqual({
      response_type: 'code',
      client_id: FAKE_CLIENT.clientId,
      redirect_uri: redirectUri,
      scope: `openid email ${G}gmail.readonly ${G}gmail.compose ${G}calendar.events ${G}contacts.readonly`,
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      access_type: 'offline',
      include_granted_scopes: 'true',
      state: 'ST',
      prompt: 'consent',
    });
  });

  it('incremental consent asks only for the missing scope, still with prompt=consent', () => {
    const u = new URL(buildAuthUrl({ client, redirectUri, scopes: ['gcal'], challenge: 'CH', state: 'ST', mode: 'consent' }));
    expect(u.searchParams.get('scope')).toBe(`openid email ${G}calendar.events`);
    expect(u.searchParams.get('prompt')).toBe('consent');
  });

  it('Reconnect is prompt=select_account with login_hint', () => {
    const u = new URL(
      buildAuthUrl({ client, redirectUri, scopes: ['gmail'], challenge: 'CH', state: 'ST', mode: 'reconnect', loginHint: FAKE_EMAIL }),
    );
    expect(u.searchParams.get('prompt')).toBe('select_account');
    expect(u.searchParams.get('login_hint')).toBe(FAKE_EMAIL);
  });

  it('scopes default to all three apps', () => {
    expect(scopeList(undefined)).toEqual(['gmail', 'gcal', 'contacts']);
  });
});

describe('M8 T2 · PKCE and state', () => {
  it('challenge = base64url(sha256(verifier)), RFC 7636 appendix B', () => {
    const bytes = Buffer.from([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83,
      132, 141, 121,
    ]);
    const p = pkcePair(() => bytes);
    expect(p.verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(p.challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('state is 128 random bits; verifier is 43 to 128 characters', () => {
    const p = pkcePair();
    expect(p.verifier.length).toBeGreaterThanOrEqual(43);
    expect(p.verifier.length).toBeLessThanOrEqual(128);
    expect(Buffer.from(p.state, 'base64url')).toHaveLength(16);
    expect(pkcePair().state).not.toBe(p.state);
    expect(createHash('sha256').update(p.verifier).digest('base64url')).toBe(p.challenge);
  });
});

describe('M8 T2 · granted map (X-127)', () => {
  it('maps each scope to its flag; send and draft both come from gmail.compose', () => {
    expect(grantedFromScope(ALL_SCOPES)).toEqual({ read: true, draft: true, send: true, calendarWrite: true, contactsRead: true });
    expect(grantedFromScope(`openid ${G}gmail.readonly ${G}contacts.readonly`)).toEqual({
      read: true,
      draft: false,
      send: false,
      calendarWrite: false,
      contactsRead: true,
    });
    expect(grantedFromScope('')).toEqual({ read: false, draft: false, send: false, calendarWrite: false, contactsRead: false });
  });

  it('403 insufficientPermissions / ACCESS_TOKEN_SCOPE_INSUFFICIENT names a flag; other 403s do not', () => {
    const body = (reason: string) => ({ error: { code: 403, errors: [{ reason }], details: [{ reason }] } });
    expect(scopeFlagFrom403('calendar', body('insufficientPermissions'))).toBe('calendarWrite');
    expect(scopeFlagFrom403('contacts', body('ACCESS_TOKEN_SCOPE_INSUFFICIENT'))).toBe('contactsRead');
    expect(scopeFlagFrom403('gmail_send', body('insufficientPermissions'))).toBe('send');
    expect(scopeFlagFrom403('gmail_read', body('rateLimitExceeded'))).toBeNull();
  });
});

describe('M8 T2 · token exchange on the fake token endpoint', () => {
  it('code → refresh token, scope, and the email from the id_token (never a Gmail call)', async () => {
    const g = new FakeGoogle();
    const r = await exchangeCode(g.fetch, endpoints, { client, code: 'c1', verifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:1/x' });
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({ refreshToken: 'fake-refresh-1', scope: ALL_SCOPES, email: FAKE_EMAIL }),
    });
    expect(g.requests.map((q) => q.host)).toEqual(['oauth2.googleapis.com']);
    const form = new URLSearchParams(g.requests[0]!.body);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code_verifier')).toBe('v'.repeat(43));
    expect(form.get('client_id')).toBe(FAKE_CLIENT.clientId);
  });

  it('no refresh_token → OAUTH_DENIED', async () => {
    const g = new FakeGoogle({ noRefreshToken: true });
    const r = await exchangeCode(g.fetch, endpoints, { client, code: 'c1', verifier: 'v'.repeat(43), redirectUri: 'x' });
    expect(r).toEqual({ ok: false, error: { kind: 'OAUTH_DENIED' } });
  });

  it('an id_token for another client or issuer is refused (OAUTH_DENIED)', async () => {
    const g = new FakeGoogle({ aud: 'someone-else.apps.googleusercontent.com' });
    const r = await exchangeCode(g.fetch, endpoints, { client, code: 'c1', verifier: 'v'.repeat(43), redirectUri: 'x' });
    expect(r.ok).toBe(false);
    expect(emailFromIdToken(fakeIdToken(FAKE_EMAIL, client.clientId, 'https://evil.example.com'), client.clientId)).toBeNull();
    expect(emailFromIdToken(fakeIdToken(FAKE_EMAIL, client.clientId, 'accounts.google.com'), client.clientId)).toBe(FAKE_EMAIL);
    expect(emailFromIdToken('not-a-jwt', client.clientId)).toBeNull();
  });

  it('a network failure is NET_OFFLINE', async () => {
    const r = await exchangeCode(
      async () => {
        throw new Error('ECONNREFUSED');
      },
      endpoints,
      { client, code: 'c', verifier: 'v'.repeat(43), redirectUri: 'x' },
    );
    expect(r).toEqual({ ok: false, error: { kind: 'NET_OFFLINE' } });
  });

  it('refresh: invalid_grant → CONN_EXPIRED; "revoked" wording → CONN_REVOKED', async () => {
    expect(await refreshAccess(new FakeGoogle({ refresh: 'expired' }).fetch, endpoints, client, 'r')).toEqual({
      ok: false,
      error: { kind: 'CONN_EXPIRED' },
    });
    expect(await refreshAccess(new FakeGoogle({ refresh: 'revoked' }).fetch, endpoints, client, 'r')).toEqual({
      ok: false,
      error: { kind: 'CONN_REVOKED' },
    });
  });

  it('revoke posts the token to https://oauth2.googleapis.com/revoke', async () => {
    const g = new FakeGoogle();
    await revokeToken(g.fetch, endpoints, 'fake-refresh-9');
    expect(g.requests[0]!.url).toBe('https://oauth2.googleapis.com/revoke');
    expect(g.revoked).toEqual(['fake-refresh-9']);
  });

  it('FOO_TEST runs may point the endpoints at a local fake; other runs never', () => {
    expect(googleEndpoints({ FOO_TEST: '1', FOO_TEST_GOOGLE_BASE: 'http://127.0.0.1:9' }).token).toBe('http://127.0.0.1:9/token');
    expect(googleEndpoints({ FOO_TEST_GOOGLE_BASE: 'http://127.0.0.1:9' }).token).toBe('https://oauth2.googleapis.com/token');
  });
});

describe('M8 T2 · GoogleAccess (08-3 §16.1 Tokens)', () => {
  const stored = async (g: FakeGoogle) => {
    const tokens = new MemoryConnTokenStore();
    await tokens.write('foo/conn_token/google', { refresh_token: 'fake-refresh-0', scope: ALL_SCOPES, issued_at: 1 });
    const lost: string[] = [];
    const flags: string[] = [];
    const granted: string[] = [];
    const access = createGoogleAccess({
      http: g.fetch,
      endpoints,
      client: () => client,
      tokens,
      email: () => FAKE_EMAIL,
      onLost: (kind) => lost.push(kind),
      onScopeMissing: async (flag) => void flags.push(flag),
      onScope: (scope) => granted.push(scope),
    });
    return { tokens, access, lost, flags, granted };
  };

  it('one access token in RAM: the second call makes no request', async () => {
    const g = new FakeGoogle();
    const { access } = await stored(g);
    expect(await access.accessToken()).toBe('fake-access-1');
    expect(await access.accessToken()).toBe('fake-access-1');
    expect(g.paths()).toEqual(['/token']);
  });

  it('refreshAfter401 drops the token and refreshes once; the scope of every refresh is reported', async () => {
    const g = new FakeGoogle();
    const { access, granted } = await stored(g);
    await access.accessToken();
    expect(await access.refreshAfter401()).toBe('fake-access-2');
    expect(granted).toEqual([ALL_SCOPES, ALL_SCOPES]);
  });

  it('invalid_grant → onLost(CONN_EXPIRED) and the call rejects with that kind', async () => {
    const g = new FakeGoogle({ refresh: 'expired' });
    const { access, lost } = await stored(g);
    await expect(access.accessToken()).rejects.toMatchObject({ kind: 'CONN_EXPIRED' });
    expect(lost).toEqual(['CONN_EXPIRED']);
  });

  it('no stored token → CONN_EXPIRED without a request', async () => {
    const g = new FakeGoogle();
    const { access, tokens } = await stored(g);
    await tokens.delete('foo/conn_token/google');
    await expect(access.accessToken()).rejects.toMatchObject({ kind: 'CONN_EXPIRED' });
    expect(g.requests).toHaveLength(0);
  });

  it('scopeMissing forwards the flag; email comes from the sign-in', async () => {
    const { access, flags } = await stored(new FakeGoogle());
    await access.scopeMissing('calendarWrite');
    expect(flags).toEqual(['calendarWrite']);
    expect(access.email()).toBe(FAKE_EMAIL);
  });
});

describe('M8 T2 · masked account label (0001 connections.account_label, 08-2 §11.4)', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('vikas.tester@example.com')).toBe('v***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });
});
