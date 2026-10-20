// Spec: 04 §10.11 (Send in a mirrored WhatsApp group creates a `whatsapp.draft` in foo's chat and the mirror shows the marker
// line "Draft ready in {agentName}'s chat." with Link "Open"; nothing is stored in the mirror), 10-acceptance-1 AT-269. M8 T7:
// the markers this window made, per mirror, in send order. They are the renderer's own lines (the mirror lists only
// WhatsApp's messages), kept until the app restarts.
import { useSyncExternalStore } from 'react';

export interface MirrorDraftMark {
  draftCardId: string;
  fooChatId: string;
  at: number;
}

const byChat = new Map<string, readonly MirrorDraftMark[]>();
const listeners = new Set<() => void>();
const NONE: readonly MirrorDraftMark[] = [];

export function noteMirrorDraft(chatId: string, mark: MirrorDraftMark): void {
  byChat.set(chatId, [...(byChat.get(chatId) ?? NONE), mark]);
  for (const l of listeners) l();
}

export function useMirrorDrafts(chatId: string): readonly MirrorDraftMark[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => byChat.get(chatId) ?? NONE,
  );
}
