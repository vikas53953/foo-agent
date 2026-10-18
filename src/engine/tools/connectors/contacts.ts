// Spec: 08-3 §16.7 (People API people.connections.list(resourceName='people/me', personFields='names,emailAddresses,
// phoneNumbers', pageSize=1000) until no nextPageToken; ≤ 25,000 rows kept, the rest ignored and logged; synced every 24 h
// while foo runs and on connect, X-124; rows replaced wholesale in contacts_index + contacts_fts; people.searchContacts for a
// miss; nothing written to Google; contactsOn=false stops sync), 08-2 §8.2 `contacts.search` ({ query; max ≤ 20 } →
// ContactHit[], 08-5 §3.3; one match → that person, two or more → Choice "Which {Priya}?" with masked addresses, none →
// someone new = not in Contacts, not in sent mail, not in WhatsApp chats, Art. 5), 08-2 §11.4 (masked in toasts and logs:
// logs here carry counts only), 08-4 §27.1 description. The Choice card itself is the caller's (M5 / T6).
import { z } from 'zod';
import type { Clock, TimerId } from '../../../shared/clock';
import type { ContactHit } from '../../../shared/types';
import type { ContactIndexRow, MainLink } from '../../protocol';
import type { ToolDef } from '../ToolLayer';
import { ConnError, GOOGLE_BASES, connOutcome, googleCall, qs, type GoogleCallDeps } from './limiter';

export const PAGE_SIZE = 1_000;
export const CONTACTS_MAX = 25_000;
export const SEARCH_MAX = 20;
export const SYNC_EVERY_MS = 24 * 60 * 60_000;
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers';

interface RawPerson {
  resourceName?: string;
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
}

function toRow(p: RawPerson): ContactIndexRow | null {
  if (!p.resourceName) return null;
  return {
    id: p.resourceName,
    name: p.names?.[0]?.displayName ?? '',
    emails: (p.emailAddresses ?? []).map((e) => e.value ?? '').filter(Boolean),
    // E.164 when Google gives the canonical form; otherwise the number as typed, spaces removed.
    phones: (p.phoneNumbers ?? []).map((n) => n.canonicalForm ?? (n.value ?? '').replace(/[\s-]/g, '')).filter(Boolean),
  };
}

export interface PeopleDeps extends GoogleCallDeps {
  base?: string;
}
export type People = ReturnType<typeof createPeople>;

export function createPeople(d: PeopleDeps) {
  const base = `${d.base ?? GOOGLE_BASES.people}/v1`;
  return {
    /** Every connection, ≤ 25,000; `dropped` counts the rest. */
    async all(): Promise<{ rows: ContactIndexRow[]; dropped: number }> {
      const rows: ContactIndexRow[] = [];
      let dropped = 0;
      let pageToken: string | undefined;
      do {
        const r = (await googleCall(d, {
          url: `${base}/people/me/connections${qs({ personFields: PERSON_FIELDS, pageSize: PAGE_SIZE, pageToken })}`,
          flag: 'contactsRead',
        })) as { connections?: RawPerson[]; nextPageToken?: string } | null;
        for (const p of r?.connections ?? []) {
          const row = toRow(p);
          if (!row) continue;
          if (rows.length < CONTACTS_MAX) rows.push(row);
          else dropped += 1;
        }
        pageToken = r?.nextPageToken;
      } while (pageToken);
      return { rows, dropped };
    },
    async search(query: string, max: number): Promise<ContactHit[]> {
      const r = (await googleCall(d, {
        url: `${base}/people:searchContacts${qs({ query, readMask: PERSON_FIELDS, pageSize: max })}`,
        flag: 'contactsRead',
      })) as { results?: { person?: RawPerson }[] } | null;
      return (r?.results ?? [])
        .map((x) => (x.person ? toRow(x.person) : null))
        .filter((x): x is ContactIndexRow => x !== null)
        .map((x) => ({ ...x, source: 'google' }));
    },
  };
}

/** contacts_index as the engine sees it (main owns the SQL). */
export interface ContactsStore {
  replace(connectionId: string, rows: ContactIndexRow[], syncedAt: number): Promise<void>;
  search(query: string, max: number): Promise<ContactHit[]>;
}

/** The real store: one db.tx op and one named query over the engine's MainLink. */
export function linkContactsStore(link: MainLink): ContactsStore {
  return {
    async replace(connectionId, rows, syncedAt) {
      const r = await link.request('db.tx', { ops: [{ op: 'contacts_replace', connectionId, rows, syncedAt }] });
      if (!r.ok) throw new ConnError('UNKNOWN');
    },
    async search(query, max) {
      const r = await link.request<ContactHit[]>('db.query', { q: 'contacts.search', args: [query, max] });
      return r.ok ? r.value : [];
    },
  };
}

export interface ContactsSyncDeps {
  people: People;
  store: ContactsStore;
  clock: Clock;
  /** The `contacts` connection row id, or null when Google is not connected. */
  connectionId(): string | null;
  /** settings.connections.google.contactsOn. */
  enabled(): boolean;
  log?(evt: string, kind?: string): void;
}

/** 08-3 §16.7: sync on connect (start) and every 24 h while foo runs. */
export class ContactsSync {
  private timer: TimerId | null = null;
  private busy: Promise<void> | null = null;

  constructor(private d: ContactsSyncDeps) {}

  start(): void {
    this.stop();
    const tick = (ms: number) => {
      this.timer = this.d.clock.setTimeout(() => {
        void this.syncNow().finally(() => tick(SYNC_EVERY_MS));
      }, ms);
    };
    tick(0);
  }

  stop(): void {
    if (this.timer !== null) this.d.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** One sync. Never throws: a failed sync keeps the rows of the last good one. */
  syncNow(): Promise<void> {
    this.busy ??= this.sync()
      .catch((e: unknown) => this.d.log?.('contacts.sync', e instanceof ConnError ? e.kind : 'UNKNOWN'))
      .finally(() => (this.busy = null));
    return this.busy;
  }

  private async sync(): Promise<void> {
    const connectionId = this.d.connectionId();
    if (!connectionId || !this.d.enabled()) return;
    const { rows, dropped } = await this.d.people.all();
    if (dropped > 0) this.d.log?.('contacts.sync', `dropped_${dropped}`);
    await this.d.store.replace(connectionId, rows, this.d.clock.now());
    this.d.log?.('contacts.sync', `rows_${rows.length}`);
  }
}

/** `p•••@example.com` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at <= 0 ? '•••' : `${email[0]}•••${email.slice(at)}`;
}

/** `+91 98••• ••210` (country code, first two and last three digits). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const cc = phone.startsWith('+') && digits.length > 10 ? digits.slice(0, digits.length - 10) : '';
  const rest = digits.slice(cc.length);
  if (rest.length < 5) return '•••';
  return `${cc ? `+${cc} ` : ''}${rest.slice(0, 2)}••• ••${rest.slice(-3)}`;
}

function maskedLabel(h: ContactHit): string {
  const where = h.emails[0] ? maskEmail(h.emails[0]) : h.phones[0] ? maskPhone(h.phones[0]) : '';
  return where ? `${h.name} · ${where}` : h.name;
}

export type PersonMatch =
  | { match: 'one'; hits: [ContactHit] }
  | { match: 'many'; hits: ContactHit[]; choices: { id: string; label: string }[] }
  | { match: 'none'; hits: []; someoneNew: true };

export interface FindPersonDeps {
  people: People;
  store: ContactsStore;
  /** An address the user has sent mail to for this name (Gmail `in:sent`), or null. */
  sentMailTo(query: string): Promise<string | null>;
  /** A WhatsApp chat contact for this name (M8 T3's wa_contacts), or null. */
  whatsappKnows(query: string): Promise<ContactHit | null>;
  log?(evt: string, kind?: string): void;
}

/** 08-2 §8.2 `contacts.search` ladder: Contacts (local, then searchContacts), then sent mail, then WhatsApp chats. */
export async function findPerson(query: string, d: FindPersonDeps, max = SEARCH_MAX): Promise<PersonMatch> {
  // At least two, so "Priya" with two contacts is never read as one.
  const want = Math.max(max, 2);
  let hits = await d.store.search(query, want);
  if (hits.length === 0) hits = await d.people.search(query, want);
  d.log?.('contacts.search', `hits_${hits.length}`);
  if (hits.length === 1) return { match: 'one', hits: [hits[0]!] };
  if (hits.length > 1) {
    const shown = hits.slice(0, Math.max(max, 1));
    return { match: 'many', hits: shown, choices: shown.map((h) => ({ id: h.id, label: maskedLabel(h) })) };
  }
  const sent = await d.sentMailTo(query);
  if (sent) return { match: 'one', hits: [{ id: `sent:${sent}`, name: query, emails: [sent], phones: [], source: 'google' }] };
  const wa = await d.whatsappKnows(query);
  if (wa) return { match: 'one', hits: [wa] };
  return { match: 'none', hits: [], someoneNew: true };
}

const searchArgs = z.object({ query: z.string().min(1).max(200), max: z.number().int().min(1).max(SEARCH_MAX).optional() }).strict();

/** 08-2 §8.2 + 08-4 §27.1. */
export function contactsTools(d: FindPersonDeps): ToolDef[] {
  return [
    {
      name: 'contacts.search',
      actionClass: 'read',
      args: `query: string, max?: number ≤ ${SEARCH_MAX}`,
      description: "Find a person in the user's contacts by name.",
      run: (args) =>
        connOutcome(
          (a) => searchArgs.safeParse(a),
          args,
          async (a) => ({ kind: 'ok', result: await findPerson(a.query, d, a.max) }),
        ),
    },
  ];
}
