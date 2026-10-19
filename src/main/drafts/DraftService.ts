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

  constructor(private readonly d: DraftDeps) {}

  private card(cardId: string): CardRow | null {
    const r = this.d.db.prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(cardId) as DbRow | undefined;
    return r ? cardRow(r) : null;
  }

  /** A Draft (08-0 §G.7): the Gmail draft first, then the card and its PENDING approvals row. */
  async create(input: DraftInput): Promise<Result<Created>> {
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

  // M8 T6
  /** Art. 9: an email inside a job with an approved booking or payment switches the channel, so it asks again. */
  private switched(jobId: string): boolean {
    return !!this.d.db
      .prepare(
        `SELECT 1 FROM approvals WHERE job_id = ? AND verb IN ('book', 'buy', 'pay')
           AND state IN ('APPROVED', 'RUNNING', 'CHECKING', 'COMPLETED') LIMIT 1`,
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
    const t = this.pending(req);
    if (!t.ok) return t;
    const { p, a } = t.value;
    if (!p.sendAllowed) return fail('CONN_SCOPE_MISSING');
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
    const r = gmail && p.gmailDraftId ? await gmail.send(p.gmailDraftId) : fail<{ messageId: string }>('CONN_EXPIRED');
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
    const { approvalId: _old, undoUntil: _u, undone: _d, ...fresh } = p;
    void _old;
    void _u;
    void _d;
    const moved = this.d.db.transaction(() => {
      const m = this.d.gate.draftMove(a.id, 'held_pick_own', { card: { state: 'superseded', payload: p, ...answered } });
      if (!m.ok) throw new DraftAbort(m);
      const made = this.d.gate.createDraft({ jobId: a.jobId, fields: a.fields, payload: fresh, supersedesCardId: card.id });
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
    const text = to.isNew
      ? {
          title: t('cards.approval.send_email.title', { name: to.name }),
          impact: t('cards.approval.send_email.impact', { address: to.address, app, them: t('cards.approval.them') }),
        }
      : {
          title: t('cards.approval.switch_how.title', { route: t('cards.approval.send_email.primary') }),
          impact: t('cards.approval.switch_how.impact', { name: to.name, address: to.address }),
        };
    const made = this.d.gate.create({
      jobId: a.jobId,
      verb: 'send',
      fields: a.fields,
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
    if (!d || d.a.state !== 'PENDING') return false;
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
    } finally {
      this.sending.delete(d.a.id);
    }
    this.followFull(d.a.id);
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
    const t = this.pending(req);
    if (!t.ok) return t;
    const { card, p, a } = t.value;
    // 05-2 §5.7.1: To is not editable in the card; a recipient change goes through chat and makes a new card.
    if (req.fields.to !== undefined && req.fields.to !== p.to?.address) return fail('VALIDATION');
    const subject = p.subject === undefined ? undefined : (req.fields.subject ?? p.subject);
    const gmail = this.d.gmail();
    const to = p.to?.address ?? '';
    // M8 T6 (G-M8-04): a draft kept in foo (no Gmail draft without `gmail.compose`) changes in foo only.
    const local = !p.gmailDraftId && !p.sendAllowed;
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
    const t = this.pending(req);
    if (!t.ok) return t;
    const { card, p, a } = t.value;
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
