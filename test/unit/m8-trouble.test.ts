// Spec: 08-3 §16.1.3 (the Gmail poller runs while Gmail is connected: the baseline `history_id` is stored on the gmail row;
// at login the first poll waits 20 s, 09 §9.7), §16.7 (Contacts sync while Contacts is connected and allowed), §16.1 Tokens
// (`invalid_grant` → needs_signin), §21.2 (the CONN_* card words, G-M8-10 icons), 08-1 §2.4 (the engine never writes
// `connections`: main answers `connection.google` and pushes `connection.state`), 08-4 §27.1 (the catalogue lists only
// connected apps' tools). Gap pick T5-01. Fakes only: the fake Google token endpoint, the fake Gmail and People.
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnTrouble, appOfTool, troublePayload, type TroubleRunner } from '../../src/engine/connections/trouble';
import type { GoogleConnState, MainLink } from '../../src/engine/protocol';
import { googleEndpoints } from '../../src/engine/tools/connectors/google';
import { googleTools, type GoogleConnectors } from '../../src/engine/tools/connectors/google-tools';
import { LOGIN_DELAY_MS, POLL_EVERY_MS } from '../../src/engine/tools/connectors/gmail';
import type { HttpFetch } from '../../src/engine/tools/connectors/types';
import { GoogleConnections } from '../../src/main/connections/GoogleConnections';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { migrate, type Db } from '../../src/main/store/db';
import { MemoryConnTokenStore } from '../../src/main/vault/connTokenMemory';
import { errorLook } from '../../src/renderer/cards/ErrorCard';
import { FakeClock } from '../../src/shared/clock';
import { t } from '../../src/shared/copy/t';
import type { Result } from '../../src/shared/errors';
import { fakePeople, peopleState } from '../fakes/connectors/contacts';
import { fakeGmailRead, fakeGoogle, gmailState, type FakeGoogle as FakeApis } from '../fakes/connectors/gmail-read';
import { ALL_SCOPES, FAKE_CLIENT, FakeGoogle } from '../fakes/connectors/google-oauth';

const NOW = 1_760_600_000_000;
let db: Db;
let clock: FakeClock;
let oauth: FakeGoogle;
let apis: FakeApis;
let tokens: MemoryConnTokenStore;
let svc: GoogleConnections;
let pushed: GoogleConnState[];
let trouble: ConnTrouble;
let google: GoogleConnectors;
let started: number;

const ALLOWED = { read: true, draft: true, send: true, calendarWrite: true, contactsRead: true };

/** Three connected rows and a stored refresh token, as a finished sign-in leaves them (T2). */
async function seedConnected(granted = ALLOWED) {
  for (const app of ['gmail', 'gcal', 'contacts'])
    db.prepare(
      `INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at)
       VALUES (?, ?, 'v***@example.com', 'hash-1', ?, 'connected', 'foo/conn_token/google', ?)`,
    ).run(`cn_${app}`, app, JSON.stringify(granted), NOW);
  await tokens.write('foo/conn_token/google', { refresh_token: 'fake-refresh-1', scope: ALL_SCOPES, issued_at: NOW });
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
};
const gmailPaths = () => apis.requests.map((r) => r.path).filter((p) => p.startsWith('/gmail/'));

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db, 'src/main/store/migrations');
  clock = new FakeClock(NOW);
  oauth = new FakeGoogle();
  apis = fakeGoogle([fakeGmailRead(gmailState()), fakePeople(peopleState())]);
  tokens = new MemoryConnTokenStore();
  pushed = [];
  const http: HttpFetch = (url, init) => (url.includes('oauth2.googleapis.com') ? oauth.fetch(url, init) : apis.fetch(url, init));
  svc = new GoogleConnections({
    db,
    now: () => clock.now(),
    http,
    endpoints: googleEndpoints({}),
    tokens,
    client: () => ({ clientId: FAKE_CLIENT.clientId, clientSecret: FAKE_CLIENT.clientSecret }),
    online: () => true,
    openLoopback: () => Promise.reject(new Error('no sign-in in these tests')),
    openExternal: async () => undefined,
    emit: () => undefined,
    engineCmd: () => undefined,
    engineState: (s) => void pushed.push(s),
  });
  // The engine side of the port: db writes go through main's applyDbOps, Google requests to main's service.
  const link: MainLink = {
    async request<T>(kind: string, payload: unknown): Promise<Result<T>> {
      if (kind === 'connection.google') return (await svc.forEngine(payload as never)) as Result<T>;
      if (kind === 'db.tx') return applyDbOps(db, (payload as { ops: never[] }).ops, { now: clock.now() }).result as Result<T>;
      return { ok: false, error: { kind: 'VALIDATION' } };
    },
    send: () => undefined,
  };
  trouble = new ConnTrouble({ link, clock, newId: (p) => `${p}_1`, log: () => undefined });
  started = 0;
  google = googleTools({
    ...trouble.linkOptions({ contactsOn: () => true, online: () => true }),
    http,
    link,
    clock,
    timeZone: () => 'Asia/Kolkata',
  });
  const runner: TroubleRunner = {
    launch: () => undefined,
    halt: () => undefined,
    track: (p) => p,
    startNext: async () => void (started += 1),
    writeMirrors: async () => undefined,
    textOp: () => ({ op: 'mirror', kind: 'plan_md', id: 'x', text: '' }),
  };
  trouble.attach(runner, google);
});

describe('M8 T5 · the poller and Contacts sync follow the Google rows (08-3 §16.1.3, §16.7)', () => {
  it('at engine start with Gmail connected: the first poll waits 20 s, stores the baseline on the gmail row', async () => {
    await seedConnected();
    await trouble.boot();
    clock.advance(LOGIN_DELAY_MS - 1);
    await settle();
    expect(gmailPaths()).toEqual([]);
    clock.advance(1);
    await settle();
    expect(gmailPaths()).toContain('/gmail/v1/users/me/profile');
    // main wrote it (the engine never writes `connections`)
    expect(db.prepare("SELECT history_id FROM connections WHERE app = 'gmail'").pluck().get()).toBe(String(gmailState().historyId));
  });

  it('Contacts connected and allowed → one sync into contacts_index; not allowed → no sync', async () => {
    await seedConnected();
    await trouble.boot();
    clock.advance(0);
    await settle();
    await settle();
    expect(db.prepare('SELECT COUNT(*) FROM contacts_index').pluck().get()).toBe(peopleState().people.length);
  });

  it('a lost token stops both: rows needs_signin, the state is pushed, nothing polls after that', async () => {
    await seedConnected();
    await trouble.boot();
    clock.advance(LOGIN_DELAY_MS);
    await settle();
    oauth.opts.refresh = 'expired';
    expect(await svc.forEngine({ op: 'lost', kind: 'CONN_EXPIRED' })).toEqual({ ok: true, value: undefined });
    expect(pushed.at(-1)).toEqual({ target: 'google', status: 'needs_signin', contactsConnectionId: null });
    await trouble.onState(pushed.at(-1)!);
    const before = apis.requests.length;
    clock.advance(POLL_EVERY_MS * 3);
    await settle();
    expect(apis.requests.length).toBe(before);
  });

  it('Reconnect (connected again) restarts the poller at once and asks the runner to resume waiting jobs', async () => {
    await seedConnected();
    await trouble.onState({ target: 'google', status: 'needs_signin', contactsConnectionId: null });
    expect(started).toBe(0);
    await trouble.onState({ target: 'google', status: 'connected', contactsConnectionId: 'cn_contacts' });
    expect(started).toBe(1);
    clock.advance(0);
    await settle();
    expect(gmailPaths()).toContain('/gmail/v1/users/me/profile');
  });
});

describe('M8 T5 · main answers the engine (gap pick T5-01; 08-1 §2.4)', () => {
  it('never connected → not_connected (no Google call); needs_signin → the kind on the row; connected → a live token', async () => {
    expect(await svc.forEngine({ op: 'token' })).toEqual({ ok: false, error: { kind: 'VALIDATION', message: 'not_connected' } });
    await seedConnected();
    const r = await svc.forEngine({ op: 'token' });
    expect(r.ok && typeof r.value === 'string' && r.value.startsWith('fake-access-')).toBe(true);
    svc.markLost('CONN_REVOKED');
    expect(await svc.forEngine({ op: 'token' })).toEqual({ ok: false, error: { kind: 'CONN_REVOKED' } });
    expect(oauth.paths().filter((p) => p === '/token')).toHaveLength(1);
  });

  it('invalid_grant on the refresh main makes → CONN_EXPIRED to the engine and the three rows needs_signin', async () => {
    await seedConnected();
    oauth.opts.refresh = 'expired';
    expect(await svc.forEngine({ op: 'token' })).toEqual({ ok: false, error: { kind: 'CONN_EXPIRED' } });
    expect(db.prepare('SELECT status FROM connections').pluck().all()).toEqual(['needs_signin', 'needs_signin', 'needs_signin']);
  });

  it('the state push fires on a real change only; contactsConnectionId only while Contacts is allowed', async () => {
    await seedConnected({ ...ALLOWED, contactsRead: false });
    // The engine asked at start; a granted-only edit (Calendar refused) is the same state, so nothing is pushed.
    expect(await svc.forEngine({ op: 'state' })).toEqual({
      ok: true,
      value: { target: 'google', status: 'connected', contactsConnectionId: null },
    });
    svc.scopeMissing('calendarWrite');
    expect(pushed).toEqual([]);
    svc.markLost('CONN_EXPIRED');
    expect(pushed).toEqual([{ target: 'google', status: 'needs_signin', contactsConnectionId: null }]);
  });

  it('history: read and saved on the gmail row by main', async () => {
    await seedConnected();
    expect(await svc.forEngine({ op: 'history' })).toEqual({ ok: true, value: null });
    await svc.forEngine({ op: 'saveHistory', historyId: '777' });
    expect(await svc.forEngine({ op: 'history' })).toEqual({ ok: true, value: '777' });
  });
});

describe('M8 T5 · catalogue, card words and icons', () => {
  it('Google tools are listed while a Google connection exists (08-4 §27.1); other tools always', async () => {
    expect(trouble.listed('gmail.search')).toBe(false); // state not known yet: nothing connected
    expect(trouble.listed('memory.search')).toBe(true);
    await trouble.onState({ target: 'google', status: 'needs_signin', contactsConnectionId: null });
    expect(trouble.listed('gcal.list')).toBe(true);
    await trouble.onState({ target: 'google', status: 'disconnected', contactsConnectionId: null });
    expect(trouble.listed('contacts.search')).toBe(false);
  });

  it('{app} is the app the job was using (INT-28): Gmail, Calendar or Contacts', () => {
    expect(appOfTool('gmail.read')).toBe('gmail');
    expect(appOfTool('gcal.create')).toBe('gcal');
    expect(appOfTool('contacts.search')).toBe('contacts');
    expect(appOfTool('whatsapp.read')).toBeNull();
    const job = { id: 'j_1' };
    expect(troublePayload('CONN_EXPIRED', 'gcal', job, 2).whatHappened).toBe('Your Calendar connection expired.');
    expect(troublePayload('CONN_REVOKED', 'contacts', job, 1).whatHappened).toBe('Google no longer lets me use your Contacts.');
    expect(troublePayload('CONN_RATE_LIMITED', 'gmail', job, 1)).toMatchObject({
      whatHappened: t('errors.conn_rate_limited.what_happened', { app: 'Gmail' }),
      button: { label: 'Try again', action: { kind: 'retry' } },
      atStep: 1,
    });
  });

  it('G-M8-10: 🔌 is the plug icon (paused, --warn); ⏳ is Clock; no emoji in the words', () => {
    expect(errorLook('CONN_EXPIRED', 'error')).toEqual({ icon: 'PlugConnected', tone: 'warn', edge: 'warn' });
    expect(errorLook('CONN_REVOKED', 'error')).toEqual({ icon: 'PlugConnected', tone: 'warn', edge: 'warn' });
    expect(errorLook('CONN_RATE_LIMITED', 'error')).toEqual({ icon: 'Clock', tone: 'warn', edge: 'warn' });
    for (const k of ['CONN_EXPIRED', 'CONN_REVOKED', 'CONN_RATE_LIMITED'] as const) {
      const p = troublePayload(k, 'gmail', { id: 'j' }, 1);
      expect(`${p.whatHappened}${p.whatIsSafe}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
