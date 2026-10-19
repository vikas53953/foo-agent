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
import { newNonce } from '../../shared/canon';
import { fail, ok, type Result } from '../../shared/errors';
import { maskEmail, redactSecrets } from '../../shared/redactor';
import type { ApprovalFields, ApprovalPayload, CardRow, DraftFields, DraftPayload, SecondLookResult } from '../../shared/types';
import { approvalExpiresAt } from '../../shared/approvalMachine';
import { fieldsHash } from '../../engine/gate/fieldsHash';
import { cardRow, type DbRow } from '../db/rows';
import { applyDbOps, type TxEffects } from '../engine-supervisor/engineHost';
import type { Db } from '../store/db';
import type { ApprovalGate, ApprovalRow, Created } from '../approvals/ApprovalGate';
import type { GmailDrafts } from './gmailDrafts';

/** 05-2 §5.7.2 / 08-0 §G.7: the local undo window after Send. */
export const UNDO_MS = 5_000;
/** Gmail's drafts folder: where "Open in Gmail" lands when foo may not send (05-2 §5.7.2 No send permission). */
export const GMAIL_DRAFTS_URL = 'https://mail.google.com/mail/#drafts';

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
  log?(line: Record<string, unknown>): void;
}

export interface DraftInput {
  jobId: string;
  to: { name: string; address: string };
  subject?: string;
  body: string;
  signature?: string;
  /** False when the Gmail connection has no send scope (05-2 §5.7.2 "No send permission"). */
  sendAllowed?: boolean;
}

interface Tap {
  cardId: string;
  nonce: string;
  resolvedBy: 'tap' | 'keyboard';
}

/** 08-2 §9.3 `contentSummary`: subject + the first 140 characters of the body, redacted. */
const summaryOf = (subject: string | undefined, body: string) =>
  redactSecrets([subject, body.slice(0, 140)].filter(Boolean).join('\n')).text;

function sendFields(to: DraftInput['to'], subject: string | undefined, body: string): ApprovalFields {
  return {
    verb: 'send',
    channel: 'email',
    recipients: [{ name: to.name, address: to.address, isNew: false, isGroup: false }],
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

  /** A known-recipient Draft (08-0 §G.7): the Gmail draft first, then the card and its PENDING approvals row. */
  async create(input: DraftInput): Promise<Result<Created>> {
    const gmail = this.d.gmail();
    if (!gmail) return fail('CONN_EXPIRED');
    const g = await gmail.create({
      to: input.to.address,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      body: input.body,
    });
    if (!g.ok) return g;
    const made = this.d.gate.createDraft({
      jobId: input.jobId,
      fields: sendFields(input.to, input.subject, input.body),
      payload: {
        channel: 'email',
        to: { ...input.to, isNew: false },
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        body: input.body,
        ...(input.signature ? { signature: input.signature } : {}),
        edited: false,
        sendAllowed: input.sendAllowed ?? true,
        gmailDraftId: g.value.gmailDraftId,
      },
    });
    // No card, no approval: the Gmail draft would be left behind with nothing pointing at it.
    if (!made.ok) await gmail.delete(g.value.gmailDraftId);
    return made;
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
    return ok({ card, p: card.payload as unknown as DraftPayload, a });
  }

  /** `draft:send`: approve once (`approved_via='card'`, X-65) and open the 5 s undo window. */
  send(req: Tap): Result<{ approvalId: string; undoUntil: number }> {
    const t = this.pending(req);
    if (!t.ok) return t;
    const { p, a } = t.value;
    if (!p.sendAllowed) return fail('CONN_SCOPE_MISSING');
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
    if (a.state !== 'APPROVED' || card.state !== 'undo_window' || a.submittedAt !== null || now >= (this.undoUntil(a) ?? 0))
      return fail('TOO_LATE');
    const expiresAt = approvalExpiresAt('send', now);
    const { undoUntil: _gone, ...p } = card.payload as unknown as DraftPayload;
    void _gone;
    // A fresh PENDING approval needs a fresh nonce; both land in one transaction (the gate's move nests as a savepoint).
    const moved = this.d.db.transaction(() => {
      this.rotateNonce(card.id);
      const m = this.d.gate.draftMove(a.id, 'draft_undo', {
        approval: { approved_at: null, approved_via: null, scope: null, undo_until: null, expires_at: expiresAt },
        card: {
          state: 'pending',
          expires_at: expiresAt,
          payload: { ...p, undone: true },
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
    if (!card0) return false;
    const p0 = card0.payload as unknown as DraftPayload;
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
    if (!a || a.state !== 'APPROVED' || !card) return false;
    const gmail = this.d.gmail();
    const p = card.payload as unknown as DraftPayload;
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
      this.d.log?.({ t: at, lvl: 'warn', mod: 'drafts', evt: r.error.kind, approvalId: a.id });
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
    if (!a || !card) return;
    const p = card.payload as unknown as DraftPayload;
    const r = this.d.gate.draftMove(a.id, 'second_look_held', {
      approval: { undo_until: null, ...(result ? { second_look: JSON.stringify(result) } : {}) },
      card: { state: 'pending', payload: { ...p, undoUntil: undefined, held }, resolved_by: null, resolved_at: null, answer: null },
    });
    this.d.log?.({ t: this.d.now(), lvl: 'info', mod: 'drafts', evt: 'second_look.held', approvalId: a.id, reason: held.reason, ok: r.ok });
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
    const { held: _held, ...p } = card.payload as unknown as DraftPayload;
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
      this.d.log?.({ t: this.d.now(), lvl: 'error', mod: 'drafts', evt: 'send.failed', approvalId, err: String(e) });
    } finally {
      this.sending.delete(approvalId);
    }
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
    if (!gmail || !p.gmailDraftId) return fail('CONN_EXPIRED');
    const g = await gmail.update(p.gmailDraftId, {
      to: p.to?.address ?? '',
      ...(subject !== undefined ? { subject } : {}),
      body: req.fields.body,
    });
    if (!g.ok) return g;
    // A Send can land while Gmail answers: then the old words are the approved ones, so Gmail gets them back.
    const revert = async (r: Result<never>): Promise<Result<never>> => {
      await gmail.update(p.gmailDraftId!, {
        to: p.to?.address ?? '',
        ...(p.subject !== undefined ? { subject: p.subject } : {}),
        body: p.body,
      });
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
    this.d.log?.({ t: now, lvl: 'info', mod: 'drafts', evt: 'card.changed', approvalId: a.id, cardId: card.id });
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
    if (card.state !== 'pending' || a.state !== 'PENDING') return fail('CARD_STALE');
    if ((card.payload as unknown as DraftPayload).sendAllowed) return fail('VALIDATION');
    const now = this.d.now();
    const moved = this.d.gate.draftMove(a.id, 'withdraw', { card: { state: 'opened_in_app', resolved_by: 'tap', resolved_at: now } });
    if (!moved.ok) return moved;
    await this.d.openExternal?.(GMAIL_DRAFTS_URL);
    return ok(undefined);
  }

  /** `card:askAgain` on an expired Draft (05-2 §5.7.2): a fresh pending Draft card on the same Gmail draft, 60 min again. */
  askAgain(req: { cardId: string }): Result<{ newCardId?: string }> {
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'draft') return fail('VALIDATION');
    const a = this.d.gate.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    if (a.state !== 'EXPIRED') return fail('CARD_STALE');
    const already = this.d.db.prepare('SELECT 1 FROM cards WHERE supersedes_id = ?').pluck().get(card.id);
    if (already) return fail('CARD_STALE');
    const { approvalId: _old, undoUntil: _u, undone: _d, ...p } = card.payload as unknown as DraftPayload;
    void _old;
    void _u;
    void _d;
    const made = this.d.gate.createDraft({ jobId: a.jobId, fields: a.fields, payload: p, supersedesCardId: card.id });
    return made.ok ? ok({ newCardId: made.value.cardId }) : made;
  }
}

class DraftAbort extends Error {
  constructor(readonly result: Result<never>) {
    super('draft move refused');
  }
}
