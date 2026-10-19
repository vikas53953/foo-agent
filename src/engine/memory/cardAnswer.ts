// Spec: 05-1 §5.3.3 (`cards.state`: asking → answered | skipped; `resolved_by`), 08-4 §25.1 CardAnswer, CR-0010 G-M6-21
// (a `memory_confirm` card is the engine's to move). One shape for every memory seam that answers its own card.
import type { CardAnswer, CardRow } from '../../shared/types';
import type { DbOp } from '../protocol';

/** The answer main forwarded: the full CardAnswer, else the bare option id, else a skip. */
export function answerOf(a: { answer?: CardAnswer; choice?: string }): CardAnswer {
  return a.answer ?? (a.choice ? { optionId: a.choice } : { skip: true });
}

/** Moves an `asking` card to answered / skipped; `expectRev` stops a second, racing answer. */
export function resolveCardOp(card: CardRow, answer: CardAnswer, resolvedBy: string | undefined, now: number): DbOp {
  return {
    op: 'update',
    table: 'cards',
    id: card.id,
    set: { state: 'skip' in answer ? 'skipped' : 'answered', answer, resolved_by: resolvedBy ?? 'tap', resolved_at: now },
    expectRev: card.rev,
  };
}
