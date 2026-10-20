// Spec: 08-3 §22.4 + G-M8-11 (a fake People API: connections.list paging and searchContacts), §16.7 (personFields
// names,emailAddresses,phoneNumbers; pageSize 1000). Made-up people only: example.com addresses, +91 98765 xxxxx numbers.
import type { FakeHandler } from './gmail-read';

export interface FakePerson {
  resourceName: string;
  name: string;
  emails?: string[];
  phones?: string[];
}

export interface FakePeopleState {
  people: FakePerson[];
  /** Extra people only searchContacts finds (not yet in the synced list). */
  searchOnly: FakePerson[];
}

export function peopleState(over: Partial<FakePeopleState> = {}): FakePeopleState {
  return {
    people: [
      { resourceName: 'people/c1', name: 'Priya Sharma', emails: ['priya.sharma@example.com'], phones: ['+91 98765 43210'] },
      { resourceName: 'people/c2', name: 'Priya Nair', emails: ['priya.nair@example.com'] },
      { resourceName: 'people/c3', name: 'Rakesh Kumar', emails: ['rakesh@example.com'], phones: ['+91 98765 11122'] },
      { resourceName: 'people/c4', name: 'Landlord Office', emails: ['office@landlord.example.com'] },
    ],
    searchOnly: [],
    ...over,
  };
}

/** n made-up people, for paging and the 25,000 cap. */
export function manyPeople(n: number): FakePerson[] {
  return Array.from({ length: n }, (_, i) => ({ resourceName: `people/n${i}`, name: `Person ${i}`, emails: [`p${i}@example.com`] }));
}

const toPerson = (p: FakePerson) => ({
  resourceName: p.resourceName,
  names: [{ displayName: p.name }],
  ...(p.emails ? { emailAddresses: p.emails.map((value) => ({ value })) } : {}),
  ...(p.phones ? { phoneNumbers: p.phones.map((value) => ({ value, canonicalForm: value.replace(/\s/g, '') })) } : {}),
});

export function fakePeople(state: FakePeopleState): FakeHandler {
  return ({ method, url }) => {
    if (method !== 'GET') return null;
    const p = url.searchParams;
    if (url.pathname === '/v1/people/me/connections') {
      const size = Number(p.get('pageSize') ?? 100);
      const offset = Number(p.get('pageToken') ?? 0);
      const page = state.people.slice(offset, offset + size);
      const next = offset + size < state.people.length ? String(offset + size) : undefined;
      return {
        status: 200,
        body: { connections: page.map(toPerson), totalPeople: state.people.length, ...(next ? { nextPageToken: next } : {}) },
      };
    }
    if (url.pathname === '/v1/people:searchContacts') {
      const words = (p.get('query') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const hits = [...state.people, ...state.searchOnly]
        .filter((x) =>
          words.every((q) =>
            x.name
              .toLowerCase()
              .split(/\s+/)
              .some((w) => w.startsWith(q)),
          ),
        )
        .slice(0, Number(p.get('pageSize') ?? 10));
      return { status: 200, body: hits.length ? { results: hits.map((x) => ({ person: toPerson(x) })) } : {} };
    }
    return null;
  };
}
