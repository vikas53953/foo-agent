// Spec: 08-0 §G.7 Draft card lifecycle (X-65: the approvals row is made with the draft, PENDING, 60 min; `draft:send` =
// approve once with `approved_via='card'`; on send `undo_until = now + 5 s` → second look → Gmail drafts.send; Change =
// drafts.update, Discard = drafts.delete), 08-1 §3.2 (`draft:update` answers the card with a new nonce and the same PENDING
// approval re-hashed; `draft:send` answers `{ approvalId, undoUntil }`; `draft:undo` TOO_LATE; `draft:discard`;
// `draft:openInApp`), 05-2 §5.7.2 (Undo → a fresh PENDING approval, expiry reset to 60 min, "Not sent. The draft is still
// here."; after the 5 s the undo is refused; To is not editable in the card; Discard → WITHDRAWN "Draft discarded"; No send
// permission → "Open in Gmail"), §5.7.4 (activity `sent_email`: recipient masked, subject, approvalId, proof,
// `approved_how='card_once'`; the body never goes to the activity log), 08-2 §10.4 (write-ahead `submitted_at` before the
// one irreversible call), 06-3 §9.4 ("Sent an email to {name}"). CR-0009 G-M5-12 (fake Gmail drafts).
// M5 T14: 08-2 §9.6 + 08-3 §16.1 (the second look on the card text runs when the 5 s close, before drafts.send; fail
// closed), 05-2 §5.7.2 HELD (held strip + one button per value; the draft's value sends, the user's builds a fresh Draft
// card on the same Gmail draft and the old one is superseded, G-M5-03), CR-0009 G-M5-39 (b).
// M8 T6: 08-3 §16.1 Signature (appended below the body in Gmail, shown apart on the card), §16.1.4 (the Gmail message id and
// thread on the payload; Open in Gmail `#drafts/{messageId}`), CR-0012 G-M8-03 / G-M8-04 (no `gmail.compose`: the draft stays
// in foo, never a Gmail draft; Open in Gmail opens the prefilled compose page; the `allow_send` Connect card once), 05-2
// §5.7.2 "Send, new recipient / group / risky content" (Send opens the full Approval card §5.5 under the draft, the draft
// waits "Waiting for your OK below ›"; that card's tap sends with no 5 s undo, 08-0 §G.7), "Offline at Send" (NET_OFFLINE;
// [ Yes, send when online ] queues it, sent with the undo window once back), Art. 9 (a switch of channel inside an approved
// job asks again).
// M8 T7: WhatsApp and X (05-2 §5.7 variants). WhatsApp: the draft's approvals row as for email; a group or someone new is a
// hard-limit draft whose Send opens the full Approval card "Send this message to {name}?" (§5.5.2, 08-3 §16.4.2); the send
// goes through the engine's queue (≥ 3 s gap) to the bridge, "✓ Sent" on the server's ack, "Proof: Delivered" on the
// delivery ack (`wa_delivered`); ≤ 30 a day (the Send button off with the daily-limit line until local midnight); "That
// number isn't on WhatsApp." (no Send) / "I can't check that number right now." (Send off until the bridge is open again);
// Activity `sent_whatsapp`. X (08-3 §16.3, X-34): no account and no approvals row (posting is a hand-back, foo never posts):
// the weighted length, Change / Discard on the card alone, and "Open in X to post" opens x.com's compose page prefilled
// (`opened_in_app` "Opened in X · not posted by {agentName}", foo's line "It's ready in X…", Activity `opened_x_draft`).
import { t } from '../../shared/copy/t';
import { newId } from '../../shared/ids';
import { newNonce } from '../../shared/canon';
import { fail, ok, type Result } from '../../shared/errors';
import { maskEmail, redactSecrets } from '../../shared/redactor';
import type { ApprovalFields, ApprovalPayload, CardRow, DraftFields, DraftPayload, SecondLookResult } from '../../shared/types';
import { approvalExpiresAt } from '../../shared/approvalMachine';
import { fieldsHash } from '../../engine/gate/fieldsHash';
import { draftPayloadOf } from '../approvals/cardPayloads';
import { cardRow, type DbRow } from '../db/rows';
import type { TechLogEntry } from '../log/techLog';
import { applyDbOps, type TxEffects } from '../engine-supervisor/engineHost';
import type { Db } from '../store/db';
import { errCode } from '../store/rebuild';
import type { ApprovalGate, ApprovalRow, Created } from '../approvals/ApprovalGate';
import type { DraftMessage, GmailDrafts } from './gmailDrafts';
import { localMidnight, WA_DAILY_LIMIT, waSentToday, xIntentUrl, xRemaining } from './channels'; // M8 T7

/** 05-2 §5.7.2 / 08-0 §G.7: the local undo window after Send. */
export const UNDO_MS = 5_000;
/** Gmail's drafts folder: where "Open in Gmail" lands when foo may not send (05-2 §5.7.2 No send permission). */
export const GMAIL_DRAFTS_URL = 'https://mail.google.com/mail/#drafts';

// M8 T6
/**
 * "Open in Gmail": a Gmail draft opens at `?authuser={email}#drafts/{messageId}` (08-3 §16.1.4; `#drafts` when its message id
 * is unknown); a draft kept in foo (no `gmail.compose`, G-M8-04) opens Gmail's compose page prefilled, a hand-back with no proof.
 */
export function gmailUrl(p: DraftPayload, email: string | null): string {
  const user = email ? `authuser=${encodeURIComponent(email)}` : '';
  if (p.gmailDraftId) {
    const at = p.gmailMessageId ? `#drafts/${encodeURIComponent(p.gmailMessageId)}` : '#drafts';
    return `https://mail.google.com/mail/${user ? `?${user}` : ''}${at}`;
  }
  const q = [user, 'view=cm', `to=${encodeURIComponent(p.to?.address ?? '')}`];
  if (p.subject !== undefined) q.push(`su=${encodeURIComponent(p.subject)}`);
  q.push(`body=${encodeURIComponent(p.signature ? `${p.body}\n\n${p.signature}` : p.body)}`);
  return `https://mail.google.com/mail/?${q.filter(Boolean).join('&')}`;
}

type Held = NonNullable<ApprovalPayload['held']>;
/**
 * 08-2 §9.6 second look on the text about to go out (main asks the engine, `draft.secondLook`). `pass: false` holds the
 * Draft with `held` (no `held` → cannot_check: fail closed).
 */
export type SecondLook = (
  a: ApprovalRow,
  out: { content: string; recipients: string[] },
) => Promise<{ pass: boolean; result?: SecondLookResult; held?: Held }>;

export interface DraftDeps {
  db: Db;
  gate: ApprovalGate;
  now(): number;
  /** The Gmail drafts port (M8 connector; FOO_TEST and tests: the in-memory fake). */
  gmail(): GmailDrafts | null;
  /** After a write the gate did not make: main emits the moved rows. */
  changed(effects: TxEffects): void;
  /** M5 T14: required, so no Draft can send without it (Art. 10). */
  secondLook: SecondLook;
  openExternal?(url: string): void | Promise<void>;
  dataDir?: string;
  log?(entry: TechLogEntry): void;
  // M8 T6
  /** The default Gmail send-as signature (08-3 §16.1 Signature), or null. */
  signature?(): Promise<string | null>;
  /** The Gmail row's granted map (08-3 §16.1 Tokens, X-127); absent → everything allowed (M5 fakes). */
  granted?(): { draft: boolean; send: boolean };
  /** The signed-in address (Open in Gmail `authuser`). */
  email?(): string | null;
  /** False while foo is offline (05-2 §5.7.2 Offline at Send). */
  online?(): boolean;
  // M8 T7
  /** The engine's WhatsApp send queue and number check (main asks over the engine port), or null with no engine. */
  whatsapp?(): WaSendPort | null;
  /** settings.locale.timeZone: the daily WhatsApp limit counts from local midnight. */
  timeZone?(): string;
}

// M8 T7
/** What main asks the engine for WhatsApp (08-2 §8.2 `whatsapp.send`, engine-only; 08-3 §16.4.2 the number check). */
export interface WaSendPort {
  send(req: { jid: string; text: string; draftCardId: string }): Promise<Result<{ waMessageId: string }>>;
  check(jid: string): Promise<boolean | null>;
}

export interface DraftInput {
  jobId: string;
  to: { name: string; address: string };
  subject?: string;
  body: string;
  signature?: string;
  /** False when the Gmail connection has no send scope (05-2 §5.7.2 "No send permission"). */
  sendAllowed?: boolean;
  // M8 T6
  /** Someone the user has never emailed (08-2 §8.2 contacts ladder): Send opens the full Approval card (05-2 §5.5). */
  isNew?: boolean;
  /** Art. 9: an email inside a job that already has an approved booking or payment is a switch of channel. */
  switched?: boolean;
  /** A reply stays in its Gmail thread (08-3 §16.1.4 "the same thread headers"). */
  threadId?: string;
  inReplyTo?: string;
  // M8 T7
  /** Email unless said: a WhatsApp message (`to.address` is what the card shows: the masked number or the group) or an X post. */
  channel?: DraftPayload['channel'];
  waJid?: string;
  isGroup?: boolean;
  /** The engine's number check said no, or could not ask (08-3 §16.4.2). */
  waCheck?: DraftPayload['waCheck'];
}

interface Tap {
  cardId: string;
  nonce: string;
  resolvedBy: 'tap' | 'keyboard';
}

/** 08-2 §9.3 `contentSummary`: subject + the first 140 characters of the body, redacted. */
const summaryOf = (subject: string | undefined, body: string) =>
  redactSecrets([subject, body.slice(0, 140)].filter(Boolean).join('\n')).text;

function sendFields(to: DraftInput['to'], subject: string | undefined, body: string, isNew = false): ApprovalFields {
  return {
    verb: 'send',
    channel: 'email',
    recipients: [{ name: to.name, address: to.address, isNew, isGroup: false }],
    contentSummary: summaryOf(subject, body),
    irreversible: true,
  };
}

export class DraftService {
  /** Sends in flight (the RUNNING write-ahead already guards a second send; this keeps one tick from overlapping the next). */
  private sending = new Set<string>();
  // M8 T6: cards whose Change → Save is waiting on Gmail.
  private updating = new Set<string>();

  constructor(private readonly d: DraftDeps) {}

  private card(cardId: string): CardRow | null {
    const r = this.d.db.prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(cardId) as DbRow | undefined;
    return r ? cardRow(r) : null;
  }

  /** A Draft (08-0 §G.7): the Gmail draft first, then the card and its PENDING approvals row. */
  async create(input: DraftInput): Promise<Result<Created>> {
    // M8 T7
    if (input.channel === 'x') return this.createX(input);
    if (input.channel === 'whatsapp') return this.createWhatsApp(input);
    const granted = this.d.granted?.() ?? { draft: true, send: true };
    const isNew = input.isNew ?? false;
    const hardLimit = isNew || (input.switched ?? this.switched(input.jobId));
    const base = {
      jobId: input.jobId,
      fields: sendFields(input.to, input.subject, input.body, isNew),
      ...(hardLimit ? { hardLimit } : {}),
    };
    // G-M8-04: no `gmail.compose` → no Gmail draft can exist; the draft stays in foo with "Open in Gmail".
    if (!granted.draft) {
      const made = this.d.gate.createDraft({ ...base, payload: this.payloadOf(input, isNew, undefined, false) });
      if (made.ok) this.offerAllowSend(made.value.cardId);
      return made;
    }
    const gmail = this.d.gmail();
    if (!gmail) return fail('CONN_EXPIRED');
    const signature = input.signature ?? (await this.d.signature?.()) ?? undefined;
    const g = await gmail.create(this.message(input.to.address, input.subject, input.body, signature, input));
    if (!g.ok) return g;
    const made = this.d.gate.createDraft({
      ...base,
      payload: {
        ...this.payloadOf(input, isNew, signature, input.sendAllowed ?? granted.send),
        gmailDraftId: g.value.gmailDraftId,
        ...(g.value.gmailMessageId ? { gmailMessageId: g.value.gmailMessageId } : {}),
        ...((g.value.threadId ?? input.threadId) ? { threadId: g.value.threadId ?? input.threadId } : {}),
      },
    });
    // No card, no approval: the Gmail draft would be left behind with nothing pointing at it.
    if (!made.ok) await gmail.delete(g.value.gmailDraftId);
    return made;
  }

  // M8 T7
  /** A WhatsApp Draft: its PENDING approvals row as for email; a group or someone new makes it a hard-limit draft. */
  private createWhatsApp(input: DraftInput): Result<Created> {
    const isNew = input.isNew ?? false;
    const isGroup = input.isGroup ?? false;
    if (!input.waJid) return fail('VALIDATION');
    const limit = this.waLimitUntil();
    return this.d.gate.createDraft({
      jobId: input.jobId,
      fields: {
        verb: 'send',
        channel: 'whatsapp',
        recipients: [{ name: input.to.name, address: input.to.address, isNew, isGroup }],
        contentSummary: summaryOf(undefined, input.body),
        irreversible: true,
      },
      ...(isNew || isGroup ? { hardLimit: true } : {}),
      payload: {
        channel: 'whatsapp',
        to: { ...input.to, isNew },
        body: input.body,
        edited: false,
        sendAllowed: true,
        waJid: input.waJid,
        isGroup,
        ...(input.waCheck ? { waCheck: input.waCheck } : {}),
        ...(limit !== null ? { waLimitUntil: limit } : {}),
      },
    });
  }

  /** 08-0 §H.2: at 30 `sent_whatsapp` rows since local midnight, the next local midnight; else null. */
  private waLimitUntil(): number | null {
    const now = this.d.now();
    const tz = this.d.timeZone?.() ?? 'Asia/Kolkata';
    return waSentToday(this.d.db, now, tz) >= WA_DAILY_LIMIT ? localMidnight(now, tz, 1) : null;
  }

  /** An X Draft (08-3 §16.3): a card only. Nothing is ever sent from it, so it has no approvals row and no expiry. */
  private createX(input: DraftInput): Result<Created> {
    const job = this.d.db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(input.jobId) as { chat_id: string } | undefined;
    if (!job) return fail('JOB_GONE');
    const now = this.d.now();
    const cardId = newId('k', now);
    const messageId = newId('m', now);
    const nonce = newNonce();
    const payload: DraftPayload = {
      approvalId: '',
      channel: 'x',
      body: input.body,
      edited: false,
      sendAllowed: true,
      xRemaining: xRemaining(input.body),
    };
    const w = applyDbOps(
      this.d.db,
      [
        {
          op: 'insert',
          table: 'messages',
          row: {
            id: messageId,
            chat_id: job.chat_id,
            author_kind: 'foo',
            kind: 'card',
            card_id: cardId,
            status: 'complete',
            job_id: input.jobId,
            created_at: now,
          },
        },
        {
          op: 'insert',
          table: 'cards',
          row: { id: cardId, chat_id: job.chat_id, message_id: messageId, job_id: input.jobId, type: 'draft', state: 'pending', payload, nonce, created_at: now },
        },
      ],
      this.opts(now),
    );
    if (!w.result.ok) return w.result;
    this.d.changed(w.effects);
    return ok({ approvalId: '', cardId, nonce });
  }

  private opts(now: number) {
    return { now, ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}) };
  }

  /** Writes a Draft card's payload (and its state when given) outside any approval move. */
  private setCard(cardId: string, set: { payload: DraftPayload; state?: string; resolved_by?: string; resolved_at?: number }): boolean {
    const w = applyDbOps(this.d.db, [{ op: 'update', table: 'cards', id: cardId, set }], this.opts(this.d.now()));
    if (w.result.ok) this.d.changed(w.effects);
    return w.result.ok;
  }

  /** The X Draft the renderer holds, still `pending` (X has no approval, so the nonce and the state decide). */
  private xPending(req: { cardId: string; nonce: string }): Result<{ card: CardRow; p: DraftPayload }> | null {
    const card = this.card(req.cardId);
    const p = card ? draftPayloadOf(card) : null;
    if (!card || p?.channel !== 'x') return null;
    if (card.nonce !== req.nonce || card.state !== 'pending') return fail('CARD_STALE');
    return ok({ card, p });
  }

  /**
   * WhatsApp: delivery ack ≥ 2 for a sent Draft (08-3 §16.4 proof `wa_delivered`): the card shows "Proof: Delivered" and the
   * approvals row (and the full Approval card's, when one was opened) keeps the proof. Returns false when no Draft sent it.
   */
  waDelivered(waMessageId: string): boolean {
    const r = this.d.db
      .prepare(`SELECT * FROM cards WHERE type = 'draft' AND json_extract(payload, '$.sentMessageId') = ? LIMIT 1`)
      .get(waMessageId) as DbRow | undefined;
    const card = r ? cardRow(r) : null;
    const p = card ? draftPayloadOf(card) : null;
    if (!card || !p || p.channel !== 'whatsapp' || p.delivered) return false;
    const proof = JSON.stringify({ kind: 'wa_delivered', waMessageId });
    const full = p.approvalCardId ? this.d.gate.byCard(p.approvalCardId) : null;
    this.d.db.transaction(() => {
      this.d.db.prepare('UPDATE approvals SET proof = ? WHERE id = ?').run(proof, p.approvalId);
      if (full) this.d.db.prepare('UPDATE approvals SET proof = ? WHERE id = ?').run(proof, full.id);
      this.setCard(card.id, { payload: { ...p, delivered: true } });
    })();
    return true;
  }

  /** The bridge is open again: the WhatsApp Drafts whose number could not be checked are checked now (08-3 §16.4.2). */
  async waOpen(): Promise<void> {
    const port = this.d.whatsapp?.() ?? null;
    if (!port) return;
    const rows = this.d.db
      .prepare(
        `SELECT * FROM cards WHERE type = 'draft' AND state = 'pending' AND deleted_at IS NULL
           AND json_extract(payload, '$.waCheck') = 'cant_check'`,
      )
      .all() as DbRow[];
    for (const r of rows) {
      const p0 = draftPayloadOf(cardRow(r));
      if (!p0?.waJid) continue;
      const exists = await port.check(p0.waJid);
      if (exists === null) return;
      const card = this.card(String(r.id));
      const p = card ? draftPayloadOf(card) : null;
      if (!card || !p || card.state !== 'pending') continue;
      const { waCheck: _gone, ...rest } = p;
      void _gone;
      this.setCard(card.id, { payload: exists ? rest : { ...rest, waCheck: 'not_on' } });
    }
  }

  /** Local midnight came: Drafts held by the daily limit may send again. */
  private liftWaLimit(): void {
    const rows = this.d.db
      .prepare(
        `SELECT * FROM cards WHERE type = 'draft' AND state = 'pending' AND deleted_at IS NULL
           AND json_extract(payload, '$.waLimitUntil') <= ?`,
      )
      .all(this.d.now()) as DbRow[];
    for (const r of rows) {
      const p = draftPayloadOf(cardRow(r));
      if (!p) continue;
      const { waLimitUntil: _gone, ...rest } = p;
      void _gone;
      this.setCard(String(r.id), { payload: rest });
    }
  }

  // M8 T6
  /**
   * Art. 9: an email inside a job whose approved booking or payment did not go through switches how, so it asks again. A
   * finished booking is not a switch (a follow-up email to a known person is a plain Draft).
   */
  private switched(jobId: string): boolean {
    return !!this.d.db
      .prepare(
        `SELECT 1 FROM approvals WHERE job_id = ? AND verb IN ('book', 'buy', 'pay')
           AND state IN ('APPROVED', 'RUNNING', 'CHECKING', 'FAILED') LIMIT 1`,
      )
      .pluck()
      .get(jobId);
  }

  private payloadOf(
    input: DraftInput,
    isNew: boolean,
    signature: string | undefined,
    sendAllowed: boolean,
  ): Omit<DraftPayload, 'approvalId'> {
    return {
      channel: 'email',
      to: { ...input.to, isNew },
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      body: input.body,
      ...(signature ? { signature } : {}),
      edited: false,
      sendAllowed,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    };
  }

  /** The message Gmail holds: the card text with the signature below it (08-3 §16.1 Signature), in its thread. */
  private message(
    to: string,
    subject: string | undefined,
    body: string,
    signature: string | undefined,
    thread: { threadId?: string | undefined; inReplyTo?: string | undefined },
  ): DraftMessage {
    return {
      to,
      ...(subject !== undefined ? { subject } : {}),
      body: signature ? `${body}\n\n${signature}` : body,
      ...(thread.threadId ? { threadId: thread.threadId } : {}),
      ...(thread.inReplyTo ? { inReplyTo: thread.inReplyTo } : {}),
    };
  }

  /** G-M8-04: the `allow_send` Connect card, once in a chat, under a Draft foo cannot send. */
  private offerAllowSend(draftCardId: string): void {
    const chatId = this.d.db.prepare('SELECT chat_id FROM cards WHERE id = ?').pluck().get(draftCardId) as string | undefined;
    if (!chatId) return;
    const offered = this.d.db
      .prepare("SELECT 1 FROM cards WHERE chat_id = ? AND type = 'connect' AND json_extract(payload, '$.variant') = 'allow_send'")
      .pluck()
      .get(chatId);
    if (offered) return;
    const now = this.d.now();
    const cardId = newId('k', now);
    const messageId = newId('m', now);
    const jobId = this.d.db.prepare('SELECT job_id FROM cards WHERE id = ?').pluck().get(draftCardId) as string | null;
    const w = applyDbOps(
      this.d.db,
      [
        {
          op: 'insert',
          table: 'messages',
          row: {
            id: messageId,
            chat_id: chatId,
            author_kind: 'foo',
            kind: 'card',
            card_id: cardId,
            status: 'complete',
            job_id: jobId,
            created_at: now,
          },
        },
        {
          op: 'insert',
          table: 'cards',
          row: {
            id: cardId,
            chat_id: chatId,
            message_id: messageId,
            job_id: jobId,
            type: 'connect',
            state: 'offered',
            payload: { variant: 'allow_send', app: 'gmail', scopes: ['gmail'] },
            nonce: newNonce(),
            created_at: now,
          },
        },
      ],
      { now, ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}) },
    );
    if (w.result.ok) this.d.changed(w.effects);
  }

  /** The Draft card the renderer holds, still pending and in time (08-1 §3.2 CARD_STALE / CARD_EXPIRED). */
  private pending(req: { cardId: string; nonce: string }): Result<{ card: CardRow; p: DraftPayload; a: ApprovalRow }> {
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'draft') return fail('VALIDATION');
    const a = this.d.gate.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    if (card.nonce !== req.nonce) return fail('CARD_STALE');
    if (a.state === 'EXPIRED' || (a.state === 'PENDING' && this.d.now() >= a.expiresAt)) return fail('CARD_EXPIRED');
    if (a.state !== 'PENDING' || card.state !== 'pending') return fail('CARD_STALE');
    const p = draftPayloadOf(card);
    if (!p) return fail('VALIDATION');
    return ok({ card, p, a });
  }

  /** `draft:send`: approve once (`approved_via='card'`, X-65) and open the 5 s undo window. */
  send(req: Tap): Result<{ approvalId: string; undoUntil: number }> {
    // M8 T7: an X draft is never sent by foo (AT-054); its Primary is "Open in X to post".
    if (this.xPending(req)) return fail('VALIDATION');
    const t = this.pending(req);
    if (!t.ok) return t;
    const { p, a } = t.value;
    if (!p.sendAllowed) return fail('CONN_SCOPE_MISSING');
    // M8 T7 (08-3 §16.4.2, §16.4 Send): no Send for a number that isn't on WhatsApp or can't be checked; at the daily limit
    // the card says so and stays pending (no ErrorKind, no toast).
    if (p.channel === 'whatsapp') {
      if (p.waCheck) return fail('VALIDATION');
      const until = this.waLimitUntil();
      if (until !== null) {
        if (p.waLimitUntil !== until) this.setCard(t.value.card.id, { payload: { ...p, waLimitUntil: until } });
        return fail('VALIDATION');
      }
    }
    // M8 T6 (05-2 §5.7.2 Offline at Send): nothing moves; the card asks "Send it as soon as you're back?".
    if (this.d.online && !this.d.online()) return fail('NET_OFFLINE');
    // M8 T6 (08-0 §G.7): someone new or a switch → the full Approval card is the one tap, with no 5 s undo.
    if (a.hardLimit) return this.askFull(t.value);
    const now = this.d.now();
    const undoUntil = now + UNDO_MS;
    const moved = this.d.gate.draftMove(a.id, 'approve', {
      approval: { approved_at: now, approved_via: 'card', scope: 'once', undo_until: undoUntil },
      card: {
        state: 'undo_window',
        payload: { ...p, undoUntil, undone: false },
        resolved_by: req.resolvedBy,
        resolved_at: now,
        answer: { optionId: 'send' },
      },
    });
    return moved.ok ? ok({ approvalId: a.id, undoUntil }) : moved;
  }

  /** `draft:undo` before `undo_until`: back to a fresh PENDING approval (expiry reset to 60 min) and a new nonce. */
  undo(req: { approvalId: string }): Result<{ undone: boolean }> {
    const a = this.d.gate.get(req.approvalId);
    if (!a) return fail('NOT_FOUND');
    const card = this.card(a.cardId);
    if (!card || card.type !== 'draft') return fail('VALIDATION');
    const now = this.d.now();
    // M8 T6: a Draft queued while offline ("Will send when you're back online" + Cancel) is undone the same way.
    const queued = card.state === 'queued_offline';
    if (a.state !== 'APPROVED' || a.submittedAt !== null || !(queued || (card.state === 'undo_window' && now < (this.undoUntil(a) ?? 0))))
      return fail('TOO_LATE');
    const expiresAt = approvalExpiresAt('send', now);
    const p0 = draftPayloadOf(card);
    if (!p0) return fail('VALIDATION');
    const { undoUntil: _gone, ...p } = p0;
    void _gone;
    // A fresh PENDING approval needs a fresh nonce; both land in one transaction (the gate's move nests as a savepoint).
    const moved = this.d.db.transaction(() => {
      this.rotateNonce(card.id);
      const m = this.d.gate.draftMove(a.id, 'draft_undo', {
        approval: { approved_at: null, approved_via: null, scope: null, undo_until: null, expires_at: expiresAt },
        card: {
          state: 'pending',
          expires_at: expiresAt,
          payload: { ...p, undone: !queued },
          resolved_by: null,
          resolved_at: null,
          answer: null,
        },
      });
      if (!m.ok) throw new DraftAbort(m);
      return m;
    });
    try {
      moved();
    } catch (e) {
      if (e instanceof DraftAbort) return e.result;
      throw e;
    }
    return ok({ undone: true });
  }

  /** A card's nonce is main's alone (08-2 §9.3); the engine's db.tx never writes it, so main sets it directly. */
  private rotateNonce(cardId: string): void {
    this.d.db.prepare('UPDATE cards SET nonce = ? WHERE id = ?').run(newNonce(), cardId);
  }

  private undoUntil(a: ApprovalRow): number | null {
    const v = this.d.db.prepare('SELECT undo_until FROM approvals WHERE id = ?').pluck().get(a.id) as number | null | undefined;
    return v ?? null;
  }

  /**
   * Main's tick (1 s, like the expiry tick): every Draft whose undo window has closed gets its second look, the write-ahead
   * (APPROVED → RUNNING, `submitted_at`), and the one Gmail send. Returns the approvals it sent.
   */
  async tick(): Promise<string[]> {
    // M8 T6: offline, nothing is handed to Gmail (the window waits, then sends once back); online, Drafts queued while
    // offline open their window, including ones queued before a restart (the online event may never come again).
    if (this.d.online && !this.d.online()) return [];
    this.resumeQueued();
    this.unlinkDeadFull();
    this.liftWaLimit(); // M8 T7
    const now = this.d.now();
    const due = this.d.db
      .prepare(
        `SELECT a.id FROM approvals a JOIN cards c ON c.id = a.card_id
         WHERE c.type = 'draft' AND a.state = 'APPROVED' AND a.undo_until IS NOT NULL AND a.undo_until <= ? AND a.submitted_at IS NULL
         ORDER BY a.undo_until, a.id`,
      )
      .pluck()
      .all(now) as string[];
    const out: string[] = [];
    for (const id of due) {
      if (this.sending.has(id)) continue;
      this.sending.add(id);
      try {
        if (await this.sendOne(id, this.pickedAction(id))) out.push(id);
        this.followFull(id);
      } catch (e) {
        // One Draft's failure never stops the others due on this tick.
        this.d.log?.({
          lvl: 'error',
          mod: 'drafts',
          evt: 'DRAFT_SEND_THREW',
          kind: e instanceof Error ? e.name : typeof e,
          ids: { approvalId: id },
        });
      } finally {
        this.sending.delete(id);
      }
    }
    return out;
  }

  /** `confirmed`: the user picked the draft's own value on a HELD card, which is the second look's answer (SM-A4). */
  private async sendOne(approvalId: string, confirmed = false): Promise<boolean> {
    const a0 = this.d.gate.get(approvalId);
    if (!a0 || a0.state !== 'APPROVED') return false;
    const card0 = this.card(a0.cardId);
    const p0 = card0 ? draftPayloadOf(card0) : null;
    if (!p0) return false;
    // M5 T14 (08-2 §9.6, 08-3 §16.1): the second look on the card text, right before the send.
    let look: SecondLookResult | undefined;
    if (!confirmed) {
      const content = redactSecrets([p0.subject, p0.body].filter(Boolean).join('\n')).text;
      const r = await this.d.secondLook(a0, { content, recipients: p0.to ? [p0.to.address] : [] });
      if (!r.pass) {
        this.hold(a0.id, r.held ?? { reason: 'cannot_check', verbing: 'sending' }, r.result);
        return false;
      }
      look = r.result;
    }
    // The look may take seconds: read the row and card again, so a move in between (expiry, a stopped job) wins.
    const a = this.d.gate.get(approvalId);
    const card = this.card(a0.cardId);
    const p = card ? draftPayloadOf(card) : null;
    if (!a || a.state !== 'APPROVED' || !card || !p) return false;
    const gmail = this.d.gmail();
    const now = this.d.now();
    // Write-ahead before the one irreversible call (08-2 §10.4); a crash after this never sends twice.
    const running = this.d.gate.draftMove(a.id, 'submit', {
      approval: { submitted_at: now, ...(look ? { second_look: JSON.stringify(look) } : {}) },
      card: { state: 'sending', payload: { ...p, undoUntil: undefined } },
    });
    if (!running.ok) return false;
    if (p.channel === 'whatsapp') return this.sendWhatsApp(a, card.id, p); // M8 T7
    const r = gmail && p.gmailDraftId ? await gmail.send(p.gmailDraftId, p.to?.address) : fail<{ messageId: string }>('CONN_EXPIRED');
    const at = this.d.now();
    if (!r.ok) {
      this.d.gate.draftMove(a.id, 'submit_failed', { approval: { failure_kind: r.error.kind }, card: { state: 'failed' } });
      this.d.log?.({ lvl: 'warn', mod: 'drafts', evt: r.error.kind, ids: { approvalId: a.id } });
      return false;
    }
    const proof = { kind: 'sent_folder' as const, connectionId: gmail!.connectionId, messageId: r.value.messageId };
    const chatTitle = this.d.db.prepare('SELECT title FROM chats WHERE id = ?').pluck().get(a.chatId) as string | null | undefined;
    const to = p.to ?? { name: '', address: '' };
    const done = this.d.gate.draftMove(a.id, 'proof_ok', {
      approval: { completed_at: at, proof: JSON.stringify(proof) },
      card: { state: 'sent', payload: { ...p, undoUntil: undefined, sentAt: at, sentMessageId: r.value.messageId } },
      extra: [
        {
          op: 'activity',
          row: {
            kind: 'sent',
            event: 'sent_email',
            actor: 'foo',
            chatId: a.chatId,
            chatTitle: chatTitle ?? null,
            jobId: a.jobId,
            approvalId: a.id,
            paymentId: null,
            routineId: null,
            summary: `Sent an email to ${to.name}`,
            toLabel: maskEmail(to.address),
            fromLabel: null,
            amountPaise: null,
            approvedHow: 'card_once',
            ruleText: null,
            proofKind: 'sent_folder',
            proofRef: r.value.messageId,
            outcome: 'done',
            fields: { subject: p.subject ?? null, proof },
          },
        },
      ],
    });
    return done.ok;
  }

  // M8 T7
  /** The one WhatsApp send (engine queue → bridge), after the write-ahead; "✓ Sent" on the server's ack. */
  private async sendWhatsApp(a: ApprovalRow, cardId: string, p: DraftPayload): Promise<boolean> {
    const port = this.d.whatsapp?.() ?? null;
    const r =
      port && p.waJid ? await port.send({ jid: p.waJid, text: p.body, draftCardId: cardId }) : fail<{ waMessageId: string }>('SEND_FAILED');
    const at = this.d.now();
    if (!r.ok) {
      this.d.gate.draftMove(a.id, 'submit_failed', { approval: { failure_kind: r.error.kind }, card: { state: 'failed' } });
      this.d.log?.({ lvl: 'warn', mod: 'drafts', evt: r.error.kind, ids: { approvalId: a.id } });
      return false;
    }
    const chatTitle = this.d.db.prepare('SELECT title FROM chats WHERE id = ?').pluck().get(a.chatId) as string | null | undefined;
    const to = p.to ?? { name: '', address: '' };
    const done = this.d.gate.draftMove(a.id, 'proof_ok', {
      approval: { completed_at: at },
      card: { state: 'sent', payload: { ...p, undoUntil: undefined, sentAt: at, sentMessageId: r.value.waMessageId } },
      extra: [
        {
          op: 'activity',
          row: {
            kind: 'sent',
            event: 'sent_whatsapp',
            actor: 'foo',
            chatId: a.chatId,
            chatTitle: chatTitle ?? null,
            jobId: a.jobId,
            approvalId: a.id,
            paymentId: null,
            routineId: null,
            // 06-3 §9.4 "Sent a WhatsApp message to {Family group}"; the number stays masked (`to.address` is the mask).
            summary: `Sent a WhatsApp message to ${to.name}`,
            toLabel: to.address,
            fromLabel: null,
            amountPaise: null,
            approvedHow: 'card_once',
            ruleText: null,
            proofKind: null,
            proofRef: r.value.waMessageId,
            outcome: 'done',
            fields: { isGroup: p.isGroup ?? false },
          },
        },
      ],
    });
    return done.ok;
  }

  // M5 T14
  /**
   * 05-2 §5.7.2 HELD (Article 10): APPROVED → HELD with the look kept on the row; the card stays `pending` (Held is a look of
   * pending, §5.7.3) and shows the held strip. Out of the tick's due list (`undo_until` cleared), so the look runs once.
   */
  private hold(approvalId: string, held: Held, result: SecondLookResult | undefined): void {
    const a = this.d.gate.get(approvalId);
    const card = a ? this.card(a.cardId) : null;
    const p = card ? draftPayloadOf(card) : null;
    if (!a || !p) return;
    const r = this.d.gate.draftMove(a.id, 'second_look_held', {
      approval: { undo_until: null, ...(result ? { second_look: JSON.stringify(result) } : {}) },
      card: { state: 'pending', payload: { ...p, undoUntil: undefined, held }, resolved_by: null, resolved_at: null, answer: null },
    });
    this.d.log?.({
      lvl: 'info',
      mod: 'drafts',
      evt: 'second_look.held',
      ids: { approvalId: a.id },
      kind: `${held.reason}:${r.ok ? 'ok' : 'failed'}`,
    });
  }

  /**
   * `card:heldPick` on a held Draft (05-2 §5.7.2, SM-A4): the draft's value (`action`) → HELD → APPROVED and it sends now;
   * the user's own (`own`) → HELD → DECLINED (G-M5-03), this card is superseded and a fresh pending Draft card on the same
   * Gmail draft follows, so they can change it and send (the AI re-writing it with their value is M8's draft producer).
   */
  heldPick(req: Tap & { optionId: string }): Result<CardRow> {
    if (req.optionId !== 'action' && req.optionId !== 'own') return fail('VALIDATION');
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'draft') return fail('VALIDATION');
    const a = this.d.gate.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    if (card.nonce !== req.nonce) return fail('CARD_STALE');
    if (a.state === 'EXPIRED' || (a.state === 'HELD' && this.d.now() >= a.expiresAt)) return fail('CARD_EXPIRED');
    if (a.state !== 'HELD') return fail('CARD_STALE');
    const now = this.d.now();
    const p0 = draftPayloadOf(card);
    if (!p0) return fail('VALIDATION');
    const { held: _held, ...p } = p0;
    void _held;
    const answered = { resolved_by: req.resolvedBy, resolved_at: now, answer: { optionId: req.optionId } };
    if (req.optionId === 'action') {
      // `undo_until = now` puts it back on the tick's due list, so a crash before the send still resumes it (review 1).
      const m = this.d.gate.draftMove(a.id, 'held_pick_action', {
        approval: { approved_at: now, approved_via: 'card', undo_until: now },
        card: { state: 'sending', payload: p, ...answered },
      });
      if (!m.ok) return m;
      void this.sendConfirmed(a.id);
      return ok(this.card(card.id)!);
    }
    const { approvalId: _old, undoUntil: _u, undone: _d, approvalCardId: _f, ...fresh } = p;
    void _old;
    void _u;
    void _d;
    void _f;
    const moved = this.d.db.transaction(() => {
      const m = this.d.gate.draftMove(a.id, 'held_pick_own', { card: { state: 'superseded', payload: p, ...answered } });
      if (!m.ok) throw new DraftAbort(m);
      // M8 T6: a hard-limit draft (someone new, a switch) stays one; its Send opens a fresh full Approval card.
      const made = this.d.gate.createDraft({
        jobId: a.jobId,
        fields: a.fields,
        payload: fresh,
        supersedesCardId: card.id,
        ...(a.hardLimit ? { hardLimit: true } : {}),
      });
      if (!made.ok) throw new DraftAbort(made);
    });
    try {
      moved();
    } catch (e) {
      if (e instanceof DraftAbort) return e.result;
      throw e;
    }
    return ok(this.card(card.id)!);
  }

  /** M5 T14: the user answered a held look with the draft's own value (SM-A4), so no second look runs again. */
  private pickedAction(approvalId: string): boolean {
    const a = this.d.gate.get(approvalId);
    const card = a ? this.card(a.cardId) : null;
    return (card?.answer as { optionId?: unknown } | null)?.optionId === 'action';
  }

  private async sendConfirmed(approvalId: string): Promise<void> {
    if (this.sending.has(approvalId)) return;
    this.sending.add(approvalId);
    try {
      await this.sendOne(approvalId, true);
      // M8 T6: a draft held after its full Approval card was approved closes that card too.
      this.followFull(approvalId);
    } catch (e) {
      this.d.log?.({ lvl: 'error', mod: 'drafts', evt: 'send.failed', ids: { approvalId }, kind: errCode(e) });
    } finally {
      this.sending.delete(approvalId);
    }
  }

  // M8 T6
  /**
   * 05-2 §5.7.2 "Send, new recipient / group / risky content": Send opens the full Approval card (§5.5: "Send this email to
   * {name}?", no scope chips on a hard limit) under the draft, which waits "Waiting for your OK below ›". The draft's own
   * approval stays PENDING until that card is answered. A second Send while the card is open names the same card.
   */
  private askFull(x: { card: CardRow; p: DraftPayload; a: ApprovalRow }): Result<{ approvalId: string; undoUntil: number }> {
    const { card, p, a } = x;
    const now = this.d.now();
    const open = p.approvalCardId ? this.d.gate.byCard(p.approvalCardId) : null;
    if (open?.state === 'PENDING') return ok({ approvalId: open.id, undoUntil: now });
    const to = p.to ?? { name: '', address: '', isNew: true };
    const app = t('cards.approval.app.gmail');
    // M8 T7 (05-2 §5.5.2 "Send WhatsApp, new number or group"): "Send this message to {name}?"
    const text = p.channel === 'whatsapp'
      ? { title: t('cards.approval.send_whatsapp.title', { name: to.name }), impact: t('cards.approval.send_whatsapp.impact', { to: to.address }) }
      : to.isNew
      ? {
          title: t('cards.approval.send_email.title', { name: to.name }),
          impact: t('cards.approval.send_email.impact', { address: to.address, app, them: t('cards.approval.them') }),
        }
      : {
          title: t('cards.approval.switch_how.title', { route: t('cards.approval.send_email.primary') }),
          impact: t('cards.approval.switch_how.impact', { name: to.name, address: to.address }),
        };
    // 05-2 §5.5.2: someone new is a `send` card; a switch is the "Switch how" row (verb `switch`, Globe).
    const verb = to.isNew || p.channel === 'whatsapp' ? 'send' : 'switch';
    const made = this.d.gate.create({
      jobId: a.jobId,
      verb,
      fields: { ...a.fields, verb },
      hardLimit: true,
      ...text,
    });
    if (!made.ok) return made;
    const w = applyDbOps(
      this.d.db,
      [{ op: 'update', table: 'cards', id: card.id, set: { payload: { ...p, approvalCardId: made.value.cardId } } }],
      {
        now,
        ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}),
      },
    );
    if (w.result.ok) this.d.changed(w.effects);
    this.d.log?.({ lvl: 'info', mod: 'drafts', evt: 'card.full_approval', ids: { approvalId: a.id } });
    return ok({ approvalId: made.value.approvalId, undoUntil: now });
  }

  /**
   * The Draft a full Approval card was opened for (the Draft whose payload names it as `approvalCardId`), or null. Card
   * payloads are stored redacted leaf by leaf, and only a whole foo id passes unchanged, so the link is that bare id.
   */
  private draftFor(full: ApprovalRow): { card: CardRow; p: DraftPayload; a: ApprovalRow } | null {
    const r = this.d.db
      .prepare(`SELECT * FROM cards WHERE type = 'draft' AND deleted_at IS NULL AND json_extract(payload, '$.approvalCardId') = ? LIMIT 1`)
      .get(full.cardId) as DbRow | undefined;
    const card = r ? cardRow(r) : null;
    const p = card ? draftPayloadOf(card) : null;
    const a = card ? this.d.gate.byCard(card.id) : null;
    return card && p && a ? { card, p, a } : null;
  }

  /**
   * The full Approval card was approved (`card:approve`, main's gate already moved it to APPROVED): the draft's approval is
   * approved too and sent now, with its second look and no 5 s undo (08-0 §G.7). The full card follows the send: RUNNING,
   * then COMPLETED with the same proof, or FAILED. Returns false when the approval is not a draft's.
   */
  async fullApproved(approvalId: string, resolvedBy: 'tap' | 'keyboard'): Promise<boolean> {
    const full = this.d.gate.get(approvalId);
    if (!full || full.state !== 'APPROVED') return false;
    const d = this.draftFor(full);
    if (!d) return false;
    if (d.a.state !== 'PENDING') {
      // The draft ended first (it expired, or a stopped job withdrew it): nothing is sent, and the card says so.
      this.d.gate.transition(full.id, 'WITHDRAWN');
      this.d.log?.({ lvl: 'warn', mod: 'drafts', evt: 'card.full_without_draft', ids: { approvalId: full.id } });
      return true;
    }
    const now = this.d.now();
    // `undo_until = now` keeps it on the tick's due list, so a crash before the send still resumes it.
    const m = this.d.gate.draftMove(d.a.id, 'approve', {
      approval: { approved_at: now, approved_via: 'card', scope: 'once', undo_until: now },
      card: { state: 'sending', payload: d.p, resolved_by: resolvedBy, resolved_at: now, answer: { optionId: 'send' } },
    });
    if (!m.ok) return false;
    if (this.sending.has(d.a.id)) return true;
    this.sending.add(d.a.id);
    try {
      await this.sendOne(d.a.id);
      this.followFull(d.a.id);
    } catch (e) {
      // The row stays APPROVED with `undo_until = now`, so the tick picks the send up again.
      this.d.log?.({ lvl: 'error', mod: 'drafts', evt: 'send.failed', ids: { approvalId: d.a.id }, kind: errCode(e) });
    } finally {
      this.sending.delete(d.a.id);
    }
    return true;
  }

  /**
   * The full card's row follows the draft's: COMPLETED with the same Sent-folder proof, or FAILED. A held draft (second
   * look) leaves it APPROVED: the draft card asks now, and nothing ran.
   */
  private followFull(draftApprovalId: string): void {
    const draft = this.d.gate.get(draftApprovalId);
    if (draft?.state !== 'COMPLETED' && draft?.state !== 'FAILED') return;
    const card = this.card(draft.cardId);
    const p = card ? draftPayloadOf(card) : null;
    const full = p?.approvalCardId ? this.d.gate.byCard(p.approvalCardId) : null;
    if (full?.state !== 'APPROVED') return;
    const fullId = full.id;
    this.d.gate.transition(fullId, 'RUNNING', { submittedAt: draft.submittedAt ?? this.d.now() });
    this.d.gate.transition(fullId, draft.state);
    const proof = this.d.db.prepare('SELECT proof FROM approvals WHERE id = ?').pluck().get(draftApprovalId) as string | null;
    if (draft.state === 'COMPLETED' && proof) this.d.db.prepare('UPDATE approvals SET proof = ? WHERE id = ?').run(proof, fullId);
    // 05-2 §5.5 Logged: switch how → `switched_route`, one row when it runs (beside the draft's own `sent_email`).
    if (draft.state === 'COMPLETED' && full.verb === 'switch') this.logSwitch(full, p!);
  }

  private logSwitch(full: ApprovalRow, p: DraftPayload): void {
    const chatTitle = this.d.db.prepare('SELECT title FROM chats WHERE id = ?').pluck().get(full.chatId) as string | null | undefined;
    const w = applyDbOps(
      this.d.db,
      [
        {
          op: 'activity',
          row: {
            kind: 'changed',
            event: 'switched_route',
            actor: 'foo',
            chatId: full.chatId,
            chatTitle: chatTitle ?? null,
            jobId: full.jobId,
            approvalId: full.id,
            paymentId: null,
            routineId: null,
            summary: 'Switched to email',
            toLabel: p.to ? maskEmail(p.to.address) : null,
            fromLabel: null,
            amountPaise: null,
            approvedHow: 'card_once',
            ruleText: null,
            proofKind: null,
            proofRef: null,
            outcome: 'done',
            fields: {},
          },
        },
      ],
      { now: this.d.now(), ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}) },
    );
    if (w.result.ok) this.d.changed(w.effects);
  }

  /** True while the full Approval card this draft waits on is still open. */
  private fullOpen(p: DraftPayload): boolean {
    return !!p.approvalCardId && this.d.gate.byCard(p.approvalCardId)?.state === 'PENDING';
  }

  /**
   * A full Approval card that ended unanswered (expired, or withdrawn by a stopped job) gives its draft back, as "Not now"
   * does, so the draft never waits on a card that is gone.
   */
  private unlinkDeadFull(): void {
    const ids = this.d.db
      .prepare(
        `SELECT f.id FROM cards c JOIN approvals f ON f.card_id = json_extract(c.payload, '$.approvalCardId')
          WHERE c.type = 'draft' AND c.state = 'pending' AND c.deleted_at IS NULL AND f.state IN ('EXPIRED', 'WITHDRAWN', 'DECLINED', 'SUPERSEDED')`,
      )
      .pluck()
      .all() as string[];
    for (const id of ids) this.fullDeclined(id);
    // The other way round: a draft that ended while its full card waits takes that card with it.
    const orphans = this.d.db
      .prepare(
        `SELECT f.id FROM cards c JOIN approvals f ON f.card_id = json_extract(c.payload, '$.approvalCardId')
          WHERE c.type = 'draft' AND c.state IN ('expired', 'withdrawn', 'discarded', 'superseded') AND f.state = 'PENDING'`,
      )
      .pluck()
      .all() as string[];
    for (const id of orphans) this.d.gate.transition(id, 'WITHDRAWN');
  }

  /** "Not now" on the full card: the draft is a plain pending draft again (Send asks again, Discard still works). */
  fullDeclined(approvalId: string): void {
    const full = this.d.gate.get(approvalId);
    const d = full ? this.draftFor(full) : null;
    if (!d || d.a.state !== 'PENDING') return;
    const { approvalCardId: _gone, ...p } = d.p;
    void _gone;
    const w = applyDbOps(this.d.db, [{ op: 'update', table: 'cards', id: d.card.id, set: { payload: p } }], {
      now: this.d.now(),
      ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}),
    });
    if (w.result.ok) this.d.changed(w.effects);
  }

  /**
   * 05-2 §5.7.2 Offline at Send, [ Yes, send when online ] (`card:answer` optionId `send_when_online`): the tap approves
   * once, as Send does; the card waits `queued_offline` ("Will send when you're back online" + Cancel) and the send runs
   * with its 5 s undo once foo is back online (`resumeQueued`).
   */
  queueOffline(req: Tap): Result<CardRow> {
    const t = this.pending(req);
    if (!t.ok) return t;
    const { card, p, a } = t.value;
    if (!p.sendAllowed) return fail('CONN_SCOPE_MISSING');
    if (a.hardLimit) return fail('VALIDATION');
    const now = this.d.now();
    const moved = this.d.gate.draftMove(a.id, 'approve', {
      approval: { approved_at: now, approved_via: 'card', scope: 'once', undo_until: null },
      card: {
        state: 'queued_offline',
        payload: { ...p, undone: false },
        resolved_by: req.resolvedBy,
        resolved_at: now,
        answer: { optionId: 'send_when_online' },
      },
    });
    return moved.ok ? ok(this.card(card.id)!) : moved;
  }

  /** Back online: every queued Draft opens its 5 s undo window, then the tick sends it. Returns the approvals moved. */
  resumeQueued(): string[] {
    const now = this.d.now();
    const undoUntil = now + UNDO_MS;
    const ids = this.d.db
      .prepare(
        `SELECT a.id FROM approvals a JOIN cards c ON c.id = a.card_id
         WHERE c.type = 'draft' AND c.state = 'queued_offline' AND a.state = 'APPROVED' AND a.submitted_at IS NULL`,
      )
      .pluck()
      .all() as string[];
    const out: string[] = [];
    for (const id of ids) {
      const a = this.d.gate.get(id);
      const card = a ? this.card(a.cardId) : null;
      const p = card ? draftPayloadOf(card) : null;
      if (!a || !card || !p) continue;
      const effects = this.d.db.transaction(() => {
        const n = this.d.db
          .prepare("UPDATE approvals SET undo_until = ? WHERE id = ? AND state = 'APPROVED' AND submitted_at IS NULL")
          .run(undoUntil, id).changes;
        if (n !== 1) return null;
        const w = applyDbOps(
          this.d.db,
          [{ op: 'update', table: 'cards', id: card.id, set: { state: 'undo_window', payload: { ...p, undoUntil } } }],
          {
            now,
            ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}),
          },
        );
        if (!w.result.ok) throw new Error(w.result.error.kind);
        return w.effects;
      })();
      if (!effects) continue;
      this.d.changed(effects);
      out.push(id);
    }
    return out;
  }

  /** `draft:update` (Change → Save changes): Gmail drafts.update, the same PENDING approval re-hashed, a new nonce. */
  async update(req: { cardId: string; nonce: string; fields: DraftFields }): Promise<Result<CardRow>> {
    // M8 T7: an X draft changes on the card alone (no approval to re-hash), with its weighted length again.
    const x = this.xPending(req);
    if (x) {
      if (!x.ok) return x;
      const { card, p } = x.value;
      const body = req.fields.body;
      this.rotateNonce(card.id);
      if (!this.setCard(card.id, { payload: { ...p, body, edited: true, xRemaining: xRemaining(body) } })) return fail('CARD_STALE');
      return ok(this.card(card.id)!);
    }
    // M8 T6: one save at a time per card; a second one while Gmail answers the first is stale.
    if (this.updating.has(req.cardId)) return fail('CARD_STALE');
    this.updating.add(req.cardId);
    try {
      return await this.updateOnce(req);
    } finally {
      this.updating.delete(req.cardId);
    }
  }

  private async updateOnce(req: { cardId: string; nonce: string; fields: DraftFields }): Promise<Result<CardRow>> {
    const t = this.pending(req);
    if (!t.ok) return t;
    const { card, p, a } = t.value;
    // M8 T6: the full Approval card shows these words; they stay as they are while it waits.
    if (this.fullOpen(p)) return fail('CARD_STALE');
    // 05-2 §5.7.1: To is not editable in the card; a recipient change goes through chat and makes a new card.
    if (req.fields.to !== undefined && req.fields.to !== p.to?.address) return fail('VALIDATION');
    const subject = p.subject === undefined ? undefined : (req.fields.subject ?? p.subject);
    const gmail = this.d.gmail();
    const to = p.to?.address ?? '';
    // M8 T6 (G-M8-04): a draft kept in foo (no Gmail draft without `gmail.compose`) changes in foo only.
    // M8 T7: WhatsApp has no draft elsewhere either.
    const local = p.channel !== 'email' || (!p.gmailDraftId && !p.sendAllowed);
    if (!local && (!gmail || !p.gmailDraftId)) return fail('CONN_EXPIRED');
    if (!local) {
      const g = await gmail!.update(p.gmailDraftId!, this.message(to, subject, req.fields.body, p.signature, p));
      if (!g.ok) return g;
    }
    // A Send can land while Gmail answers: then the old words are the approved ones, so Gmail gets them back.
    const revert = async (r: Result<never>): Promise<Result<never>> => {
      if (!local) await gmail!.update(p.gmailDraftId!, this.message(to, p.subject, p.body, p.signature, p));
      return r;
    };
    const still = this.pending(req);
    if (!still.ok) return revert(still);
    const fields: ApprovalFields = { ...a.fields, contentSummary: summaryOf(subject, req.fields.body) };
    const now = this.d.now();
    const payload: DraftPayload = {
      ...p,
      ...(subject !== undefined ? { subject } : {}),
      body: req.fields.body,
      edited: true,
      undone: false,
    };
    const r = this.d.db.transaction(() => {
      const moved = this.d.db
        .prepare("UPDATE approvals SET fields = ?, fields_hash = ? WHERE id = ? AND state = 'PENDING'")
        .run(JSON.stringify(fields), fieldsHash(fields), a.id).changes;
      if (moved !== 1) return null;
      this.rotateNonce(card.id);
      const w = applyDbOps(this.d.db, [{ op: 'update', table: 'cards', id: card.id, set: { payload } }], {
        now,
        ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}),
      });
      if (!w.result.ok) throw new Error(w.result.error.kind);
      return w.effects;
    })();
    if (!r) return revert(fail('CARD_STALE'));
    this.d.changed(r);
    this.d.log?.({ lvl: 'info', mod: 'drafts', evt: 'card.changed', ids: { approvalId: a.id } });
    return ok(this.card(card.id)!);
  }

  /** `draft:discard`: Gmail drafts.delete, the approval WITHDRAWN, the card "Draft discarded". */
  async discard(req: Tap): Promise<Result<CardRow>> {
    // M8 T7: an X draft is the card alone.
    const x = this.xPending(req);
    if (x) {
      if (!x.ok) return x;
      const set = { payload: x.value.p, state: 'discarded', resolved_by: req.resolvedBy, resolved_at: this.d.now() };
      return this.setCard(x.value.card.id, set) ? ok(this.card(x.value.card.id)!) : fail('CARD_STALE');
    }
    const t = this.pending(req);
    if (!t.ok) return t;
    const { card, p, a } = t.value;
    // M8 T6: while the full Approval card waits, it is the one way on ("Not now" there gives the draft back).
    if (this.fullOpen(p)) return fail('CARD_STALE');
    const gmail = this.d.gmail();
    if (gmail && p.gmailDraftId) {
      const g = await gmail.delete(p.gmailDraftId);
      // A draft already gone from Gmail is discarded all the same.
      if (!g.ok && g.error.kind !== 'NOT_FOUND') return g;
    }
    const now = this.d.now();
    const moved = this.d.gate.draftMove(a.id, 'withdraw', {
      card: { state: 'discarded', resolved_by: req.resolvedBy, resolved_at: now, answer: { optionId: 'discard' } },
    });
    return moved.ok ? ok(this.card(card.id)!) : moved;
  }

  /** `draft:openInApp` (No send permission → "Open in Gmail"): the Gmail draft opens there; foo no longer waits on it. */
  async openInApp(req: { cardId: string }): Promise<Result<void>> {
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'draft') return fail('VALIDATION');
    if (draftPayloadOf(card)?.channel === 'x') return this.openX(card); // M8 T7
    const a = this.d.gate.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    const p = draftPayloadOf(card);
    if (!p || p.sendAllowed) return fail('VALIDATION');
    // M8 T6: a draft kept in foo (G-M8-04) opens Gmail's compose page again on a second tap; nothing moves.
    if (card.state === 'opened_in_app' && !p.gmailDraftId) {
      await this.d.openExternal?.(gmailUrl(p, this.d.email?.() ?? null));
      return ok(undefined);
    }
    if (card.state !== 'pending' || a.state !== 'PENDING') return fail('CARD_STALE');
    const now = this.d.now();
    const moved = this.d.gate.draftMove(a.id, 'withdraw', { card: { state: 'opened_in_app', resolved_by: 'tap', resolved_at: now } });
    if (!moved.ok) return moved;
    await this.d.openExternal?.(gmailUrl(p, this.d.email?.() ?? null));
    return ok(undefined);
  }

  // M8 T7
  /**
   * "Open in X to post" (`x.openCompose`): X's compose page opens with the text; foo never posts (AT-054). The first tap
   * moves the card to "Opened in X · not posted by {agentName}" with foo's line and Activity `opened_x_draft`; a later tap
   * only opens the page again. A post over 280 weighted characters does not open.
   */
  private async openX(card: CardRow): Promise<Result<void>> {
    const p = draftPayloadOf(card)!;
    if (card.state === 'opened_in_app') {
      await this.d.openExternal?.(xIntentUrl(p.body));
      return ok(undefined);
    }
    if (card.state !== 'pending') return fail('CARD_STALE');
    if (xRemaining(p.body) < 0) return fail('VALIDATION');
    const now = this.d.now();
    const chat = this.d.db.prepare('SELECT title FROM chats WHERE id = ?').pluck().get(card.chatId) as string | null | undefined;
    const w = applyDbOps(
      this.d.db,
      [
        { op: 'update', table: 'cards', id: card.id, set: { state: 'opened_in_app', resolved_by: 'tap', resolved_at: now } },
        {
          op: 'insert',
          table: 'messages',
          row: {
            id: newId('m', now),
            chat_id: card.chatId,
            author_kind: 'foo',
            kind: 'text',
            text: t('cards.draft.x_opened_line'),
            status: 'complete',
            job_id: card.jobId,
            created_at: now,
          },
        },
        {
          op: 'activity',
          row: {
            kind: 'sent',
            event: 'opened_x_draft',
            actor: 'foo',
            chatId: card.chatId,
            chatTitle: chat ?? null,
            jobId: card.jobId,
            approvalId: null,
            paymentId: null,
            routineId: null,
            // 06-3 §9.4: "Opened an X post for you to send" · "foo · you".
            summary: 'Opened an X post for you to send',
            toLabel: null,
            fromLabel: null,
            amountPaise: null,
            approvedHow: 'user',
            ruleText: null,
            proofKind: null,
            proofRef: null,
            outcome: 'done',
            fields: {},
          },
        },
      ],
      this.opts(now),
    );
    if (!w.result.ok) return w.result;
    this.d.changed(w.effects);
    await this.d.openExternal?.(xIntentUrl(p.body));
    return ok(undefined);
  }

  /**
   * `card:askAgain` on an expired Draft (05-2 §5.7.2): a fresh pending Draft card on the same Gmail draft, 60 min again.
   * M8 T6: a Failed Draft's [ Try again ] is the same: drafts.send left the Gmail draft in place, and the new card needs its
   * own Send tap (never a silent resend).
   */
  askAgain(req: { cardId: string }): Result<{ newCardId?: string }> {
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'draft') return fail('VALIDATION');
    const a = this.d.gate.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    if (a.state !== 'EXPIRED' && a.state !== 'FAILED') return fail('CARD_STALE');
    const already = this.d.db.prepare('SELECT 1 FROM cards WHERE supersedes_id = ?').pluck().get(card.id);
    if (already) return fail('CARD_STALE');
    const p0 = draftPayloadOf(card);
    if (!p0) return fail('VALIDATION');
    const { approvalId: _old, undoUntil: _u, undone: _d, approvalCardId: _f, ...p } = p0;
    void _old;
    void _u;
    void _d;
    void _f;
    // A hard-limit draft (someone new, a switch) stays one: its Send opens the full Approval card again.
    const made = this.d.gate.createDraft({
      jobId: a.jobId,
      fields: a.fields,
      payload: p,
      supersedesCardId: card.id,
      ...(a.hardLimit ? { hardLimit: true } : {}),
    });
    return made.ok ? ok({ newCardId: made.value.cardId }) : made;
  }
}

class DraftAbort extends Error {
  constructor(readonly result: Result<never>) {
    super('draft move refused');
  }
}
