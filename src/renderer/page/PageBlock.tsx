// Spec: 04 §13.6 (an AI page in foo's reply: HTML only, ≤ 512 KB, shown in the sealed frame; states building, ready,
// failed, kept), CR-0022 AT-359, AT-362, X-180. R1 T1 lands this placeholder so the bubble dispatcher has its case; R1 T5
// replaces it with the sealed frame served from `foo-page://{pageId}` (renderer/page/**, main/page/**).
import { useMemo } from 'react';
import { parsePageBlock } from '../../shared/kit/parse';
import { TID } from '../../shared/testids';

export function PageBlock({ body, closed }: { body: string; closed: boolean }) {
  const page = useMemo(() => parsePageBlock(body, closed, !closed), [body, closed]);
  const state = page.tooLarge ? 'failed' : page.complete ? 'ready' : 'building';
  return <div data-testid={TID.aiPage} data-state={state} hidden />;
}
