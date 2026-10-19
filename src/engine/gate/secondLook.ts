// Spec: 08-2 §9.6 (second look, Art. 10: right before every send, book, buy, pay, post, delete, share_personal; ONLY the
// user's own words; A deterministic checks with no AI — amount, recipient address on the outgoing call, the page's
// siteDomain, dates (±0 min for times, same day for dates), party size / quantity — any mismatch → HELD(mismatch); B the AI
// check, invalid twice / timeout / primary unavailable → HELD(cannot_check), fail closed; C the result stored in
// approvals.second_look, pass → RUNNING), §9.4.3 (a recipient seen only in untrusted content MUST be flagged), 08-4 §24.7
// (`{userWords}` one line per statement `[{Fri 16 Oct, 9:12 AM}] {text}` oldest first; `{actionJson}` = the fields without
// `irreversible`), §25.4 (`SecondLookAct`; `ai = { ok: act.match, note }`), §28.3 (empty user words → B skipped,
// HELD no_user_words), §28.4 (extraction; HELD values by F10: "₹14,600", "Sat 17 Oct, 8:00 PM", "4 people",
// "Rakesh (r***@gmail.com)"), §28.6 (`{verbing}` ∈ paying, sending, booking, deleting, sharing).
// implementation-notes M5-T8: A's amount check is the live total, which the fresh-terms check runs (SUPERSEDED, 08-2
// §9.4.2, AT-124), so A has no amount rule here; dates run only with a date parser (chrono-node is not a dependency yet,
// CR-0009 G-M5-32), the AI check covers them until then. Pure apart from `askAi`.
import { formatDate } from '../../shared/format';
import type { SecondLookAct } from '../../shared/schemas';
import type { ApprovalFields, ApprovalPayload, SecondLookResult } from '../../shared/types';
import { latestCount } from './extractCounts';

type Field = NonNullable<SecondLookResult['held']>['field'];
export type Held = NonNullable<ApprovalPayload['held']>;

export interface SecondLookInput {
  /** The approved fields: what the card showed and the user approved. */
  fields: ApprovalFields;
  /** 08-4 §28.3, oldest first. */
  userWords: { at: number; text: string }[];
  timeZone: string;
  now: number;
  /** What the outgoing call carries, read just before it runs (the page's domain, the addresses it sends to). */
  live?: { siteDomain?: string | null; recipients?: string[] };
  /** §9.4.3: values of `fields` found in untrusted content but never in the user's words. */
  untrusted?: readonly string[];
  /** chrono-node in the user's tz (08-4 §28.4): the date or time a statement names, or null. */
  parseWhen?(text: string, timeZone: string): { start: number; hasTime: boolean } | null;
  /** Step B: one valid act, or 'cannot_check' (invalid twice, timeout, primary unavailable; 08-4 §28.5). */
  askAi(prompt: { userWords: string[]; actionJson: string }): Promise<SecondLookAct | 'cannot_check'>;
}

export type SecondLookOutcome =
  { pass: true; result: SecondLookResult; held?: undefined } | { pass: false; result: SecondLookResult; held: Held };

const VERBING: Record<string, string> = {
  pay: 'paying',
  buy: 'paying',
  book: 'booking',
  send: 'sending',
  delete: 'deleting',
  share: 'sharing',
};

/** 08-4 §28.6 `{verbing}` for a verb ("paying" for any verb the list does not name, the J19.1 line's own word). */
export const verbingOf = (verb: string): string => VERBING[verb] ?? 'paying';

/** §28.4 masked address: the first character, then *** up to the @ ("r***@gmail.com"). */
export function maskAddress(address: string): string {
  const at = address.indexOf('@');
  return at > 0 ? `${address[0]}***${address.slice(at)}` : `${address[0] ?? ''}***`;
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

interface Miss {
  field: Field;
  userSaid: string;
  actionHas: string;
}

/** Step A (no AI). The first mismatch decides the HELD values; every one is listed. */
function deterministic(i: SecondLookInput): Miss[] {
  const f = i.fields;
  const texts = i.userWords.map((w) => w.text);
  const out: Miss[] = [];
  const fmt = (ms: number) => formatDate(ms, 'full', { timeZone: f.when?.tz || i.timeZone, now: i.now });

  // Amount: no rule check (M5 T8 review 3). §9.6 A compares the live total, which the fresh-terms check does; a user's
  // "under ₹3,000" must not hold a ₹2,400 booking. The AI step still sees the user's words and the card's total.

  // Recipient: the address on the outgoing call is one of the card's (case-insensitive); untrusted ones are flagged (§9.4.3).
  const cardAddrs = (f.recipients ?? []).map((r) => r.address.toLowerCase());
  const label = (r: { name: string; address: string }) => `${r.name} (${maskAddress(r.address)})`;
  const stray = i.live?.recipients?.find((a) => !cardAddrs.includes(a.toLowerCase()));
  if (stray !== undefined && f.recipients?.[0])
    out.push({ field: 'recipient', userSaid: label(f.recipients[0]), actionHas: maskAddress(stray) });
  else {
    const untrusted = new Set((i.untrusted ?? []).map((v) => v.toLowerCase()));
    const flagged = (f.recipients ?? []).find((r) => untrusted.has(r.address.toLowerCase()));
    if (flagged) out.push({ field: 'recipient', userSaid: flagged.name, actionHas: label(flagged) });
  }

  // Site: the page the submit runs on.
  const page = i.live?.siteDomain;
  if (page && f.siteDomain && page.toLowerCase() !== f.siteDomain.toLowerCase())
    out.push({ field: 'place', userSaid: f.siteDomain, actionHas: page });

  // Dates and times the user stated (latest) against fields.when.
  if (f.when && i.parseWhen) {
    for (let k = texts.length - 1; k >= 0; k--) {
      const w = i.parseWhen(texts[k]!, i.timeZone);
      if (!w) continue;
      const tz = f.when.tz || i.timeZone;
      const sameDay =
        formatDate(w.start, 'date', { timeZone: tz, now: i.now }) === formatDate(f.when.start, 'date', { timeZone: tz, now: i.now });
      const ok = w.hasTime ? Math.floor(w.start / 60_000) === Math.floor(f.when.start / 60_000) : sameDay;
      if (!ok) out.push({ field: w.hasTime ? 'time' : 'date', userSaid: fmt(w.start), actionHas: fmt(f.when.start) });
      break;
    }
  }

  // Party size / quantity.
  if (f.partySize !== undefined) {
    const n = latestCount(texts);
    if (n !== null && n !== f.partySize) out.push({ field: 'people', userSaid: people(n), actionHas: people(f.partySize) });
  }
  return out;
}

/** 08-4 §24.7 `{userWords}` lines and `{actionJson}`. */
export function promptParts(i: Pick<SecondLookInput, 'fields' | 'userWords' | 'timeZone' | 'now'>): {
  userWords: string[];
  actionJson: string;
} {
  const { irreversible: _drop, ...rest } = i.fields;
  void _drop;
  return {
    userWords: i.userWords.map((w) => `[${formatDate(w.at, 'full', { timeZone: i.timeZone, now: i.now })}] ${w.text}`),
    actionJson: JSON.stringify(rest),
  };
}

export async function secondLook(i: SecondLookInput): Promise<SecondLookOutcome> {
  const at = i.now;
  const misses = deterministic(i);
  const det = { ok: misses.length === 0, mismatches: misses.map((m) => m.field) };
  if (misses.length) {
    const m = misses[0]!;
    return {
      pass: false,
      result: { at, deterministic: det, held: { field: m.field, userSaid: m.userSaid, actionHas: m.actionHas } },
      held: { reason: 'mismatch', userSaid: m.userSaid, actionHas: m.actionHas },
    };
  }
  if (!i.userWords.length) return { pass: false, result: { at, deterministic: det }, held: { reason: 'no_user_words' } };
  const act = await i.askAi(promptParts(i));
  if (act === 'cannot_check')
    return { pass: false, result: { at, deterministic: det }, held: { reason: 'cannot_check', verbing: verbingOf(i.fields.verb) } };
  if (act.match) return { pass: true, result: { at, deterministic: det, ai: { ok: true, note: '' } } };
  return {
    pass: false,
    result: {
      at,
      deterministic: det,
      ai: { ok: false, note: `${act.field}: ${act.userSaid} ≠ ${act.actionHas}` },
      held: { field: act.field, userSaid: act.userSaid, actionHas: act.actionHas },
    },
    held: { reason: 'mismatch', userSaid: act.userSaid, actionHas: act.actionHas },
  };
}
