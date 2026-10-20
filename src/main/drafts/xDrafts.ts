// Spec: 08-3 §16.3 + X-34 (X: no account and no approvals row; posting is a hand-back and foo never posts, AT-054; the
// weighted length, 280), 05-2 §5.7 X Draft variant (Change / Discard on the card alone; "Open in X to post" opens x.com's
// compose page prefilled; `opened_in_app` "Opened in X · not posted by {agentName}", foo's line "It's ready in X…"), 08-2
// §8.2 (`x.draft`, `x.openCompose`), 08-1 §3.2 (`app:openExternal` `x_intent`: the URL is built in main from the card),
// 06-3 §9.4 (Activity `opened_x_draft` "Opened an X post for you to send" · "foo · you").
// M8 T7: the X half of DraftService (split out so the service stays readable); DraftService routes to it.
import { t } from '../../shared/copy/t';
import { newId } from '../../shared/ids';
import { newNonce } from '../../shared/canon';
import { fail, ok, type Result } from '../../shared/errors';
import type { CardRow, DraftPayload } from '../../shared/types';
import { draftPayloadOf } from '../approvals/cardPayloads';
import { applyDbOps } from '../engine-supervisor/engineHost';
import type { Created } from '../approvals/ApprovalGate';
import { xIntentUrl, xRemaining } from './channels';
import type { DraftInput } from './DraftService';
import type { DraftHost } from './whatsappDrafts';

export class XDrafts {
  constructor(private readonly h: DraftHost) {}

  /** An X Draft (08-3 §16.3): a card only. Nothing is ever sent from it, so it has no approvals row and no expiry. */
  create(input: DraftInput): Result<Created> {
    const d = this.h.d;
    const job = d.db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(input.jobId) as { chat_id: string } | undefined;
    if (!job) return fail('JOB_GONE');
    const now = d.now();
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
      d.db,
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
          row: {
            id: cardId,
            chat_id: job.chat_id,
            message_id: messageId,
            job_id: input.jobId,
            type: 'draft',
            state: 'pending',
            payload,
            nonce,
            created_at: now,
          },
        },
      ],
      this.h.opts(now),
    );
    if (!w.result.ok) return w.result;
    d.changed(w.effects);
    return ok({ approvalId: '', cardId, nonce });
  }

  /** The X Draft the renderer holds, still `pending` (X has no approval, so the nonce and the state decide); null: not X. */
  pending(req: { cardId: string; nonce: string }): Result<{ card: CardRow; p: DraftPayload }> | null {
    const card = this.h.card(req.cardId);
    const p = card ? draftPayloadOf(card) : null;
    if (!card || p?.channel !== 'x') return null;
    if (card.nonce !== req.nonce || card.state !== 'pending') return fail('CARD_STALE');
    return ok({ card, p });
  }

  /** Change → Save on an X Draft: the card alone (no approval to re-hash), a new nonce, the weighted length again. */
  change(x: { card: CardRow; p: DraftPayload }, body: string): Result<CardRow> {
    this.h.d.db.prepare('UPDATE cards SET nonce = ? WHERE id = ?').run(newNonce(), x.card.id);
    if (!this.h.setCard(x.card.id, { payload: { ...x.p, body, edited: true, xRemaining: xRemaining(body) } })) return fail('CARD_STALE');
    return ok(this.h.card(x.card.id)!);
  }

  /** Discard on an X Draft: the card alone. */
  discard(x: { card: CardRow; p: DraftPayload }, resolvedBy: 'tap' | 'keyboard'): Result<CardRow> {
    const set = { payload: x.p, state: 'discarded', resolved_by: resolvedBy, resolved_at: this.h.d.now() };
    return this.h.setCard(x.card.id, set) ? ok(this.h.card(x.card.id)!) : fail('CARD_STALE');
  }

  /**
   * The ways an X draft opens: the card's button (`app:openExternal` `x_intent`, with its `nonce`, 08-1 §3.2) and
   * `x.openCompose` from the job (`jobId`, 08-2 §8.2). Both reach X's compose page through the card only; the URL is built
   * here. The first open moves the card to "Opened in X · not posted by {agentName}" with foo's line and Activity
   * `opened_x_draft`; a later one only opens the page again. A post over 280 weighted characters does not open.
   */
  async open(req: { cardId: string; jobId?: string; nonce?: string }): Promise<Result<void>> {
    const card = this.h.card(req.cardId);
    if (!card || card.type !== 'draft' || draftPayloadOf(card)?.channel !== 'x') return fail('URL_NOT_ALLOWED');
    if (req.jobId === undefined && req.nonce === undefined) return fail('URL_NOT_ALLOWED');
    if (req.jobId !== undefined && card.jobId !== req.jobId) return fail('URL_NOT_ALLOWED');
    if (req.nonce !== undefined && card.nonce !== req.nonce) return fail('CARD_STALE');
    const d = this.h.d;
    const p = draftPayloadOf(card)!;
    if (card.state === 'opened_in_app') {
      await d.openExternal?.(xIntentUrl(p.body));
      return ok(undefined);
    }
    if (card.state !== 'pending') return fail('CARD_STALE');
    if (xRemaining(p.body) < 0) return fail('VALIDATION');
    const now = d.now();
    const chat = d.db.prepare('SELECT title FROM chats WHERE id = ?').pluck().get(card.chatId) as string | null | undefined;
    const w = applyDbOps(
      d.db,
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
      this.h.opts(now),
    );
    if (!w.result.ok) return w.result;
    d.changed(w.effects);
    await d.openExternal?.(xIntentUrl(p.body));
    return ok(undefined);
  }
}
