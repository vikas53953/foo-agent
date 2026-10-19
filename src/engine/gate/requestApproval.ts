// Spec: 08-4 §28.1 (`request_approval` handling, engine, deterministic: money re-read from the evidenced ref with parseInr,
// the AI's numbers discarded, missing ref → APPROVAL_EVIDENCE with "Point to the element that shows the total."; evidence
// quotes verbatim in the redacted result of their tool call of this job; `when` re-read from its quote; recipients verbatim
// in an evidenced result or Contacts, isNew / isGroup computed; siteDomain = the current page's registrable domain;
// irreversible computed; the verb must be in do_verbs, buy = pay, else the read-only branch), 08-2 §9.3 (ApprovalFields),
// §9.4.3 (untrusted origin: a recipient, payee or URL found only in untrusted content), §10.3 (parseInr), X-125 (the AI may
// request book, buy, pay, delete only; a send is a Draft card), CR-0009 G-M5-13 (a request with verb send → repair turn).
// Ports M8 / M9 fill: `readRef` (the latest snapshot's element text), `currentDomain` (the job page), `inContacts`,
// `knownRecipient` (sent mail / an earlier Draft), `parseWhen` (chrono-node in the user's tz). Until then the conservative
// default holds: a value nothing can re-read is not trusted (quote only, isNew = true, when kept only when evidenced).
import { parseInr } from '../../shared/format';
import { ApprovalDraftSchema } from '../../shared/schemas';
import type { ApprovalDraft, ApprovalFields } from '../../shared/types';

/** 08-4 §24.22 part 8 line after an APPROVAL_EVIDENCE rejection (§28.1 item 1). */
export const EVIDENCE_RETRY_LINE = 'Point to the element that shows the total.';

export interface ApprovalSnapshot {
  /** This job's tool results as stored (redacted JSON text), by tool call id. */
  results: ReadonlyMap<string, string>;
  doVerbs: readonly string[];
  timeZone: string;
  /** The user's own words for this job (08-4 §28.3), for the untrusted-origin check. */
  userWords: readonly string[];
  /** This job's results of tools that read what other people wrote (mail, chats; 08-2 §7.2 part 9 untrusted). */
  untrustedResults?: readonly string[];
  readRef?(ref: string): string | null;
  currentDomain?(): string | null;
  inContacts?(address: string): boolean;
  knownRecipient?(address: string): boolean;
  parseWhen?(quote: string, timeZone: string): { start: number; end?: number } | null;
}

export type VerifyResult =
  | { ok: true; draft: ApprovalDraft; untrusted: string[] }
  /**
   * The verb was not asked for: the gate's read-only branch offers it (08-2 §9.4, Art. 3), unless a recipient or URL in it
   * came only from untrusted content (`injected`, §9.4.3): then no card and the injection line.
   */
  | { ok: false; reason: 'not_asked'; verb: ApprovalDraft['verb']; injected: string[] }
  /** A check failed: the turn is rejected; the next step turn carries the retry line; a second → stuck (fail_streak). */
  | { ok: false; reason: 'APPROVAL_EVIDENCE'; why: string };

const AMOUNT = /₹\s?\d[\d,]*(?:\.\d{1,2})?/u;

/** The first ₹ amount in a text, in paise (08-2 §10.3), or null. */
export function amountIn(text: string): number | null {
  const m = AMOUNT.exec(text);
  return m ? parseInr(m[0].replace(/,$/u, '')) : null;
}

/** eTLD+1 for the hosts foo meets (two-part public suffixes such as co.in kept whole). */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./u, '');
  const parts = h.split('.');
  const twoPart = /^(co|org|net|gov|ac|edu|com)\.[a-z]{2}$/u.test(parts.slice(-2).join('.'));
  return parts.slice(twoPart ? -3 : -2).join('.');
}

const fail = (why: string): VerifyResult => ({ ok: false, reason: 'APPROVAL_EVIDENCE', why });

/** 08-4 §28.1 items 1–6. The verified draft goes to GateLogic.decide as a call of its class (item 7). */
export function verifyRequestApproval(raw: unknown, snap: ApprovalSnapshot): VerifyResult {
  const parsed = ApprovalDraftSchema.safeParse(raw);
  if (!parsed.success) return fail('schema');
  const draft = parsed.data as ApprovalDraft;
  const verb = draft.verb;
  // Item 6: buy and pay are interchangeable for this check.
  const asked =
    snap.doVerbs.includes(verb) || ((verb === 'buy' || verb === 'pay') && (snap.doVerbs.includes('buy') || snap.doVerbs.includes('pay')));
  if (!asked) return { ok: false, reason: 'not_asked', verb, injected: untrustedOf(draft.fields, snap, false) };

  // Item 2: every quote verbatim in the redacted result of its tool call of this job.
  for (const e of draft.evidence) {
    const text = snap.results.get(e.toolCallId);
    if (text === undefined || !e.quote || !unescapedIncludes(text, e.quote)) return fail(`quote:${String(e.field)}`);
  }
  const ev = (field: keyof ApprovalFields) => draft.evidence.filter((e) => e.field === field);
  const f: ApprovalFields = { ...draft.fields, verb };

  // Item 1: money from the evidenced ref; the AI's numbers are discarded.
  const money = (field: 'amountPaise' | 'cancelTerms'): number | null | undefined => {
    const e = ev(field).find((x) => x.ref);
    if (!e?.ref) return undefined;
    return amountIn(snap.readRef?.(e.ref) ?? e.quote);
  };
  if (f.amountPaise !== undefined || verb === 'pay' || verb === 'buy') {
    const v = money('amountPaise');
    if (v === undefined || v === null) return fail('amount');
    f.amountPaise = v;
    f.currency = 'INR';
  }
  if (f.lines) {
    const quotes = ev('lines');
    if (quotes.length !== f.lines.length) return fail('lines');
    const lines: { label: string; amountPaise: number }[] = [];
    for (let i = 0; i < f.lines.length; i++) {
      const v = amountIn(snap.readRef?.(quotes[i]!.ref ?? '') ?? quotes[i]!.quote);
      if (v === null) return fail('lines');
      lines.push({ label: f.lines[i]!.label, amountPaise: v });
    }
    f.lines = lines;
  }
  if (f.cancelTerms?.feePaise !== undefined) {
    const v = money('cancelTerms');
    if (v === undefined || v === null) return fail('fee');
    f.cancelTerms = { ...f.cancelTerms, feePaise: v };
  }

  // Item 3: when, re-read from its quote in the user's tz.
  if (f.when) {
    const e = ev('when')[0];
    if (!e) return fail('when');
    if (!snap.parseWhen) {
      // No parser until chrono-node lands (CR-0009 G-M5-32 hand-off): the AI's own time never reaches the card (item 3).
      delete f.when;
    } else {
      const w = snap.parseWhen(e.quote, snap.timeZone);
      if (!w) return fail('when');
      f.when = { ...w, tz: snap.timeZone };
    }
  }

  // Item 4: recipients verbatim in an evidenced result or Contacts; isNew / isGroup are the engine's.
  if (f.recipients) {
    const evidenced = ev('recipients').map((e) => snap.results.get(e.toolCallId) ?? '');
    for (const r of f.recipients) {
      const seen = evidenced.some((t) => unescapedIncludes(t, r.address)) || snap.inContacts?.(r.address) === true;
      if (!seen) return fail('recipient');
    }
    f.recipients = f.recipients.map((r) => ({
      name: r.name,
      address: r.address,
      isNew: !(snap.knownRecipient?.(r.address) ?? false),
      isGroup: /@g\.us$/iu.test(r.address),
      ...(r.groupSize !== undefined ? { groupSize: r.groupSize } : {}),
    }));
  }

  // Item 5: the page's registrable domain; irreversible computed.
  const page = snap.currentDomain?.() ?? null;
  if (page) f.siteDomain = registrableDomain(page);
  else if (f.siteDomain && !draft.evidence.some((e) => unescapedIncludes(snap.results.get(e.toolCallId) ?? '', f.siteDomain!)))
    return fail('site');
  f.irreversible = f.cancelTerms?.refundable === false || verb === 'pay' || verb === 'buy' || verb === 'delete';

  return { ok: true, draft: { verb, fields: f, evidence: draft.evidence }, untrusted: untrustedOf(f, snap, true) };
}

/**
 * 08-2 §9.4.3: a recipient address, payee or URL found in untrusted content (mail, chats) but never in the user's own words.
 * `withPayee` false keeps only recipients and URLs: what the injection line is for; a payee off a web page the AI found is
 * ordinary browsing and gets the Art. 3 offer.
 */
function untrustedOf(f: ApprovalFields, snap: ApprovalSnapshot, withPayee: boolean): string[] {
  const said = snap.userWords.join('\n').toLowerCase();
  const seen = (snap.untrustedResults ?? []).map((t) => t.toLowerCase());
  const values = [
    ...(f.recipients ?? []).map((r) => r.address),
    ...(f.siteDomain ? [f.siteDomain] : []),
    ...(withPayee && f.payee ? [f.payee] : []),
  ];
  return values.filter((v) => !said.includes(v.toLowerCase()) && seen.some((t) => t.includes(v.toLowerCase())));
}

/** Results are stored as JSON text: a quote matches the raw text or its JSON-escaped form. */
function unescapedIncludes(text: string, needle: string): boolean {
  return text.includes(needle) || text.includes(JSON.stringify(needle).slice(1, -1));
}
