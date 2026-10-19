// Spec: AT-145 engine part (two "Priya" → two masked hits for "Which Priya?"; one → used; none and no mail or chat → someone
// new), 08-3 §16.7 (contacts sync replaces contacts_index wholesale; contacts_fts finds names; searchContacts on a miss),
// 08-0 §G.12 (contacts_index + contacts_fts DDL, tokenchars '@._-+'), 08-1 §2.4.1 (the engine writes through db.tx and reads
// through a named query). Real SQLite through main's EngineBridge; fake People API.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import type { MainLink } from '../../src/engine/protocol';
import type { Result } from '../../src/shared/errors';
import { RateLimiter } from '../../src/engine/tools/connectors/limiter';
import { ContactsSync, createPeople, findPerson, linkContactsStore } from '../../src/engine/tools/connectors/contacts';
import { makeHarness, type Harness } from '../unit/m3-engine-helpers';
import { drive, fakeAccess, fakeGoogle } from '../fakes/connectors/gmail-read';
import { fakePeople, peopleState, type FakePeopleState } from '../fakes/connectors/contacts';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

function setup(state: FakePeopleState = peopleState()) {
  h = makeHarness({ script: [] });
  const x = h;
  x.db
    .prepare(
      `INSERT INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at)
       VALUES ('cn_contacts', 'contacts', 't•••@example.com', 'hash', '{"contactsRead":true}', 'connected', 'foo/conn_token/google', 0)`,
    )
    .run();
  let seq = 0;
  const link: MainLink = {
    async request<T>(kind: 'db.tx' | 'db.query', payload: unknown): Promise<Result<T>> {
      const reply = x.bridge.receive({ id: `t${++seq}`, kind, payload });
      if (!reply) throw new Error('no reply');
      return reply.result as Result<T>;
    },
    send: () => undefined,
  };
  const clock = new FakeClock();
  const g = fakeGoogle([fakePeople(state)], () => clock.now());
  const people = createPeople({ http: g.fetch, access: fakeAccess().access, clock, limiter: new RateLimiter(clock) });
  const store = linkContactsStore(link);
  const sync = new ContactsSync({ people, store, clock, connectionId: () => 'cn_contacts', enabled: () => true });
  const deps = { people, store, sentMailTo: async () => null, whatsappKnows: async () => null };
  const rows = () => x.db.prepare('SELECT * FROM contacts_index ORDER BY id').all() as Record<string, unknown>[];
  return { x, clock, g, state, sync, deps, rows };
}

describe('08-3 §16.7 · contacts sync into SQLite', () => {
  it('fills contacts_index, and a second sync replaces the rows wholesale', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    expect(t.rows().map((r) => [r.id, r.connection_id, r.display_name, r.emails, r.phones])).toEqual([
      ['people/c1', 'cn_contacts', 'Priya Sharma', '["priya.sharma@example.com"]', '["+919876543210"]'],
      ['people/c2', 'cn_contacts', 'Priya Nair', '["priya.nair@example.com"]', '[]'],
      ['people/c3', 'cn_contacts', 'Rakesh Kumar', '["rakesh@example.com"]', '["+919876511122"]'],
      ['people/c4', 'cn_contacts', 'Landlord Office', '["office@landlord.example.com"]', '[]'],
    ]);
    t.state.people = t.state.people.filter((p) => p.resourceName !== 'people/c2');
    await drive(t.sync.syncNow(), t.clock);
    expect(t.rows().map((r) => r.id)).toEqual(['people/c1', 'people/c3', 'people/c4']);
    // contacts_fts follows the table (the deleted row is not found)
    expect(await drive(findPerson('Nair', t.deps), t.clock)).toMatchObject({ match: 'none' });
  });
});

describe('AT-145 · engine part', () => {
  it('two "Priya" → two hits with masked labels for "Which Priya?"', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    const r = await drive(findPerson('Priya', t.deps), t.clock);
    if (r.match !== 'many') throw new Error(`expected many, got ${r.match}`);
    // best first by FTS rank; the order between equal names is not the point here
    expect([...r.choices].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'people/c1', label: 'Priya Sharma · p•••@example.com' },
      { id: 'people/c2', label: 'Priya Nair · p•••@example.com' },
    ]);
    // answered locally: no People search call
    expect(t.g.requests.some((q) => q.path === '/v1/people:searchContacts')).toBe(false);
  });

  it('one match → that person is used (also by email prefix, tokenchars @._-+)', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    expect(await drive(findPerson('Priya Sharma', t.deps), t.clock)).toMatchObject({ match: 'one', hits: [{ id: 'people/c1' }] });
    expect(await drive(findPerson('rakesh@example.com', t.deps), t.clock)).toMatchObject({ match: 'one', hits: [{ id: 'people/c3' }] });
  });

  it('none in Contacts, sent mail or WhatsApp chats → someone new', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    expect(await drive(findPerson('Zoya', t.deps), t.clock)).toEqual({ match: 'none', hits: [], someoneNew: true });
  });

  it('a query with FTS punctuation never breaks the search', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    expect(await drive(findPerson('"Priya" OR *', t.deps), t.clock)).toMatchObject({ match: 'none' });
  });
});
