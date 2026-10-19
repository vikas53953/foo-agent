// Spec: 08-2 §5.2 (onUserMessage: after the stop word, "if openChoiceCard(chat) && answersCard(m) → card.answered", before
// the yes-text G16 reply, steer and intake), 08-4 §26.6 (the typed-answer rules; rule 7: a tie posts "Did you mean {a} or
// {b}?" and the card stays open; rule 8: resolved_by 'typed'), 05-1 §5.3.4 (two open cards → the newest takes it; every
// way of answering gives the same result), §26.5 item 1 (an answer is not a steer), Art. 12 (a job's card is moved by the
// runner: the answer goes to it as card.answered would; a jobless card is written here).
import { t } from '../../shared/copy/t';
import type { Result } from '../../shared/errors';
import type { CardAnswer, CardRow } from '../../shared/types';
import type { EngineChat } from '../../main/db/queries';
import type { DbOp, DbTxReply } from '../protocol';
import { isStopCommand } from '../jobs/stopFlow';
import { pickCard, type AnswerableCard } from './typedAnswer';

export interface TypedHookDeps {
  now(): number;
  newId(prefix: 'm'): string;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
  tx(ops: DbOp[]): Promise<Result<DbTxReply>>;
  /** The runner's card.answered (JobRunner.onCardAnswered). */
  answerJobCard?(a: { cardId: string; answer: CardAnswer; choice?: string; resolvedBy: 'typed' }): Promise<void>;
}

const RUNNER_PURPOSES = new Set(['stop_which', 'fold_which']);

/** True when the message answered an open Choice or tiles card, or got the tie line (no intake turn then). */
export async function answerTyped(d: TypedHookDeps, m: { chatId: string; messageId: string; text: string }): Promise<boolean> {
  const text = m.text.trim();
  if (!text || isStopCommand(text)) return false;
  const open = ((await d.query<CardRow[]>('cardsOpenForChat', m.chatId)) ?? []).filter(
    (c) => (c.type === 'choice' || c.type === 'tiles') && c.state === 'asking',
  );
  if (!open.length) return false;
  const hit = pickCard(
    text,
    open.map((c) => ({ ...(c.payload as unknown as AnswerableCard), id: c.id, createdAt: c.createdAt, row: c })),
  );
  if (!hit) return false;
  const card = hit.card.row;
  const seen: DbOp = { op: 'update', table: 'messages', id: m.messageId, set: { status: 'complete', badge: null } };
  const now = d.now();

  if (hit.result.kind === 'tie') {
    const chat = await d.query<EngineChat>('chatOpen', m.chatId);
    const helperId = chat?.helperId ?? null;
    await d.tx([
      seen,
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: d.newId('m'),
          chat_id: m.chatId,
          author_kind: helperId ? 'helper' : 'foo',
          author_id: helperId,
          kind: 'text',
          text: t('thread.choice_typed.tie', { a: hit.result.a, b: hit.result.b }),
          status: 'complete',
          job_id: card.jobId,
          created_at: now,
        },
      },
    ]);
    return true;
  }
  if (hit.result.kind !== 'answer') return false;

  const answer = hit.result.answer;
  if (card.jobId !== null || RUNNER_PURPOSES.has(String(card.payload.purpose))) {
    if (!d.answerJobCard) return false;
    await d.answerJobCard({ cardId: card.id, answer, ...('optionId' in answer ? { choice: answer.optionId } : {}), resolvedBy: 'typed' });
    // The runner takes only the card its job waits on; when it left the card open, the message runs as a normal turn.
    const still = ((await d.query<CardRow[]>('cardsOpenForChat', m.chatId)) ?? []).some((c) => c.id === card.id && c.state === 'asking');
    if (still) return false;
    await d.tx([seen]);
    return true;
  }
  await d.tx([
    seen,
    {
      op: 'update',
      table: 'cards',
      id: card.id,
      set: { state: 'skip' in answer ? 'skipped' : 'answered', answer, resolved_by: 'typed', resolved_at: now },
    },
  ]);
  return true;
}
