// Spec: 08-3 §12.5.1 (a helper turn in a group calls `memory.askShare { factId; groupChatId; why ≤ 80 }`, class `prepare`;
// the engine posts in that helper's 1:1 chat a Choice card, `purpose='memory_confirm'`, `reversible:false`, prompted: "Okay
// to tell the {Goa trip} group {you're vegetarian on Tuesdays}?" [ Yes ] [ No ]; Yes → `memory_group_grants(fact_id,
// chat_id, until = now + 24 h)`; No → never asked again for that fact and group, suggestion key
// `memory_share:{factId}:{groupChatId}`; a fact that is sensitive under §12.4.1 cannot be shared even on Yes: the tool
// returns PRIVATE_BLOCKED and the helper says "That one stays between us."; the group never sees the question), §12.8,
// §15.7 (a dismissed key blocks the offer forever), 08-0 §G.13, Art. 14, Art. 20, X-112. A private fact is never put into a
// group turn (§12.5, Art. 14), so it is blocked the same way.
import type { EngineChat, EngineFact } from '../../main/db/queries';
import type { Clock } from '../../shared/clock';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import type { CardAnswer, CardRow, ChoicePayload } from '../../shared/types';
import type { DbOp, MainLink } from '../protocol';
import { isSensitive } from './sensitive';

/** §12.5.1: a Yes lets the fact into that group's prompts for 24 hours. */
export const SHARE_GRANT_MS = 24 * 3_600_000;
export const SHARE_WHY_MAX = 80;

export interface AskShareRequest {
  factId: string;
  groupChatId: string;
  why: string;
  /** The helper whose group turn asked (its 1:1 chat gets the card). */
  helperId: string;
}
export type AskShareResult = { asked: true; cardId: string } | { asked: false; reason: 'dismissed' | 'open' };

export interface AskShareDeps {
  link: MainLink;
  clock: Clock;
  newId: (prefix: 'm' | 'k' | 'sg') => string;
  newNonce: () => string;
}

/** §15.7 key for one fact and one group. */
export function shareKey(factId: string, groupChatId: string): string {
  return `memory_share:${factId}:${groupChatId}`;
}

/** The fact may never reach a group: sensitive by the §12.4.1 rule (category or pattern), or private. */
export function shareBlocked(f: Pick<EngineFact, 'text' | 'category' | 'kind' | 'file' | 'private' | 'sensitive'>): boolean {
  return f.private || f.sensitive || isSensitive({ text: f.text, category: f.category ?? 'other', kind: f.kind, file: f.file });
}

export class MemoryShare {
  constructor(private readonly d: AskShareDeps) {}

  /** `memory.askShare`: the Choice card in the helper's 1:1 chat, or PRIVATE_BLOCKED with the helper's line. */
  async ask(req: AskShareRequest): Promise<Result<AskShareResult>> {
    if (!req.why.trim() || [...req.why].length > SHARE_WHY_MAX) return fail('VALIDATION');
    const fact = await this.query<EngineFact>('memory.byId', [req.factId]);
    if (!fact) return fail('NOT_FOUND');
    if (shareBlocked(fact)) return fail('PRIVATE_BLOCKED', t('thread.memory.stays_private'));
    const group = await this.query<EngineChat>('chatOpen', [req.groupChatId]);
    if (group?.kind !== 'group') return fail('VALIDATION');
    const key = shareKey(req.factId, req.groupChatId);
    const state = await this.query<string>('suggestionState', [key]);
    if (state === 'dismissed') return ok({ asked: false, reason: 'dismissed' });
    if (state === 'offered') return ok({ asked: false, reason: 'open' });
    const home = await this.query<EngineChat>('chats.forHelper', [req.helperId]);
    if (!home) return fail('NOT_FOUND');
    const now = this.d.clock.now();
    const messageId = this.d.newId('m');
    const cardId = this.d.newId('k');
    const question = t('cards.choice.question.memory_share', { group: group.title, fact: fact.text });
    const payload: ChoicePayload & { share: { factId: string; groupChatId: string } } = {
      purpose: 'memory_confirm',
      question,
      options: [
        { id: 'o1', label: t('cards.choice.option.yes') },
        { id: 'o2', label: t('cards.choice.option.no') },
      ],
      aiReversible: false,
      reversible: false,
      livePrices: false,
      share: { factId: req.factId, groupChatId: req.groupChatId },
    };
    const r = await this.d.link.request('db.tx', {
      ops: [
        {
          op: 'insert',
          table: 'suggestions',
          row: { id: this.d.newId('sg'), key, kind: 'memory_share', text: question, state: 'offered', offered_at: now },
        },
        {
          op: 'insert',
          table: 'messages',
          row: {
            id: messageId,
            chat_id: home.id,
            author_kind: 'helper',
            author_id: req.helperId,
            kind: 'card',
            card_id: cardId,
            status: 'complete',
            prompted: 1,
            created_at: now,
          },
        },
        {
          op: 'insert',
          table: 'cards',
          row: {
            id: cardId,
            chat_id: home.id,
            message_id: messageId,
            job_id: null,
            type: 'choice',
            state: 'asking',
            payload,
            nonce: this.d.newNonce(),
            created_at: now,
          },
        },
      ] satisfies DbOp[],
    });
    return r.ok ? ok({ asked: true, cardId }) : r;
  }

  /** The card's answer. A `memory_confirm` card is the engine's (main hands it over, M6 T5), so this moves the card out of
   * `asking` too. Yes → a 24 h grant; No → the key dismissed for good. True when the card was a share card. The sensitive
   * rule is checked again: the fact may have changed since the question. */
  async onCardAnswered(a: { cardId: string; answer?: CardAnswer; choice?: string; resolvedBy?: string }): Promise<boolean> {
    const card = await this.query<CardRow>('cardById', [a.cardId]);
    const share = card?.payload.share as { factId?: unknown; groupChatId?: unknown } | undefined;
    if (card?.type !== 'choice' || card.payload.purpose !== 'memory_confirm' || !share) return false;
    const now = this.d.clock.now();
    const answer: CardAnswer = a.answer ?? (a.choice ? { optionId: a.choice } : { skip: true });
    const choice = 'optionId' in answer ? answer.optionId : undefined;
    // Already answered (a second tap, or a stale one): nothing more to write. expectRev stops a racing second answer.
    if (card.state !== 'asking') return true;
    const resolve: DbOp[] = [
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { state: 'skip' in answer ? 'skipped' : 'answered', answer, resolved_by: a.resolvedBy ?? 'tap', resolved_at: now },
        expectRev: card.rev,
      },
    ];
    const factId = String(share.factId ?? '');
    const groupChatId = String(share.groupChatId ?? '');
    if (!factId || !groupChatId || (choice !== 'o1' && choice !== 'o2')) {
      await this.d.link.request('db.tx', { ops: resolve });
      return true;
    }
    const key = shareKey(factId, groupChatId);
    const decided = (state: 'accepted' | 'dismissed'): DbOp => ({
      op: 'insert',
      table: 'suggestions',
      row: {
        id: this.d.newId('sg'),
        key,
        kind: 'memory_share',
        text: String(card.payload.question ?? ''),
        state,
        offered_at: card.createdAt,
        decided_at: now,
      },
    });
    if (choice === 'o2') {
      await this.d.link.request('db.tx', { ops: [...resolve, decided('dismissed')] });
      return true;
    }
    const fact = await this.query<EngineFact>('memory.byId', [factId]);
    if (!fact || shareBlocked(fact)) {
      await this.d.link.request('db.tx', { ops: resolve });
      return true;
    }
    await this.d.link.request('db.tx', {
      ops: [
        ...resolve,
        decided('accepted'),
        { op: 'insert', table: 'memory_group_grants', row: { fact_id: factId, chat_id: groupChatId, until: now + SHARE_GRANT_MS } },
      ],
    });
    return true;
  }

  private async query<T>(q: string, args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }
}
