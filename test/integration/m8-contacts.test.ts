// Spec: AT-145 engine part (two "Priya" → two masked hits for "Which Priya?"; one → used; none and no mail or chat → someone
// new), 08-3 §16.7 (contacts sync replaces contacts_index wholesale; contacts_fts finds names; searchContacts on a miss),
// 08-0 §G.12 (contacts_index + contacts_fts DDL, tokenchars '@._-+'), 08-1 §2.4.1 (the engine writes through db.tx and reads
// through a named query). Real SQLite through main's EngineBridge; fake People API.
// M8 T6: AT-145 Choice part through `gmail.draft` (08-2 §8.2; 08-3 §16.7 Use): two "Priya" → Choice card "Which Priya?" with
// masked addresses and the pick drafts to that person; one → the draft uses it; none → someone new (the full Approval).
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import type { MainLink } from '../../src/engine/protocol';
import type { Result } from '../../src/shared/errors';
import { RateLimiter } from '../../src/engine/tools/connectors/limiter';
import { ContactsSync, createPeople, findPerson, linkContactsStore } from '../../src/engine/tools/connectors/contacts';
import { makeHarness, type Harness } from '../unit/m3-engine-helpers';
import { drive, fakeAccess, fakeGoogle } from '../fakes/connectors/gmail-read';
import { fakePeople, peopleState, type FakePeopleState } from '../fakes/connectors/contacts';
import { createGmail } from '../../src/engine/tools/connectors/gmail';
import { gmailDraftTool } from '../../src/engine/tools/connectors/gmailDraftTool';
import { fakeGmailRead, gmailState } from '../fakes/connectors/gmail-read';

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

// M8 T6
describe('AT-145 · Choice part (gmail.draft resolves the person)', () => {
  function tool(t: ReturnType<typeof setup>) {
    const made: unknown[] = [];
    const mail = gmailState();
    const g = fakeGoogle([fakeGmailRead(mail)], () => t.clock.now());
    const gmail = createGmail({ http: g.fetch, access: fakeAccess().access, clock: t.clock, limiter: new RateLimiter(t.clock) });
    const link: MainLink = {
      async request<T>(kind: string, payload: unknown): Promise<Result<T>> {
        if (kind !== 'draft.create') throw new Error(kind);
        made.push(payload);
        return { ok: true, value: { approvalId: 'ap_1', cardId: 'cd_1', nonce: 'n' } as T };
      },
      send: () => undefined,
    };
    const def = gmailDraftTool({ link, gmail, find: t.deps });
    const ctx = { jobId: 'job_1', signal: new AbortController().signal, now: 0 };
    const run = (to: string) => drive(def.run({ to: [to], subject: 'Photos', body: 'Here they are.' }, ctx), t.clock);
    return { def, made, run };
  }

  it('two "Priya" → a Choice card "Which Priya?" with masked addresses; the pick drafts to that Priya', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    const x = tool(t);
    expect(x.def).toMatchObject({
      actionClass: 'prepare',
      description: 'Write an email draft for the user to review. Nothing is sent until the user taps Send.',
    });
    const asked = await x.run('Priya');
    if (asked.kind !== 'needs_user') throw new Error(`expected needs_user, got ${asked.kind}`);
    expect(asked.card).toMatchObject({ type: 'choice', state: 'asking', payload: { purpose: 'job', question: 'Which Priya?' } });
    const options = asked.card.payload.options as { id: string; label: string }[];
    expect(options.map((o) => o.label).sort()).toEqual(['Priya Nair · p•••@example.com', 'Priya Sharma · p•••@example.com']);
    expect(JSON.stringify(asked.card.payload)).not.toContain('priya.nair@');
    expect(x.made).toEqual([]);
    // The answer reaches the AI as its label ("Decisions: Q: Which Priya? → A: …"); the next call names it.
    expect(await x.run('Priya Nair · p•••@example.com')).toMatchObject({ kind: 'ok', result: { drafted: true, to: 'Priya Nair' } });
    expect(x.made).toEqual([
      { jobId: 'job_1', to: { name: 'Priya Nair', address: 'priya.nair@example.com' }, subject: 'Photos', body: 'Here they are.' },
    ]);
  });

  it('one match → the draft uses that person (not someone new)', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    const x = tool(t);
    await x.run('Rakesh');
    expect(x.made).toEqual([
      { jobId: 'job_1', to: { name: 'Rakesh Kumar', address: 'rakesh@example.com' }, subject: 'Photos', body: 'Here they are.' },
    ]);
  });

  it('an address the AI gives that only looks like a contact’s is someone new, never that contact', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    expect(await drive(findPerson('rakesh@example.co', t.deps), t.clock)).toMatchObject({ match: 'one', hits: [{ id: 'people/c3' }] });
    const x = tool(t);
    await x.run('rakesh@example.co');
    expect(x.made).toEqual([
      {
        jobId: 'job_1',
        to: { name: 'rakesh@example.co', address: 'rakesh@example.co' },
        isNew: true,
        subject: 'Photos',
        body: 'Here they are.',
      },
    ]);
    // The contact's own address, in any case, is that contact.
    await x.run('Rakesh@Example.com');
    expect(x.made[1]).toEqual({
      jobId: 'job_1',
      to: { name: 'Rakesh Kumar', address: 'rakesh@example.com' },
      subject: 'Photos',
      body: 'Here they are.',
    });
  });

  it('no match and no sent mail or chat → someone new (the draft opens the full Approval); a bare name with no address is NOT_FOUND', async () => {
    const t = setup();
    await drive(t.sync.syncNow(), t.clock);
    const x = tool(t);
    await x.run('zoya@example.com');
    expect(x.made).toEqual([
      {
        jobId: 'job_1',
        to: { name: 'zoya@example.com', address: 'zoya@example.com' },
        isNew: true,
        subject: 'Photos',
        body: 'Here they are.',
      },
    ]);
    expect(await x.run('Zoya')).toEqual({ kind: 'error', errorKind: 'NOT_FOUND' });
    expect(x.made).toHaveLength(1);
  });
});
