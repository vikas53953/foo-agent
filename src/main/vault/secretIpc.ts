// Spec: 08-1 §3.2 secret:save | list | delete, code:submit; 08-2 §11.2–§11.3. Stub from M5-T1 (CR-0009): every row answers VALIDATION 'not_implemented' until M5-T2 fills it; the router line
// in src/main/ipc/IpcRouter.ts stays T1's.
import { fail } from '../../shared/errors';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';

const notYet = () => fail<never>('VALIDATION', 'not_implemented');

export function secretIpc(ctx: AppContext): IpcHandlers<'secret:save' | 'secret:list' | 'secret:delete' | 'code:submit'> {
  void ctx;
  return {
    'secret:save': notYet,
    'secret:list': notYet,
    'secret:delete': notYet,
    'code:submit': notYet,
  };
}
