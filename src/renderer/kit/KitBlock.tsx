// Spec: 04 §13.5 (a kit surface in foo's reply: each complete A2UI message draws at once, an incomplete one is held back;
// an invalid or unknown component is dropped with a quiet "Couldn't show part of this" caption and the words still show; a
// later reply that names the same surfaceId updates it), CR-0022 AT-353, AT-354, AT-355, X-180. R1 T2 replaces T1's
// placeholder: the block draws its surfaces with KitSurface (renderer/kit/model.ts folds the chat's later fences in).
import { useBubble } from '../messages/bubbleContext';
import { useStreamFade } from '../messages/streamFade';
import { KitDropped, KitSurface } from './KitSurface';
import { useFenceSurfaces } from './model';
import styles from './KitBlock.module.css';

export function KitBlock({ body }: { body: string; closed: boolean }) {
  // The reply's real streaming state (the fade context is null once it ends): an unclosed fence left when the reply ends
  // drops its unfinished last message instead of holding it back forever.
  const streaming = useStreamFade() !== null;
  const bubble = useBubble();
  const { surfaces, dropped, pending } = useFenceSurfaces(bubble.chatId, bubble.messageId, body, streaming);
  const host = { chatId: bubble.chatId, messageId: bubble.messageId };
  return (
    <div className={styles.block} data-pending={pending || undefined}>
      {surfaces.map((s, i) => (
        <KitSurface
          key={s.id}
          surface={s}
          host={host}
          agentName={bubble.agentName}
          blockDropped={i === surfaces.length - 1 ? dropped : 0}
        />
      ))}
      {surfaces.length === 0 && dropped > 0 && <KitDropped />}
    </div>
  );
}
