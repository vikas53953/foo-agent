// Spec: 04 §13.5 (a kit surface in foo's reply: each complete A2UI message draws at once, an incomplete one is held back;
// an invalid or unknown component is dropped with a quiet "Couldn't show part of this" caption and the words still show),
// CR-0022 AT-354 (parser half), X-180. R1 T1 lands this placeholder so the bubble dispatcher has its case; R1 T2 replaces
// the empty surface with KitSurface (renderer/kit/KitSurface*, model.ts).
import { useMemo } from 'react';
import { t } from '../../shared/copy/t';
import { parseKitBlock } from '../../shared/kit/parse';
import { TID } from '../../shared/testids';
import { useStreamFade } from '../messages/streamFade';
import styles from './KitBlock.module.css';

export function KitBlock({ body }: { body: string; closed: boolean }) {
  // The reply's real streaming state (the fade context is null once it ends): an unclosed fence left when the reply ends
  // drops its unfinished last message instead of holding it back forever.
  const streaming = useStreamFade() !== null;
  const parsed = useMemo(() => parseKitBlock(body, streaming), [body, streaming]);
  return (
    <div className={styles.block}>
      <div className={styles.surface} data-testid={TID.kitSurface} data-messages={parsed.messages.length} />
      {parsed.dropped > 0 && (
        <p className={styles.dropped} data-testid={TID.kitDropped}>
          {t('kit.surface.dropped')}
        </p>
      )}
    </div>
  );
}
