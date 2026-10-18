// Spec: 08-3 §16.1 Calls (self rate limit 5 requests/s; exponential backoff on 429/5xx, max 3 tries, never for drafts.send),
// Tokens (access token in RAM; refresh on 401 once; 403 insufficientPermissions / ACCESS_TOKEN_SCOPE_INSUFFICIENT → the granted
// flag false + CONN_SCOPE_MISSING), §21.2 (CONN_RATE_LIMITED, CONN_EXPIRED, CONN_REVOKED). CR-0012 seams: HttpFetch, GoogleAccess.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { ConnError, RateLimiter, googleCall } from '../../src/engine/tools/connectors/limiter';
import { drive, fakeAccess, fakeGmailRead, fakeGoogle, gmailState } from '../fakes/connectors/gmail-read';

const PROFILE = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

function setup() {
  const clock = new FakeClock();
  const g = fakeGoogle([fakeGmailRead(gmailState())], () => clock.now());
  const a = fakeAccess();
  const deps = { http: g.fetch, access: a.access, clock, limiter: new RateLimiter(clock) };
  return { clock, g, a, deps };
}

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ConnError ? e.kind : 'thrown';
  }
};

describe('08-3 §16.1 · self rate limit 5 requests/s', () => {
  it('the sixth call inside one second waits until the first is a second old', async () => {
    const { clock, g, deps } = setup();
    const start = clock.now();
    await drive(Promise.all(Array.from({ length: 6 }, () => googleCall(deps, { url: PROFILE, flag: 'read' }))), clock, 10);
    const at = g.requests.map((r) => r.at - start);
    expect(at.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(at[5]).toBeGreaterThanOrEqual(1_000);
    expect(at[5]).toBeLessThan(1_100);
  });

  it('11 calls never put more than 5 in any one-second window', async () => {
    const { clock, g, deps } = setup();
    await drive(Promise.all(Array.from({ length: 11 }, () => googleCall(deps, { url: PROFILE, flag: 'read' }))), clock, 10);
    const at = g.requests.map((r) => r.at);
    for (const t of at) expect(at.filter((x) => x >= t && x < t + 1_000).length).toBeLessThanOrEqual(5);
  });
});

describe('08-3 §16.1 · backoff on 429 / 5xx', () => {
  it('429 then 503 then 200 → three tries, the answer comes back', async () => {
    const { clock, g, deps } = setup();
    g.failNext('/gmail/v1/users/me/profile', { status: 429 }, { status: 503 });
    const r = await drive(googleCall(deps, { url: PROFILE, flag: 'read' }), clock);
    expect(r).toMatchObject({ emailAddress: 'tester@example.com' });
    expect(g.requests).toHaveLength(3);
    // exponential: the second wait is longer than the first
    const [a, b, c] = g.requests.map((x) => x.at);
    expect(c! - b!).toBeGreaterThan(b! - a!);
  });

  it('429 three times → stops after 3 tries with CONN_RATE_LIMITED', async () => {
    const { clock, g, deps } = setup();
    g.failNext('/gmail/v1/users/me/profile', { status: 429 }, { status: 429 }, { status: 429 }, { status: 429 });
    expect(await drive(kindOf(googleCall(deps, { url: PROFILE, flag: 'read' })), clock)).toBe('CONN_RATE_LIMITED');
    expect(g.requests).toHaveLength(3);
  });

  it('500 three times → UNKNOWN after 3 tries', async () => {
    const { clock, g, deps } = setup();
    g.failNext('/gmail/v1/users/me/profile', { status: 500 }, { status: 500 }, { status: 500 });
    expect(await drive(kindOf(googleCall(deps, { url: PROFILE, flag: 'read' })), clock)).toBe('UNKNOWN');
    expect(g.requests).toHaveLength(3);
  });

  it('never retries a call marked noRetry (drafts.send): one 503 → one request, failed', async () => {
    const { clock, g, deps } = setup();
    g.failNext('/gmail/v1/users/me/drafts/send', { status: 503 });
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send';
    const k = await drive(kindOf(googleCall(deps, { url, method: 'POST', body: { id: 'd1' }, flag: 'send', noRetry: true })), clock);
    expect(k).toBe('UNKNOWN');
    expect(g.requests).toHaveLength(1);
  });
});

describe('08-3 §16.1 Tokens · 401 and 403', () => {
  it('401 → refreshAfter401 once and the request is retried once with the new token', async () => {
    const { clock, g, a, deps } = setup();
    g.failNext('/gmail/v1/users/me/profile', { status: 401 });
    await drive(googleCall(deps, { url: PROFILE, flag: 'read' }), clock);
    expect(a.refreshes).toBe(1);
    expect(g.requests.map((r) => r.auth)).toEqual(['Bearer tok_0', 'Bearer tok_1']);
  });

  it('401 twice → CONN_EXPIRED, refreshed only once', async () => {
    const { clock, g, a, deps } = setup();
    g.failNext('/gmail/v1/users/me/profile', { status: 401 }, { status: 401 });
    expect(await drive(kindOf(googleCall(deps, { url: PROFILE, flag: 'read' })), clock)).toBe('CONN_EXPIRED');
    expect(a.refreshes).toBe(1);
    expect(g.requests).toHaveLength(2);
  });

  it('Google refuses the refresh token → the kind it names (CONN_REVOKED), no request sent', async () => {
    const { clock, g, a, deps } = setup();
    a.refuse = 'CONN_REVOKED';
    expect(await drive(kindOf(googleCall(deps, { url: PROFILE, flag: 'read' })), clock)).toBe('CONN_REVOKED');
    expect(g.requests).toHaveLength(0);
  });

  it('403 insufficientPermissions → scopeMissing(flag) + CONN_SCOPE_MISSING, no retry', async () => {
    const { clock, g, a, deps } = setup();
    g.failNext('/calendar/v3/', {
      status: 403,
      body: { error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } },
    });
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const k = await drive(kindOf(googleCall(deps, { url, method: 'POST', body: {}, flag: 'calendarWrite' })), clock);
    expect(k).toBe('CONN_SCOPE_MISSING');
    expect(a.missing).toEqual(['calendarWrite']);
    expect(g.requests).toHaveLength(1);
  });

  it('403 ACCESS_TOKEN_SCOPE_INSUFFICIENT (details form) → the same', async () => {
    const { clock, g, a, deps } = setup();
    g.failNext('/v1/people', {
      status: 403,
      body: { error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } },
    });
    const url = 'https://people.googleapis.com/v1/people/me/connections';
    expect(await drive(kindOf(googleCall(deps, { url, flag: 'contactsRead' })), clock)).toBe('CONN_SCOPE_MISSING');
    expect(a.missing).toEqual(['contactsRead']);
  });

  it('a network failure → NET_OFFLINE', async () => {
    const clock = new FakeClock();
    const deps = {
      http: () => Promise.reject(new Error('ENOTFOUND')),
      access: fakeAccess().access,
      clock,
      limiter: new RateLimiter(clock),
    };
    expect(await drive(kindOf(googleCall(deps, { url: PROFILE, flag: 'read' })), clock)).toBe('NET_OFFLINE');
  });
});
