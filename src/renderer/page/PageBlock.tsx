// Spec: 04 §13.6 (an AI page in foo's reply: HTML only, ≤ 512 KB, shown in the sealed frame; the status line shows first
// until the fence closes and the reply ends; states building, ready, failed, kept), CR-0022 AT-359, AT-362, X-180.
// The n-th ```page fence of the reply is page `index` n, the same count main's page:open makes over the stored text.
import { useMemo } from 'react';
import { parsePageBlock } from '../../shared/kit/parse';
import { useStore } from '../store/index';
import { useBubble } from '../messages/bubbleContext';
import { parseBlocks } from '../messages/markdownParse';
import { useStreamFade } from '../messages/streamFade';
import { PageView } from './PageView';

export function PageBlock({ body, closed }: { body: string; closed: boolean }) {
  const { chatId, messageId } = useBubble();
  const streaming = useStreamFade() !== null;
  const page = useMemo(() => parsePageBlock(body, closed, streaming), [body, closed, streaming]);
  const text = useStore((s) => s.messages.byChat[chatId]?.byId[messageId]?.text ?? '');
  const index = useMemo(() => {
    const bodies = parseBlocks(text).flatMap((b) => (b.t === 'page' ? [b.body] : []));
    return Math.max(0, bodies.indexOf(body));
  }, [text, body]);
  const state = page.tooLarge ? 'failed' : page.complete ? 'ready' : 'building';
  return <PageView chatId={chatId} source={{ messageId, index }} state={state} tooLarge={page.tooLarge} />;
}
