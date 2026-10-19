// Spec: 08-2 §8.2 (the Google rows of the tool catalogue: gmail.search, gmail.read, gcal.list, gcal.create, contacts.search),
// 08-3 §16.1 (one Google sign-in serves Gmail, Calendar and Contacts; one rate limit for all calls), §16.1.3 (poller),
// §16.7 (contacts sync), §22.3 (FOO_TEST runs never reach a real service: the FOO_FAKE_GOOGLE base replaces every Google
// host and the token is a fixed fake), CR-0012 (T2 supplies GoogleAccess; T4 only consumes it).
// The engine builds these once; the poller and the sync are started by whoever owns the connection rows (T2 / close-out).
import type { Clock } from '../../../shared/clock';
import { ConnectorHooks } from '../../connectors/hooks';
import type { MainLink } from '../../protocol';
import type { ToolRegistry } from '../ToolLayer';
import { ContactsSync, contactsTools, createPeople, linkContactsStore, type People } from './contacts';
import { createCalendar, gcalTools, type Calendar } from './gcal';
import { GmailPoller, createGmail, gmailTools, type Gmail } from './gmail';
import { GOOGLE_BASES, RateLimiter, type GoogleBases } from './limiter';
import type { ContactHit } from '../../../shared/types';
import type { GoogleAccess, HttpFetch } from './types';

export interface GoogleOptions {
  access: GoogleAccess;
  /** Defaults to the global fetch. */
  http?: HttpFetch;
  /** Defaults to the real Google hosts (GOOGLE_BASES). */
  bases?: Partial<GoogleBases>;
  /** The `contacts` connection row id (T2's rows), or null while Google is not connected. */
  contactsConnectionId?(): string | null;
  /** settings.connections.google.contactsOn. */
  contactsOn?(): boolean;
  /** `connections.history_id` of the gmail row (T2's rows). */
  historyStore?: { load(): Promise<string | null>; save(historyId: string): Promise<void> };
  online?(): boolean;
  /** A WhatsApp chat contact for a name (T3), for the "someone new" check. */
  whatsappKnows?(query: string): Promise<ContactHit | null>;
}

export interface GoogleConnectors {
  tools: ToolRegistry;
  gmail: Gmail;
  calendar: Calendar;
  people: People;
  hooks: ConnectorHooks;
  poller: GmailPoller;
  contactsSync: ContactsSync;
}

/** The address in a To header (`Name <a@b>` → `a@b`); the first one when there are several. */
function firstAddress(to: string): string | null {
  const first = to.split(',')[0]?.trim() ?? '';
  const m = /<([^>]+)>/.exec(first);
  const addr = (m ? m[1]! : first).trim();
  return addr.includes('@') ? addr : null;
}

const realFetch: HttpFetch = (url, init) => fetch(url, init);

export function googleTools(
  o: GoogleOptions & { link: MainLink; clock: Clock; timeZone(): string; log?(evt: string, kind?: string): void },
): GoogleConnectors {
  const bases = { ...GOOGLE_BASES, ...o.bases };
  const call = {
    http: o.http ?? realFetch,
    access: o.access,
    clock: o.clock,
    limiter: new RateLimiter(o.clock),
    ...(o.log ? { log: o.log } : {}),
  };
  const gmail = createGmail({ ...call, base: bases.gmail });
  const calendar = createCalendar({ ...call, base: bases.calendar, timeZone: o.timeZone });
  const people = createPeople({ ...call, base: bases.people });
  const store = linkContactsStore(o.link);
  const hooks = new ConnectorHooks();
  const find = {
    people,
    store,
    sentMailTo: async (query: string) => {
      const [id] = await gmail.list({ q: `in:sent to:"${query.replace(/"/g, '')}"`, maxResults: 1 });
      return id ? firstAddress((await gmail.read(id)).to) : null;
    },
    whatsappKnows: o.whatsappKnows ?? (async () => null),
    ...(o.log ? { log: o.log } : {}),
  };
  const defs = [...gmailTools(gmail), ...gcalTools(calendar), ...contactsTools(find)];
  let saved: string | null = null;
  return {
    tools: Object.fromEntries(defs.map((d) => [d.name, d])),
    gmail,
    calendar,
    people,
    hooks,
    poller: new GmailPoller({
      gmail,
      clock: o.clock,
      hooks,
      store: o.historyStore ?? { load: async () => saved, save: async (h) => void (saved = h) },
      online: o.online ?? (() => true),
      ...(o.log ? { log: o.log } : {}),
    }),
    contactsSync: new ContactsSync({
      people,
      store,
      clock: o.clock,
      connectionId: o.contactsConnectionId ?? (() => null),
      enabled: o.contactsOn ?? (() => true),
      ...(o.log ? { log: o.log } : {}),
    }),
  };
}

/** FOO_TEST only: every Google host is the fake at `base`, and the token is a fixed fake (08-3 §22.3). */
export function testGoogleAccess(base: string): GoogleOptions {
  return {
    access: {
      accessToken: async () => 'fake-token',
      refreshAfter401: async () => 'fake-token',
      scopeMissing: async () => undefined,
      email: () => 'tester@example.com',
    },
    bases: { gmail: base, calendar: base, people: base },
  };
}
