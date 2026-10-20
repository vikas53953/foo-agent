// Spec: 08-3 §16.4.2 (`whatsapp.draft.to`, text from the AI, is resolved by the engine, never by the AI, in this order: (1) a
// wa_jid already in `wa_messages` or `chats`; (2) an E.164 number or a 10-digit Indian number → `91{10 digits}@s.whatsapp.net`,
// confirmed through `wa.onWhatsApp` — not on WhatsApp → "That number isn't on WhatsApp." and no Send; a bridge that is not
// `open` → "I can't check that number right now." and Send off until it is; (3) a name → exact, then prefix match on
// `wa_contacts.name` and on Google Contacts phones (`contacts_index`, X-48): one match → that person; 0 → Choice "Who is
// {Mom} on WhatsApp?" listing the last 5 chats; ≥ 2 → Choice "Which {Mom}?" with masked numbers. Someone new (Art. 5) = no
// `wa_messages` row in the last 365 days and no wa_contacts / Contacts match → the full Approval card), 08-2 §8.2
// `whatsapp.draft { to: string /* contact or group */; text }` (prepare: a Draft card and its approvals row; groups are
// always the full Approval card, J16), 08-4 §27.1 (its description, exact), 08-3 §16.4 Settings (`draft=false` hides
// WhatsApp drafts). M8 T7. Main makes the Draft (`draft.create`); this file only decides who it goes to.
import { z } from 'zod';
import { t } from '../../../shared/copy/t';
import type { ContactHit } from '../../../shared/types';
import { isGroupJid, maskWaNumber } from '../../../shared/waBridge';
import type { MainLink } from '../../protocol';
import type { ToolDef, ToolOutcome } from '../ToolLayer';
import { connOutcome } from './limiter';

/** Art. 5: someone foo has not messaged for a year is someone new. */
const KNOWN_FOR_MS = 365 * 86_400_000;
// The Choice card holds 4 options (05-1 §5.3: reactions 1️⃣–4️⃣; ChoiceCardSpec max 4), so "the last 5 chats" shows the
// last 4 (logged pick, docs/decisions/M8.tsv).
const OPTION_IDS = ['o1', 'o2', 'o3', 'o4'] as const;

export interface WaRecipient {
  jid: string;
  /** Who the card names: the contact name, the group name, or the masked number. */
  name: string;
  /** What the card says it goes to: the masked number for a person, the group's name for a group. */
  label: string;
  isGroup: boolean;
  isNew: boolean;
  waCheck?: 'not_on' | 'cant_check';
}

export type WaResolution =
  { kind: 'one'; to: WaRecipient } | { kind: 'ask'; question: string; options: { label: string; to: WaRecipient }[] } | { kind: 'none' };

export interface WaRecipientDeps {
  recipient(jid: string): Promise<{ lastAt: number | null; name: string | null; inChats: boolean }>;
  byName(name: string): Promise<{ jid: string; name: string }[]>;
  groupByName(name: string): Promise<{ jid: string; name: string }[]>;
  lastChats(): Promise<{ jid: string; name: string | null }[]>;
  /** Google Contacts (contacts_index), any match on the query; the ladder keeps exact / prefix name matches. */
  contacts(query: string): Promise<ContactHit[]>;
  /** `wa.onWhatsApp`: null while the bridge is not open. */
  check(jid: string): Promise<boolean | null>;
  now(): number;
}

const JID = /^\d{6,20}@s\.whatsapp\.net$|^\d{6,30}(-\d+)?@g\.us$/;

/** (2): an E.164 number ("+44 20 7946 0000") or a 10-digit Indian number ("98765 43210", "098765 43210") → its jid. */
export function numberJid(text: string): string | null {
  const s = text.trim();
  if (!/^[+\d][\d\s\-().]*$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
  const national = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  if (national.length === 10) return `91${national}@s.whatsapp.net`;
  if (national.length === 12 && national.startsWith('91')) return `${national}@s.whatsapp.net`;
  return null;
}

/** A Contacts phone ("+919876543210", "98765 43210") as a WhatsApp jid, or null. */
const phoneJid = (phone: string): string | null => numberJid(phone);

const person = (jid: string, name: string | null, over: Partial<WaRecipient> = {}): WaRecipient => ({
  jid,
  name: name ?? maskWaNumber(jid),
  label: maskWaNumber(jid),
  isGroup: false,
  isNew: false,
  ...over,
});

/** A Contacts person with this number. Phones are stored as Google's E.164 or as typed, one search token each. */
async function byPhone(jid: string, digits: string, d: WaRecipientDeps): Promise<ContactHit | undefined> {
  const national = digits.slice(-10);
  for (const q of [`+${digits}`, national, `0${national}`]) {
    const hit = (await d.contacts(q)).find((c) => c.phones.some((p) => phoneJid(p) === jid));
    if (hit) return hit;
  }
  return undefined;
}

/** The ladder (08-3 §16.4.2). */
export async function resolveWaRecipient(to: string, d: WaRecipientDeps): Promise<WaResolution> {
  const query = to.trim();
  // (1) a jid foo already has.
  if (JID.test(query)) {
    const k = await d.recipient(query);
    if (k.lastAt !== null || k.inChats || k.name) {
      if (isGroupJid(query))
        return { kind: 'one', to: { jid: query, name: k.name ?? query, label: k.name ?? query, isGroup: true, isNew: false } };
      return { kind: 'one', to: person(query, k.name) };
    }
  }
  // (2) a number.
  const fromNumber = JID.test(query) && !isGroupJid(query) ? query : numberJid(query);
  if (fromNumber) {
    const k = await d.recipient(fromNumber);
    const digits = fromNumber.split('@')[0]!;
    const contact = await byPhone(fromNumber, digits, d);
    const known = (k.lastAt !== null && k.lastAt >= d.now() - KNOWN_FOR_MS) || !!k.name || !!contact;
    const exists = await d.check(fromNumber);
    const waCheck = exists === null ? 'cant_check' : exists ? undefined : 'not_on';
    return {
      kind: 'one',
      to: person(fromNumber, k.name ?? contact?.name ?? null, { isNew: !known, ...(waCheck ? { waCheck } : {}) }),
    };
  }
  // (3) a name: exact first, then prefix, over groups, WhatsApp names and Contacts phones.
  const lower = query.toLowerCase();
  const groups = (await d.groupByName(query)).map((g) => ({ jid: g.jid, name: g.name, group: true, contact: false }));
  const wa = (await d.byName(query)).map((c) => ({ jid: c.jid, name: c.name, group: false, contact: false }));
  const hits = await d.contacts(query);
  const fromContacts = (exact: boolean) =>
    hits
      .filter((h) => (exact ? h.name.toLowerCase() === lower : h.name.toLowerCase().startsWith(lower)))
      .flatMap((h) =>
        h.phones
          .map((p) => phoneJid(p))
          .filter((j): j is string => !!j)
          .map((jid) => ({ jid, name: h.name, group: false, contact: true })),
      );
  const isExact = (n: string) => n.toLowerCase() === lower;
  const all = [...groups, ...wa];
  let found = [...all.filter((c) => isExact(c.name)), ...fromContacts(true)];
  if (!found.length) found = [...all, ...fromContacts(false)];
  const unique = [...new Map(found.map((c) => [c.jid, c])).values()];
  const asRecipient = async (c: (typeof unique)[number]): Promise<WaRecipient> => {
    if (c.group) return { jid: c.jid, name: c.name, label: c.name, isGroup: true, isNew: false };
    if (!c.contact) return person(c.jid, c.name);
    // A Contacts number foo never saw on WhatsApp is checked first (§16.4.2 (2)).
    const k = await d.recipient(c.jid);
    if (k.lastAt !== null || k.name) return person(c.jid, c.name);
    const exists = await d.check(c.jid);
    return person(c.jid, c.name, exists === null ? { waCheck: 'cant_check' } : exists ? {} : { waCheck: 'not_on' });
  };
  if (unique.length === 1) return { kind: 'one', to: await asRecipient(unique[0]!) };
  if (unique.length > 1) {
    const options = unique.slice(0, OPTION_IDS.length).map((c) => ({
      label: c.group ? c.name : `${c.name} · ${maskWaNumber(c.jid)}`,
      to: c.group ? { jid: c.jid, name: c.name, label: c.name, isGroup: true, isNew: false } : person(c.jid, c.name),
    }));
    return { kind: 'ask', question: t('cards.choice.question.which_person', { name: query }), options };
  }
  const chats = await d.lastChats();
  if (!chats.length) return { kind: 'none' };
  return {
    kind: 'ask',
    question: t('cards.choice.question.who_on_whatsapp', { name: query }),
    options: chats.slice(0, OPTION_IDS.length).map((c) => {
      const name = c.name ?? maskWaNumber(c.jid);
      return { label: c.name ? `${c.name} · ${maskWaNumber(c.jid)}` : name, to: person(c.jid, name) };
    }),
  };
}

const draftArgs = z
  .object({
    // One chat per draft: the Draft card has one To line (05-2 §5.7).
    to: z.string().min(1).max(200),
    text: z.string().min(1).max(65_536),
  })
  .strict();

/** The engine's db.query reads the ladder needs. */
export function linkWaRecipients(link: MainLink, more: Pick<WaRecipientDeps, 'check' | 'now'>): WaRecipientDeps {
  const q = async <T>(name: string, fallback: T, ...args: unknown[]): Promise<T> => {
    const r = await link.request<T>('db.query', { q: name, args });
    return r.ok ? r.value : fallback;
  };
  return {
    recipient: (jid) => q('wa.recipient', { lastAt: null, name: null, inChats: false }, jid),
    byName: (name) => q('wa.byName', [], name),
    groupByName: (name) => q('wa.groupByName', [], name),
    lastChats: () => q('wa.lastChats', []),
    contacts: (query) => q('contacts.search', [], query, 20),
    ...more,
  };
}

/** `whatsapp.draft`: who it goes to (the ladder), then main's `draft.create`. */
export function whatsappDraftTool(d: { link: MainLink; recipients: WaRecipientDeps; draftsOn(): boolean }): ToolDef {
  // A Choice answer comes back to the AI as its option label (Part 8 "Decisions:"); the next call names it.
  const picks = new Map<string, Map<string, WaRecipient>>();
  return {
    name: 'whatsapp.draft',
    actionClass: 'prepare',
    args: 'to: string (a contact or a group), text: string',
    description: 'Write a WhatsApp message draft for the user to review. Nothing is sent until the user taps Send.',
    run: (args, ctx) =>
      connOutcome(
        (a) => draftArgs.safeParse(a),
        args,
        async (a): Promise<ToolOutcome> => {
          // 08-3 §16.4 Settings: `connections.whatsapp.draft=false` hides WhatsApp drafts.
          if (!d.draftsOn()) return { kind: 'error', errorKind: 'VALIDATION', result: { draftsOff: true } };
          const picked = picks.get(ctx.jobId)?.get(a.to.trim().toLowerCase());
          const r: WaResolution = picked ? { kind: 'one', to: picked } : await resolveWaRecipient(a.to, d.recipients);
          if (r.kind === 'none') return { kind: 'error', errorKind: 'NOT_FOUND' };
          if (r.kind === 'ask') {
            const mine = picks.get(ctx.jobId) ?? new Map<string, WaRecipient>();
            for (const o of r.options) mine.set(o.label.toLowerCase(), o.to);
            picks.set(ctx.jobId, mine);
            return {
              kind: 'needs_user',
              card: {
                type: 'choice',
                state: 'asking',
                payload: {
                  purpose: 'job',
                  question: r.question,
                  options: r.options.map((o, i) => ({ id: OPTION_IDS[i]!, label: o.label })),
                  aiReversible: false,
                  reversible: false,
                  livePrices: false,
                },
              },
            };
          }
          const to = r.to;
          const made = await d.link.request<{ approvalId: string; cardId: string; nonce: string }>('draft.create', {
            jobId: ctx.jobId,
            channel: 'whatsapp',
            to: { name: to.name, address: to.label },
            waJid: to.jid,
            ...(to.isGroup ? { isGroup: true } : {}),
            ...(to.isNew ? { isNew: true } : {}),
            ...(to.waCheck ? { waCheck: to.waCheck } : {}),
            body: a.text,
          });
          if (!made.ok) return { kind: 'error', errorKind: made.error.kind };
          // What the AI sees: the draft waits on the user's tap; it never learns a number it did not give.
          return { kind: 'ok', result: { drafted: true, cardId: made.value.cardId, to: to.name, waitingForSend: true } };
        },
      ),
  };
}
