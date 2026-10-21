// Spec: 08-1 §3.2 card:answer (CardRow; CARD_STALE, CARD_EXPIRED), 05-1 §5.3–§5.4. M5-T5 fills the M5-T1 stub; the router
// line in src/main/ipc/IpcRouter.ts stays T1's. The checks and writes are in answerCard.ts (no Electron, unit-tested).
// M8 T6: on a Draft card the one answer is 05-2 §5.7.2 Offline at Send's [ Yes, send when online ] (DraftService).
import { deps } from '../deps';
import { chatRowById, publicSettings } from '../store/queries';
import { emitFinderWrite } from '../setup/aiFinderIpc'; // CR-0026
import { vibeAnswered } from '../setup/firstRun'; // CR-0026
import { emit, listContext, type AppContext, type IpcHandlers } from '../ipc/IpcRouter';
import { answerCard, onCardReaction, type AnswerDeps } from './answerCard';
// M8 T6
import { fail } from '../../shared/errors';
import { draftService } from '../drafts/draftIpc';

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
    // CR-0026: Card 2c (the vibe) is a jobless Choice card; once written, by a tap, a reaction or the toast, first run says
    // the vibe line and completes.
    onAnswered: (row) => {
      if ((row.payload as { setupCard?: string }).setupCard !== 'vibe') return;
      emitFinderWrite(ctx, vibeAnswered(ctx.db, ctx.settings, row, deps.clock.now(), ctx.dataDir));
      emit('settings:changed', publicSettings(ctx.settings.get()));
    },
  };
}

export function answerIpc(ctx: AppContext): IpcHandlers<'card:answer'> {
  const d = answerDeps(ctx);
  return {
    'card:answer': (req) => {
      // M8 T6 (05-2 §5.7.2 Offline at Send): a Draft's [ Yes, send when online ] is its one card answer.
      const type = ctx.db.prepare('SELECT type FROM cards WHERE id = ?').pluck().get(req.cardId) as string | undefined;
      if (type === 'draft') {
        const pick = (req.answer as { optionId?: unknown }).optionId;
        return pick === 'send_when_online' ? draftService(ctx).queueOffline(req) : fail('VALIDATION');
      }
      return answerCard(d, req);
    },
  };
}

/** M5-T5: message:react on a card's bubble (the reaction answers of 08-4 §26.6 rule 4 and the G16 line, 08-2 §5.2.2). */
export function cardReaction(ctx: AppContext, messageId: string, emoji: string): void {
  onCardReaction(answerDeps(ctx), messageId, emoji);
}
