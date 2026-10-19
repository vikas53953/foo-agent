// Spec: 08-1 §3.2 card:answer (CardRow; CARD_STALE, CARD_EXPIRED), 05-1 §5.3–§5.4. M5-T5 fills the M5-T1 stub; the router
// line in src/main/ipc/IpcRouter.ts stays T1's. The checks and writes are in answerCard.ts (no Electron, unit-tested).
import { deps } from '../deps';
import { chatRowById } from '../store/queries';
import { emit, listContext, type AppContext, type IpcHandlers } from '../ipc/IpcRouter';
import { answerCard, onCardReaction, type AnswerDeps } from './answerCard';

export function answerDeps(ctx: AppContext): AnswerDeps {
  return {
    db: ctx.db,
    now: () => deps.clock.now(),
    engine: ctx.engine,
    emitCard: (row) => emit('card:upsert', row),
    emitMessage: (row) => emit('message:upsert', row),
    emitChat: (chatId) => {
      const row = chatRowById(ctx.db, listContext(ctx.settings.get()), chatId);
      if (row) emit('chat:upsert', row);
    },
  };
}

export function answerIpc(ctx: AppContext): IpcHandlers<'card:answer'> {
  const d = answerDeps(ctx);
  return {
    'card:answer': (req) => answerCard(d, req),
  };
}

/** M5-T5: message:react on a card's bubble (the reaction answers of 08-4 §26.6 rule 4 and the G16 line, 08-2 §5.2.2). */
export function cardReaction(ctx: AppContext, messageId: string, emoji: string): void {
  onCardReaction(answerDeps(ctx), messageId, emoji);
}
