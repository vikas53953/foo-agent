// Spec: 08-1 §3.2 card:answer (CardRow; CARD_STALE, CARD_EXPIRED), 05-1 §5.3–§5.4. Stub from M5-T1 (CR-0009): every row answers VALIDATION 'not_implemented' until M5-T5 fills it; the router line
// in src/main/ipc/IpcRouter.ts stays T1's.
import { fail } from '../../shared/errors';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';

const notYet = () => fail<never>('VALIDATION', 'not_implemented');

export function answerIpc(ctx: AppContext): IpcHandlers<'card:answer'> {
  void ctx;
  return {
    'card:answer': notYet,
  };
}
