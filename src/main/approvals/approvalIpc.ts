// Spec: 08-1 §3.2 card:approve | decline | askAgain | heldPick; 08-2 §9.1, §9.5. Stub from M5-T1 (CR-0009): every row answers VALIDATION 'not_implemented' until M5-T4 fills it; the router line
// in src/main/ipc/IpcRouter.ts stays T1's.
import { fail } from '../../shared/errors';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';

const notYet = () => fail<never>('VALIDATION', 'not_implemented');

export function approvalIpc(ctx: AppContext): IpcHandlers<'card:approve' | 'card:decline' | 'card:askAgain' | 'card:heldPick'> {
  void ctx;
  return {
    'card:approve': notYet,
    'card:decline': notYet,
    'card:askAgain': notYet,
    'card:heldPick': notYet,
  };
}
