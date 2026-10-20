// Spec: 08-3 §22.4 (connectors are faked through the same seams the real ones use), §16.1.1 (token endpoint: code →
// access_token, refresh_token, scope, id_token; revoke endpoint), §16.1 Tokens (refresh; `invalid_grant`). A fake Google
// token + revoke endpoint behind the `HttpFetch` seam (unit tests) or a local HTTP server (e2e and foo-verify, reached
// through FOO_TEST_GOOGLE_BASE in FOO_TEST runs only). Fake accounts only: every address is @example.com.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HttpFetch } from '../../../src/engine/tools/connectors/types';

export const FAKE_CLIENT = {
  projectId: 'foo-desktop-test',
  clientId: 'fake-client.apps.googleusercontent.com',
  clientSecret: 'fake-secret',
  consentScreen: { appName: 'foo', supportEmail: 'support@example.com', privacyUrl: 'https://example.com/privacy' },
};
export const FAKE_EMAIL = 'vikas.tester@example.com';
export const ALL_SCOPES =
  'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly ' +
  'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events ' +
  'https://www.googleapis.com/auth/contacts.readonly';

export interface FakeRequest {
  method: string;
  url: string;
  host: string;
  body: string;
}

export interface FakeGoogleOptions {
  /** The scope string the token endpoint grants (default: all five). */
  scope?: string;
  /** Leave refresh_token out of the code reply (Google does when the user already granted and no prompt=consent). */
  noRefreshToken?: boolean;
  /** The token endpoint answers the code with `error=access_denied`. */
  denyCode?: boolean;
  /** Refresh answers `invalid_grant` (expired) or `invalid_grant` "Token has been expired or revoked." (revoked). */
  refresh?: 'ok' | 'expired' | 'revoked';
  email?: string;
  /** id_token `aud` (default: the fake client id). */
  aud?: string;
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** An unsigned id_token (foo reads its claims from Google's own TLS reply and checks iss + aud, 08-3 §16.1.1). */
export function fakeIdToken(email: string, aud = FAKE_CLIENT.clientId, iss = 'https://accounts.google.com'): string {
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss, aud, email, email_verified: true, sub: '1234567890' })}.sig`;
}

/** The fake's behaviour, shared by the in-memory fetch and the HTTP server. */
export class FakeGoogle {
  readonly requests: FakeRequest[] = [];
  readonly revoked: string[] = [];
  private issued = 0;
  constructor(public opts: FakeGoogleOptions = {}) {}

  /** Request log by path, e.g. `/token`, `/revoke`. */
  paths(): string[] {
    return this.requests.map((r) => new URL(r.url).pathname);
  }

  answer(method: string, url: string, body: string): { status: number; json: unknown } {
    const u = new URL(url);
    this.requests.push({ method, url, host: u.host, body });
    const form = new URLSearchParams(body);
    if (u.pathname === '/token' && form.get('grant_type') === 'authorization_code') {
      if (this.opts.denyCode) return { status: 400, json: { error: 'access_denied' } };
      if (!form.get('code') || !form.get('code_verifier')) return { status: 400, json: { error: 'invalid_request' } };
      this.issued += 1;
      return {
        status: 200,
        json: {
          access_token: `fake-access-${this.issued}`,
          expires_in: 3599,
          ...(this.opts.noRefreshToken ? {} : { refresh_token: `fake-refresh-${this.issued}` }),
          scope: this.opts.scope ?? ALL_SCOPES,
          token_type: 'Bearer',
          id_token: fakeIdToken(this.opts.email ?? FAKE_EMAIL, this.opts.aud),
        },
      };
    }
    if (u.pathname === '/token' && form.get('grant_type') === 'refresh_token') {
      const mode = this.opts.refresh ?? 'ok';
      if (mode === 'expired') return { status: 400, json: { error: 'invalid_grant', error_description: 'Bad Request' } };
      if (mode === 'revoked')
        return { status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } };
      this.issued += 1;
      return { status: 200, json: { access_token: `fake-access-${this.issued}`, expires_in: 3599, scope: this.opts.scope ?? ALL_SCOPES } };
    }
    if (u.pathname === '/revoke') {
      this.revoked.push(form.get('token') ?? u.searchParams.get('token') ?? '');
      return { status: 200, json: {} };
    }
    return { status: 404, json: { error: 'not_found' } };
  }

  /** The `HttpFetch` seam for unit tests. */
  readonly fetch: HttpFetch = async (url, init) => {
    const r = this.answer(init?.method ?? 'GET', url, init?.body ?? '');
    return { status: r.status, json: async () => r.json, text: async () => JSON.stringify(r.json) };
  };
}

/** A local HTTP server answering like Google's token and revoke endpoints (e2e and foo-verify). */
export async function startFakeGoogleServer(
  opts: FakeGoogleOptions = {},
): Promise<{ base: string; fake: FakeGoogle; close(): Promise<void> }> {
  const fake = new FakeGoogle(opts);
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      const r = fake.answer(req.method ?? 'GET', `http://${req.headers.host}${req.url}`, body);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, fake, close: () => new Promise((r) => server.close(() => r())) };
}
