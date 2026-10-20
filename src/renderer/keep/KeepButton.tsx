// Spec: CR-0022 pick 9 ("Keep" saves a kit surface or an AI page so it can be found again; it then shows in the chat's Files
// tab), 08-1 §3.2 `keep:save` (the PNG snapshot is taken of what the user sees), AT-369, X-180. R1 T7. Test id `kit-keep`.
import { useState, type RefObject } from 'react';
import { t } from '../../shared/copy/t';
import type { InvokeIn } from '../../shared/ipc';
import { TID } from '../../shared/testids';
import { Button } from '../ui/Button';
import { keep, rectOf, useKept } from './kept';

export function KeepButton({
  keepKey,
  kept: keptBefore = false,
  target,
  request,
}: {
  /** Names the surface or page: its host plus the surface id or page index. */
  keepKey: string;
  /** Already kept before this run (a card in its `kept` state). */
  kept?: boolean;
  /** The box the snapshot is taken of. */
  target: RefObject<Element | null>;
  /** The `keep:save` request as the thing is drawn now. */
  request: () => Omit<InvokeIn['keep:save'], 'rect'>;
}) {
  const keptNow = useKept(keepKey);
  const [busy, setBusy] = useState(false);
  const done = keptBefore || keptNow;
  return (
    <Button
      variant="subtle"
      icon={done ? 'Checkmark' : 'Pin'}
      data-testid={TID.kitKeep}
      data-state={done ? 'kept' : 'idle'}
      disabled={done || busy}
      onClick={() => {
        setBusy(true);
        void keep(keepKey, { ...request(), rect: rectOf(target.current) }).finally(() => setBusy(false));
      }}
    >
      {done ? t('kit.keep.done') : t('kit.keep.button')}
    </Button>
  );
}
