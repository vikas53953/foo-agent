// Spec: 08-1 §3.2 `chat:archive { chatId; on }` (06-3 C-8 "Hide from foo" with `on: true`, the 06-2 §6.8 "Groups I read" row
// with `on: false`): one call for both, so the Settings list knows every group hidden in this window.
import type { ChatRow } from '../../../../shared/types';
import { invoke } from '../../../ipc/client';
import { update } from '../../../store/index';

export async function archiveMirror(chatId: string, on: boolean): Promise<ChatRow | null> {
  const r = await invoke('chat:archive', { chatId, on });
  if (!r.ok) return null;
  update((s) => {
    if (on) s.connections.hiddenMirrors[chatId] = r.value;
    else delete s.connections.hiddenMirrors[chatId];
  });
  return r.value;
}
