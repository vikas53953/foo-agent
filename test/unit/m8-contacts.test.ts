// Spec: 08-3 §16.7 (people.connections.list(resourceName='people/me', personFields='names,emailAddresses,phoneNumbers',
// pageSize=1000) until no nextPageToken; ≤ 25,000 rows kept, the rest ignored and logged; synced every 24 h while foo runs
// and on connect; rows replaced wholesale; people.searchContacts on a miss; nothing written to Google; contactsOn=false stops
// sync), 08-2 §8.2 `contacts.search` ({ query; max ≤ 20 } → ContactHit[]; someone new = not in Contacts, not in sent mail,
// not in WhatsApp chats), 08-2 §11.4 (contact details masked in toasts and logs), 08-4 §27.1 description.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import type { ContactHit } from '../../src/shared/types';
import { RateLimiter } from '../../src/engine/tools/connectors/limiter';
import {
  CONTACTS_MAX,
  ContactsSync,
  SYNC_EVERY_MS,
  contactsTools,
  createPeople,
  findPerson,
  maskEmail,
  maskPhone,
  type ContactsStore,
} from '../../src/engine/tools/connectors/contacts';
import type { ContactIndexRow } from '../../src/engine/protocol';
import { drive, fakeAccess, fakeGoogle } from '../fakes/connectors/gmail-read';
import { fakePeople, manyPeople, peopleState, type FakePeopleState } from '../fakes/connectors/contacts';

/** An in-memory store with the same word-prefix match as contacts_fts (the SQL one is covered in the integration test). */
function memoryStore() {
  const rows = new Map<string, ContactIndexRow[]>();
  const store: ContactsStore & { rows: typeof rows; replaced: number } = {
    rows,
    replaced: 0,
    async replace(connectionId, r) {
      store.replaced += 1;
      rows.set(connectionId, r);
    },
    async search(query, max) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return [...rows.values()]
        .flat()
        .filter((r) => words.every((q) => [...r.name.toLowerCase().split(/\s+/), ...r.emails].some((w) => w.startsWith(q))))
        .slice(0, max)
        .map((r): ContactHit => ({ ...r, source: 'google' }));
    },
  };
  return store;
}

function setup(state: FakePeopleState = peopleState()) {
  const clock = new FakeClock();
  const g = fakeGoogle([fakePeople(state)], () => clock.now());
  const people = createPeople({ http: g.fetch, access: fakeAccess().access, clock, limiter: new RateLimiter(clock) });
  const store = memoryStore();
  const logs: string[] = [];
  let enabled = true;
  const sync = new ContactsSync({
    people,
    store,
    clock,
    connectionId: () => 'cn_contacts',
    enabled: () => enabled,
    log: (evt, kind) => logs.push(`${evt} ${kind ?? ''}`),
  });
  return { clock, g, people, store, sync, logs, state, setEnabled: (v: boolean) => (enabled = v) };
}

describe('08-3 §16.7 · contacts sync', () => {
  it('pages people.connections.list at pageSize 1000 until no nextPageToken (2,500 people → 3 pages, all kept)', async () => {
    const t = setup(peopleState({ people: manyPeople(2_500) }));
    await drive(t.sync.syncNow(), t.clock);
    const pages = t.g.requests.filter((r) => r.path === '/v1/people/me/connections');
    expect(pages.map((r) => r.query.pageToken)).toEqual([undefined, '1000', '2000']);
    expect(pages[0]!.query).toMatchObject({ personFields: 'names,emailAddresses,phoneNumbers', pageSize: '1000' });
    expect(t.store.rows.get('cn_contacts')).toHaveLength(2_500);
    expect(t.g.requests.every((r) => r.method === 'GET')).toBe(true); // nothing written to Google
  });

  it('keeps at most 25,000 rows; the rest are ignored and the count logged', async () => {
    const t = setup(peopleState({ people: manyPeople(CONTACTS_MAX + 1_200) }));
    await drive(t.sync.syncNow(), t.clock, 50, 60 * 60_000);
    expect(t.store.rows.get('cn_contacts')).toHaveLength(25_000);
    expect(t.logs).toContain('contacts.sync dropped_1200');
  });

  it('a row keeps name, emails and phones (E.164 from canonicalForm)', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    expect(t.store.rows.get('cn_contacts')![0]).toEqual({
      id: 'people/c1',
      name: 'Priya Sharma',
      emails: ['priya.sharma@example.com'],
      phones: ['+919876543210'],
    });
  });

  it('syncs on start (connect) and then every 24 h; contactsOn=false stops it', async () => {
    const t = setup();
    t.sync.start();
    t.clock.advance(0);
    await drive(Promise.resolve(), t.clock);
    expect(t.store.replaced).toBe(1);
    t.clock.advance(SYNC_EVERY_MS);
    await drive(Promise.resolve(), t.clock);
    expect(t.store.replaced).toBe(2);
    t.setEnabled(false);
    t.clock.advance(SYNC_EVERY_MS);
    await drive(Promise.resolve(), t.clock);
    expect(t.store.replaced).toBe(2);
    t.sync.stop();
  });

  it('a failed sync keeps the old rows', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    t.g.failNext('/v1/people/me/connections', { status: 500 }, { status: 500 }, { status: 500 });
    await drive(t.sync.syncNow(), t.clock);
    expect(t.store.replaced).toBe(1);
    expect(t.store.rows.get('cn_contacts')).toHaveLength(4);
  });
});

describe('08-2 §11.4 · masking', () => {
  it('emails and phones are masked for toasts, logs and the Choice card', () => {
    expect(maskEmail('priya.sharma@example.com')).toBe('p•••@example.com');
    expect(maskPhone('+919876543210')).toBe('+91 98••• ••210');
  });
});

describe('contacts.search ladder (08-2 §8.2)', () => {
  async function ready(o: { sentTo?: string | null; wa?: ContactHit | null; state?: FakePeopleState } = {}) {
    const t = setup(o.state);
    await drive(t.sync.syncNow(), t.clock);
    const deps = {
      people: t.people,
      store: t.store,
      sentMailTo: async () => o.sentTo ?? null,
      whatsappKnows: async () => o.wa ?? null,
      log: (evt: string, kind?: string) => t.logs.push(`${evt} ${kind ?? ''}`),
    };
    const tool = contactsTools(deps)[0]!;
    const run = (args: unknown) => drive(tool.run(args, { jobId: 'j', signal: new AbortController().signal, now: 0 }), t.clock);
    return { ...t, deps, tool, run };
  }

  it('one match → that person', async () => {
    const t = await ready();
    expect(await drive(findPerson('Rakesh', t.deps), t.clock)).toEqual({
      match: 'one',
      hits: [{ id: 'people/c3', name: 'Rakesh Kumar', emails: ['rakesh@example.com'], phones: ['+919876511122'], source: 'google' }],
    });
  });

  it('two matches → both, with masked choice labels for "Which Priya?"', async () => {
    const t = await ready();
    const r = await drive(findPerson('Priya', t.deps), t.clock);
    if (r.match !== 'many') throw new Error(`expected many, got ${r.match}`);
    expect(r.hits.map((h) => h.id)).toEqual(['people/c1', 'people/c2']);
    expect(r.choices).toEqual([
      { id: 'people/c1', label: 'Priya Sharma · p•••@example.com' },
      { id: 'people/c2', label: 'Priya Nair · p•••@example.com' },
    ]);
  });

  it('a miss locally → people.searchContacts finds them', async () => {
    const state = peopleState({
      searchOnly: [{ resourceName: 'people/s1', name: 'Meera Iyer', emails: ['meera@example.com'] }],
    });
    const t = await ready({ state });
    const r = await drive(findPerson('Meera', t.deps), t.clock);
    expect(r).toMatchObject({ match: 'one', hits: [{ id: 'people/s1', name: 'Meera Iyer' }] });
    expect(t.g.requests.some((x) => x.path === '/v1/people:searchContacts' && x.query.query === 'Meera')).toBe(true);
  });

  it('not in Contacts but in sent mail → known (one), not someone new', async () => {
    const t = await ready({ sentTo: 'anil@example.com' });
    expect(await drive(findPerson('Anil', t.deps), t.clock)).toMatchObject({
      match: 'one',
      hits: [{ name: 'Anil', emails: ['anil@example.com'] }],
    });
  });

  it('not in Contacts, sent mail or WhatsApp chats → someone new', async () => {
    const t = await ready();
    expect(await drive(findPerson('Zoya', t.deps), t.clock)).toEqual({ match: 'none', hits: [], someoneNew: true });
  });

  it('logs carry counts only, never a name, address or number', async () => {
    const t = await ready();
    await drive(findPerson('Priya', t.deps), t.clock);
    const text = t.logs.join('\n');
    expect(text).not.toMatch(/priya|@example\.com|98765/i);
  });

  it('the tool: §27.1 line, read class, max ≤ 20, VALIDATION on bad args', async () => {
    const t = await ready();
    expect([t.tool.name, t.tool.actionClass, t.tool.args, t.tool.description]).toEqual([
      'contacts.search',
      'read',
      'query: string, max?: number ≤ 20',
      "Find a person in the user's contacts by name.",
    ]);
    expect(await t.run({ query: 'Priya', max: 21 })).toEqual({ kind: 'error', errorKind: 'VALIDATION' });
    expect(await t.run({ query: 'Priya', max: 1 })).toMatchObject({ kind: 'ok', result: { match: 'many' } });
  });
});
