// M8 T2 (08-3 §16.1, §16.1.1, §16.1.2, C-10; 08-1 §3.2 connection:connect/disconnect, §3.3 connection:upsert; 08-0 §G.4,
// §G.12; 0001 connections): the loopback listener (one request, state check, 10 min), the status machine, and main's Google
// connections on the fake token endpoint — one sign-in → three rows; denied / timeout / no refresh_token → lastErrorKind;
// invalid_grant → needs_signin ×3; 403 → flag false; Disconnect revokes and deletes rows + contacts_index; startup
// connecting → disconnected; activity rows.
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextStatus } from '../../src/engine/connections/machine';
import { googleEndpoints, type GoogleApp } from '../../src/engine/tools/connectors/google';
import { GoogleConnections, type ConnectionCmd } from '../../src/main/connections/GoogleConnections';
import { loadGoogleClient, parseGoogleClient } from '../../src/main/connections/googleClient';
import { migrate, type Db } from '../../src/main/store/db';
import { MemoryConnTokenStore } from '../../src/main/vault/connTokenMemory';
import { loopbackPage, openLoopback, type Loopback } from '../../src/main/windows/oauthLoopback';
import { t } from '../../src/shared/copy/t';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { ConnectionRow } from '../../src/shared/types';
import { FAKE_CLIENT, FAKE_EMAIL, FakeGoogle, type FakeGoogleOptions } from '../fakes/connectors/google-oauth';

const NOW = 1_760_600_000_000;

/** GET the loopback the way the browser does after Google's consent screen. */
function hit(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('M8 T2 · loopback listener (08-3 §16.1, §16.1.1)', () => {
  it('serves one request on 127.0.0.1, port ≥ 49152, path /oauth2/callback; the code comes back; the page has no script', async () => {
    const lb = await openLoopback({ state: 'S1' });
    expect(lb.port).toBeGreaterThanOrEqual(49152);
    expect(lb.redirectUri).toBe(`http://127.0.0.1:${lb.port}/oauth2/callback`);
    const page = await hit(`${lb.redirectUri}?state=S1&code=C1`);
    expect(page.status).toBe(200);
    expect(page.body).toContain('<title>foo</title>');
    expect(page.body).toContain(t('app.signin_page.connected'));
    expect(page.body).not.toMatch(/<script/i);
    expect(await lb.result).toEqual({ kind: 'code', code: 'C1' });
    await expect(hit(`${lb.redirectUri}?state=S1&code=C2`)).rejects.toThrow(); // closed after the one request
  });

  it('a wrong state is ignored and logged OAUTH_STATE_MISMATCH; the right one still lands', async () => {
    const logged: string[] = [];
    const lb = await openLoopback({ state: 'S2', log: (e) => logged.push(e) });
    expect((await hit(`${lb.redirectUri}?state=WRONG&code=X`)).status).toBe(400);
    expect(logged).toEqual(['OAUTH_STATE_MISMATCH']);
    await hit(`${lb.redirectUri}?state=S2&code=C3`);
    expect(await lb.result).toEqual({ kind: 'code', code: 'C3' });
  });

  it('error=access_denied → the "Nothing was connected" page and denied', async () => {
    const lb = await openLoopback({ state: 'S3' });
    const page = await hit(`${lb.redirectUri}?state=S3&error=access_denied`);
    expect(page.body).toContain(t('app.signin_page.denied'));
    expect(await lb.result).toEqual({ kind: 'denied' });
  });

  it('closes after the time limit with timeout', async () => {
    const lb = await openLoopback({ state: 'S4', ttlMs: 30 });
    expect(await lb.result).toEqual({ kind: 'timeout' });
  });

  it('the page reads its colours from the 02 tokens, both themes', () => {
    expect(loopbackPage('ok')).toMatch(/prefers-color-scheme: dark/);
  });
});

describe('M8 T2 · status machine (pack §4.1)', () => {
  it('follows the table', () => {
    expect(nextStatus(null, 'connect')).toBe('connecting');
    expect(nextStatus('connecting', 'granted')).toBe('connected');
    expect(nextStatus('connecting', 'denied')).toBe('disconnected');
    expect(nextStatus('connected', 'expired')).toBe('needs_signin');
    expect(nextStatus('needs_signin', 'connect')).toBe('connecting');
    expect(nextStatus('connecting', 'app_start')).toBe('disconnected');
    expect(nextStatus('connected', 'app_start')).toBeNull();
  });
});

describe('M8 T2 · client file (08-3 §16.1.1)', () => {
  it('reads the spec shape and Google’s download; anything else is missing', () => {
    expect(parseGoogleClient(FAKE_CLIENT)).toEqual({ clientId: FAKE_CLIENT.clientId, clientSecret: FAKE_CLIENT.clientSecret });
    expect(parseGoogleClient({ installed: { client_id: 'a', client_secret: 'b' } })).toEqual({ clientId: 'a', clientSecret: 'b' });
    expect(parseGoogleClient({ clientId: '' })).toBeNull();
    expect(loadGoogleClient(join(tmpdir(), 'no-such-google-oauth.json'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------- service
let db: Db;
let fake: FakeGoogle;
let tokens: MemoryConnTokenStore;
let emitted: ConnectionRow[];
let cmds: ConnectionCmd[];
let opened: string[];
let loopbacks: Loopback[];
let online: boolean;
let svc: GoogleConnections;

function make(opts: FakeGoogleOptions = {}, client: typeof FAKE_CLIENT | null = FAKE_CLIENT) {
  fake = new FakeGoogle(opts);
  svc = new GoogleConnections({
    db,
    now: () => NOW,
    http: fake.fetch,
    endpoints: googleEndpoints({}),
    tokens,
    client: () => (client ? { clientId: client.clientId, clientSecret: client.clientSecret } : null),
    online: () => online,
    openLoopback: async (state) => {
      const lb = await openLoopback({ state, ttlMs: 2_000 });
      loopbacks.push(lb);
      return lb;
    },
    openExternal: async (url) => void opened.push(url),
    emit: (row) => void emitted.push(row),
    engineCmd: (c) => void cmds.push(c),
    dataDir: mkdtempSync(join(tmpdir(), 'foo-m8-')),
  });
}

const rows = () =>
  db.prepare('SELECT app, status, account_label, granted, last_error_kind, vault_name FROM connections ORDER BY app').all() as {
    app: string;
    status: string;
    account_label: string;
    granted: string;
    last_error_kind: string | null;
    vault_name: string;
  }[];
const activity = () => db.prepare('SELECT kind, event, summary FROM activity ORDER BY rowid').all();

/** Lets the browser come back: the test plays Google's redirect to the loopback with the fake code. */
async function signIn(scopes?: GoogleApp[], query = 'code=fake-code') {
  const r = await svc.connect(scopes);
  expect(r.ok).toBe(true);
  const url = new URL(opened.at(-1)!);
  const lb = loopbacks.at(-1)!;
  await hit(`${lb.redirectUri}?state=${url.searchParams.get('state')}&${query}`);
  await lb.result;
  await new Promise((res) => setTimeout(res, 20));
  return r;
}

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db, 'src/main/store/migrations');
  tokens = new MemoryConnTokenStore();
  emitted = [];
  cmds = [];
  opened = [];
  loopbacks = [];
  online = true;
  make();
});

describe('M8 T2 · connection:connect (08-1 §3.2, 08-3 §16.1)', () => {
  it('returns connecting at once (first row gmail), opens accounts.google.com, one connection.cmd', async () => {
    const r = await svc.connect(undefined);
    expect(r.ok && r.value.status).toBe('connecting');
    const gmail = db.prepare("SELECT id FROM connections WHERE app = 'gmail'").get() as { id: string };
    expect(r.ok && r.value.connectionId).toBe(gmail.id);
    expect(new URL(opened[0]!).host).toBe('accounts.google.com');
    expect(cmds).toEqual([{ target: 'google', cmd: 'connect', scopes: ['gmail', 'gcal', 'contacts'] }]);
    expect(rows().map((x) => x.status)).toEqual(['connecting', 'connecting', 'connecting']);
    expect(emitted.map((e) => e.status)).toEqual(['connecting', 'connecting', 'connecting']);
    loopbacks[0]!.close();
  });

  it('sign-in, engine side: the browser returns → three connected rows sharing the vault name, masked address, token stored', async () => {
    await signIn();
    expect(rows()).toEqual(
      ['contacts', 'gcal', 'gmail'].map((app) => ({
        app,
        status: 'connected',
        account_label: 'v***@example.com',
        granted: JSON.stringify({ read: true, draft: true, send: true, calendarWrite: true, contactsRead: true }),
        last_error_kind: null,
        vault_name: 'foo/conn_token/google',
      })),
    );
    expect((await tokens.read('foo/conn_token/google'))?.refresh_token).toBe('fake-refresh-1');
    expect(emitted.at(-1)!.status).toBe('connected');
    expect(svc.access().email()).toBe(FAKE_EMAIL);
    expect(activity()).toEqual(
      ['Gmail', 'Calendar', 'Contacts'].map((app) => ({
        kind: 'connected',
        event: 'connected',
        summary: t('activity.summary.connected', { app, account: 'v***@example.com' }),
      })),
    );
    expect(t('activity.summary.connected', { app: 'Gmail', account: 'v***@example.com' })).toBe('Connected Gmail (v***@example.com)');
  });

  it('a partial grant keeps the rows connected with the missing flag false (Calendar "Not allowed yet")', async () => {
    make({ scope: 'openid https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose' });
    await signIn();
    const gcal = rows().find((x) => x.app === 'gcal')!;
    expect(gcal.status).toBe('connected');
    expect(JSON.parse(gcal.granted).calendarWrite).toBe(false);
    expect(activity()).toHaveLength(1); // only Gmail was actually allowed
  });

  it('no refresh_token → OAUTH_DENIED on the rows (card: "Google didn\'t let me stay connected.")', async () => {
    make({ noRefreshToken: true });
    await signIn();
    expect(rows().map((x) => [x.status, x.last_error_kind])).toEqual(Array(3).fill(['disconnected', 'OAUTH_DENIED']));
    expect(await tokens.read('foo/conn_token/google')).toBeNull();
  });

  it('denied in the browser → OAUTH_DENIED; time limit → OAUTH_TIMEOUT', async () => {
    await signIn(undefined, 'error=access_denied');
    expect(rows()[0]!.last_error_kind).toBe('OAUTH_DENIED');
    await svc.connect(undefined);
    await loopbacks.at(-1)!.result; // 2 s test limit
    await new Promise((res) => setTimeout(res, 20));
    expect(rows().map((x) => [x.status, x.last_error_kind])).toEqual(Array(3).fill(['disconnected', 'OAUTH_TIMEOUT']));
  }, 10_000);

  it('incremental consent for the same account replaces the token without revoking the grant or re-announcing apps', async () => {
    await signIn();
    await signIn(['gmail']);
    expect(fake.revoked).toEqual([]);
    expect(rows().map((x) => x.status)).toEqual(['connected', 'connected', 'connected']);
    expect(activity()).toHaveLength(3);
  });

  it('a failed incremental consent leaves the connected rows connected', async () => {
    await signIn();
    await signIn(['gcal'], 'error=access_denied');
    expect(rows().map((x) => x.status)).toEqual(['connected', 'connected', 'connected']);
    expect(rows().find((x) => x.app === 'gcal')!.last_error_kind).toBe('OAUTH_DENIED');
  });

  it('missing client file → refused; offline → NET_OFFLINE; nothing opened', async () => {
    make({}, null);
    expect(svc.available()).toBe(false);
    expect(await svc.connect(undefined)).toEqual({ ok: false, error: { kind: 'VALIDATION', message: 'google_unavailable' } });
    make();
    online = false;
    expect(await svc.connect(undefined)).toEqual({ ok: false, error: { kind: 'NET_OFFLINE' } });
    expect(opened).toEqual([]);
  });
});

describe('M8 T2 · tokens on the rows (08-3 §16.1 Tokens, §21.2)', () => {
  it('invalid_grant → all three rows needs_signin with CONN_EXPIRED; Reconnect is select_account + login_hint', async () => {
    await signIn();
    fake.opts.refresh = 'expired';
    await expect(svc.access().accessToken()).rejects.toMatchObject({ kind: 'CONN_EXPIRED' });
    expect(rows().map((x) => [x.status, x.last_error_kind])).toEqual(Array(3).fill(['needs_signin', 'CONN_EXPIRED']));
    await svc.connect(['gmail']);
    const u = new URL(opened.at(-1)!);
    expect(u.searchParams.get('prompt')).toBe('select_account');
    expect(u.searchParams.get('login_hint')).toBe(FAKE_EMAIL);
    expect(cmds.at(-1)!.cmd).toBe('reconnect');
    loopbacks.at(-1)!.close();
  });

  it('403 scope refusal → that flag false on the rows, connection:upsert emitted', async () => {
    await signIn();
    const before = emitted.length;
    await svc.access().scopeMissing('calendarWrite');
    expect(JSON.parse(rows()[1]!.granted).calendarWrite).toBe(false);
    expect(emitted.length).toBe(before + 3);
  });

  it('startup: every connecting row becomes disconnected', async () => {
    await svc.connect(undefined);
    loopbacks[0]!.close();
    svc.startup();
    expect(rows().map((x) => x.status)).toEqual(['disconnected', 'disconnected', 'disconnected']);
  });
});

describe('M8 T2 · Disconnect Google (C-10)', () => {
  it('revokes the token, deletes the three rows and contacts_index, emits them gone, logs "Disconnected Google"', async () => {
    await signIn();
    const contacts = db.prepare("SELECT id FROM connections WHERE app = 'contacts'").get() as { id: string };
    db.prepare("INSERT INTO contacts_index (id, connection_id, display_name, synced_at) VALUES ('people/c1', ?, 'Asha', ?)").run(
      contacts.id,
      NOW,
    );
    const gmail = db.prepare("SELECT id FROM connections WHERE app = 'gmail'").get() as { id: string };
    expect(await svc.disconnect(gmail.id)).toEqual({ ok: true, value: undefined });
    expect(rows()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) FROM contacts_index').pluck().get()).toBe(0);
    expect(fake.revoked).toEqual(['fake-refresh-1']);
    expect(await tokens.read('foo/conn_token/google')).toBeNull();
    expect(emitted.slice(-3).map((e) => e.status)).toEqual(['disconnected', 'disconnected', 'disconnected']);
    expect(activity().at(-1)).toEqual({ kind: 'connected', event: 'disconnected', summary: 'Disconnected Google' });
    expect(cmds.at(-1)).toEqual({ target: 'google', cmd: 'disconnect', connectionId: gmail.id });
    // after Disconnect no Google request is possible (the access seam has no token and asks nobody)
    const n = fake.requests.length;
    await expect(svc.access().accessToken()).rejects.toMatchObject({ kind: 'CONN_EXPIRED' });
    expect(fake.requests.length).toBe(n);
  });

  it('offline: rows go at once; the revoke happens when back online', async () => {
    await signIn();
    const gmail = db.prepare("SELECT id FROM connections WHERE app = 'gmail'").get() as { id: string };
    online = false;
    await svc.disconnect(gmail.id);
    expect(rows()).toEqual([]);
    expect(fake.revoked).toEqual([]);
    online = true;
    await svc.onOnline();
    expect(fake.revoked).toEqual(['fake-refresh-1']);
  });

  it('a WhatsApp row is not Google: refused (C-11 is whatsapp:unlink)', async () => {
    db.prepare(
      "INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at) VALUES ('cn_w', 'whatsapp', '+91 98••• ••210', 'h', '{}', 'connected', 'wa-session', 1)",
    ).run();
    expect(await svc.disconnect('cn_w')).toMatchObject({ ok: false, error: { kind: 'VALIDATION' } });
  });
});

describe('M8 T2 · Calendar / Contacts Turn off / on (08-3 §16.1.2, §16.7; 08-0 §G.4)', () => {
  it('writes setting_changed; Contacts off deletes contacts_index', async () => {
    await signIn();
    const contacts = db.prepare("SELECT id FROM connections WHERE app = 'contacts'").get() as { id: string };
    db.prepare("INSERT INTO contacts_index (id, connection_id, display_name, synced_at) VALUES ('people/c1', ?, 'Asha', ?)").run(
      contacts.id,
      NOW,
    );
    const off = { ...settingsDefaults, connections: { ...settingsDefaults.connections, google: { calendarOn: false, contactsOn: false } } };
    svc.settingsChanged(settingsDefaults, off);
    expect(db.prepare('SELECT COUNT(*) FROM contacts_index').pluck().get()).toBe(0);
    expect(activity().slice(-2)).toEqual([
      { kind: 'changed', event: 'setting_changed', summary: 'Changed Calendar to off' },
      { kind: 'changed', event: 'setting_changed', summary: 'Changed Contacts to off' },
    ]);
  });
});
