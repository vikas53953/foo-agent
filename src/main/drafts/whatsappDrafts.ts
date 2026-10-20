// Spec: 05-2 §5.7 WhatsApp Draft variant (a group or someone new is a hard-limit draft whose Send opens the full Approval
// card "Send this message to {name}?", §5.5.2), 08-3 §16.4 Send (the engine's queue, ≥ 3 s apart; "✓ Sent" on the server's
// ack; "Proof: Delivered" on the delivery ack, `wa_delivered`; ≤ 30 a day, the Send button off with the daily-limit line
// until local midnight), §16.4.2 ("That number isn't on WhatsApp." with no Send; "I can't check that number right now." with
// Send off until the bridge is open again), 08-0 §H.2 (the daily limit), 08-2 §10.4 + §10.5 (write-ahead before the one
// irreversible call; no answer from the bridge is not "nothing went out": the row goes CHECKING and a late server ack still
// completes it), 06-3 §9.4 (Activity `sent_whatsapp` "Sent a WhatsApp message to {name}").
// M8 T7: the WhatsApp half of DraftService (split out so the service stays readable); DraftService routes to it.
import { fail, type Result } from '../../shared/errors';
import type { CardRow, DraftPayload } from '../../shared/types';
import { approvalExpiresAt } from '../../shared/approvalMachine';
import { isGroupJid, WA_NO_ACK, waMessageId, waSendKeyId } from '../../shared/waBridge';
import { draftPayloadOf } from '../approvals/cardPayloads';
import { cardRow, type DbRow } from '../db/rows';
import type { DbOp } from '../../engine/protocol';
import type { ApprovalRow, Created } from '../approvals/ApprovalGate';
import { localMidnight, WA_DAILY_LIMIT, waSentToday } from './channels';
import { summaryOf, type DraftDeps, type DraftInput } from './DraftService';
import { newNonce } from '../../shared/canon';

/** What the channel halves need from DraftService. */
export interface DraftHost {
  d: DraftDeps;
  card(cardId: string): CardRow | null;
  setCard(cardId: string, set: { payload: DraftPayload; state?: string; resolved_by?: string; resolved_at?: number }): boolean;
  opts(now: number): { now: number; dataDir?: string };
}

export class WhatsAppDrafts {
  constructor(private readonly h: DraftHost) {}

  private get d(): DraftDeps {
    return this.h.d;
  }

  /** A WhatsApp Draft: its PENDING approvals row as for email; a group or someone new makes it a hard-limit draft. */
  create(input: DraftInput): Result<Created> {
    if (!input.waJid) return fail('VALIDATION');
    // A group is what its jid says; a caller's flag that says otherwise is refused, never trusted (Art. 4, AT-070).
    const isGroup = isGroupJid(input.waJid);
    if (input.isGroup !== undefined && input.isGroup !== isGroup) return fail('VALIDATION');
    const isNew = input.isNew ?? false;
    const limit = this.limitUntil();
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
  limitUntil(): number | null {
    const now = this.d.now();
    const tz = this.d.timeZone?.() ?? 'Asia/Kolkata';
    return waSentToday(this.d.db, now, tz) >= WA_DAILY_LIMIT ? localMidnight(now, tz, 1) : null;
  }

  /**
   * Send on a pending WhatsApp Draft (08-3 §16.4.2, §16.4 Send): no Send for a number that isn't on WhatsApp or can't be
   * checked; at the daily limit the card says so and stays pending (no ErrorKind, no toast). Null: Send may go on.
   */
  refuseSend(card: CardRow, p: DraftPayload): Result<never> | null {
    if (p.waCheck) return fail('VALIDATION');
    const until = this.limitUntil();
    if (until === null) return null;
    if (p.waLimitUntil !== until) this.h.setCard(card.id, { payload: { ...p, waLimitUntil: until } });
    return fail('VALIDATION');
  }

  /**
   * The undo window closed but the daily limit was reached meanwhile (other Drafts sent in the 5 s): the approval goes back
   * to PENDING with the daily-limit line, before the write-ahead, so nothing is half-sent. True when it went back.
   */
  backAtLimit(a: ApprovalRow, card: CardRow, p: DraftPayload): boolean {
    const until = this.limitUntil();
    if (until === null) return false;
    const now = this.d.now();
    const expiresAt = approvalExpiresAt('send', now);
    const { undoUntil: _gone, ...rest } = p;
    void _gone;
    return this.d.db.transaction(() => {
      this.d.db.prepare('UPDATE cards SET nonce = ? WHERE id = ?').run(newNonce(), card.id);
      return this.d.gate.draftMove(a.id, 'draft_undo', {
        approval: { approved_at: null, approved_via: null, scope: null, undo_until: null, expires_at: expiresAt },
        card: {
          state: 'pending',
          expires_at: expiresAt,
          payload: { ...rest, waLimitUntil: until },
          resolved_by: null,
          resolved_at: null,
          answer: null,
        },
      }).ok;
    })();
  }

  /**
   * The one WhatsApp send (engine queue → bridge), after the write-ahead; "✓ Sent" on the server's ack. The bridge's
   * SEND_FAILED is "Nothing went out"; no answer at all may still have gone out, so the row goes CHECKING and the card keeps
   * "Sending…" until the late ack (`sent`) or the CHECKING timer (08-2 §10.5).
   */
  async send(a: ApprovalRow, cardId: string, p: DraftPayload): Promise<boolean> {
    const port = this.d.whatsapp?.() ?? null;
    const r =
      port && p.waJid ? await port.send({ jid: p.waJid, text: p.body, draftCardId: cardId }) : fail<{ waMessageId: string }>('SEND_FAILED');
    if (!r.ok) {
      const unknown = r.error.kind !== 'SEND_FAILED' || r.error.message === WA_NO_ACK;
      if (unknown) this.d.gate.draftMove(a.id, 'result_unknown', { card: {} });
      else this.d.gate.draftMove(a.id, 'submit_failed', { approval: { failure_kind: r.error.kind }, card: { state: 'failed' } });
      this.d.log?.({ lvl: 'warn', mod: 'drafts', evt: unknown ? 'WA_NO_ACK' : r.error.kind, ids: { approvalId: a.id } });
      return false;
    }
    return this.d.gate.draftMove(a.id, 'proof_ok', this.sentMove(a, p, r.value.waMessageId)).ok;
  }

  /**
   * A late server ack for a send that timed out (engine `wa.report { event: 'sent' }`): the CHECKING row completes with
   * "✓ Sent" and `sent_whatsapp`. Answers the approval id it completed, or null.
   */
  sent(id: string): string | null {
    const rows = this.d.db
      .prepare(
        `SELECT * FROM cards WHERE type = 'draft' AND state = 'sending' AND deleted_at IS NULL AND json_extract(payload, '$.waJid') IS NOT NULL`,
      )
      .all() as DbRow[];
    for (const r of rows) {
      const card = cardRow(r);
      const p = draftPayloadOf(card);
      if (!p?.waJid || waMessageId(p.waJid, waSendKeyId(card.id)) !== id) continue;
      const a = this.d.gate.byCard(card.id);
      if (a?.state !== 'CHECKING') return null;
      return this.d.gate.draftMove(a.id, 'proof_found', this.sentMove(a, p, id)).ok ? a.id : null;
    }
    return null;
  }

  private sentMove(
    a: ApprovalRow,
    p: DraftPayload,
    sentMessageId: string,
  ): { approval: Record<string, unknown>; card: Record<string, unknown>; extra: DbOp[] } {
    const at = this.d.now();
    const chatTitle = this.d.db.prepare('SELECT title FROM chats WHERE id = ?').pluck().get(a.chatId) as string | null | undefined;
    const to = p.to ?? { name: '', address: '' };
    return {
      approval: { completed_at: at },
      card: { state: 'sent', payload: { ...p, undoUntil: undefined, sentAt: at, sentMessageId } },
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
            proofRef: sentMessageId,
            outcome: 'done',
            fields: { isGroup: p.isGroup ?? false },
          },
        },
      ],
    };
  }

  /**
   * Delivery ack ≥ 2 for a sent Draft (08-3 §16.4 proof `wa_delivered`): the card shows "Proof: Delivered" and the approvals
   * row (and the full Approval card's, when one was opened) keeps the proof. Returns false when no Draft sent it.
   */
  delivered(id: string): boolean {
    const r = this.d.db
      .prepare(`SELECT * FROM cards WHERE type = 'draft' AND json_extract(payload, '$.sentMessageId') = ? LIMIT 1`)
      .get(id) as DbRow | undefined;
    const card = r ? cardRow(r) : null;
    const p = card ? draftPayloadOf(card) : null;
    if (!card || !p || p.channel !== 'whatsapp' || p.delivered) return false;
    const proof = JSON.stringify({ kind: 'wa_delivered', waMessageId: id });
    const full = p.approvalCardId ? this.d.gate.byCard(p.approvalCardId) : null;
    this.d.db.transaction(() => {
      this.d.db.prepare('UPDATE approvals SET proof = ? WHERE id = ?').run(proof, p.approvalId);
      if (full) this.d.db.prepare('UPDATE approvals SET proof = ? WHERE id = ?').run(proof, full.id);
    })();
    // The card is published after the commit, so the renderer never sees a row a rollback could take back.
    this.h.setCard(card.id, { payload: { ...p, delivered: true } });
    return true;
  }

  /** The bridge is open again: the WhatsApp Drafts whose number could not be checked are checked now (08-3 §16.4.2). */
  async open(): Promise<void> {
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
      const card = this.h.card(String(r.id));
      const p = card ? draftPayloadOf(card) : null;
      if (!card || !p || card.state !== 'pending') continue;
      const { waCheck: _gone, ...rest } = p;
      void _gone;
      this.h.setCard(card.id, { payload: exists ? rest : { ...rest, waCheck: 'not_on' } });
    }
  }

  /** Local midnight came: Drafts held by the daily limit may send again. */
  liftLimit(): void {
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
      this.h.setCard(String(r.id), { payload: rest });
    }
  }
}
