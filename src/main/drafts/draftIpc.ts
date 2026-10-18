// Spec: 08-1 §3.2 draft:update | send | undo | discard | openInApp; 08-0 §G.7 (X-65). Stub from M5-T1 (CR-0009): every row answers VALIDATION 'not_implemented' until M5-T6 fills it; the router line
// in src/main/ipc/IpcRouter.ts stays T1's.
import { fail } from '../../shared/errors';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';

const notYet = () => fail<never>('VALIDATION', 'not_implemented');

export function draftIpc(ctx: AppContext): IpcHandlers<'draft:update' | 'draft:send' | 'draft:undo' | 'draft:discard' | 'draft:openInApp'> {
  void ctx;
  return {
    'draft:update': notYet,
    'draft:send': notYet,
    'draft:undo': notYet,
    'draft:discard': notYet,
    'draft:openInApp': notYet,
  };
}
