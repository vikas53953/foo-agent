// Spec: 08-1 §3.2 rows `whatsapp:linkStart` / `whatsapp:linkCancel` / `whatsapp:unlink` and `chat:archive` (sender-checked,
// zod-validated through IpcRouter's handle(), answered with a Result).
import { handle } from '../ipc/IpcRouter';
import type { WhatsAppMain } from './waMain';

export function registerWhatsAppIpc(wa: WhatsAppMain): void {
  handle('whatsapp:linkStart', () => wa.linkStart());
  handle('whatsapp:linkCancel', () => wa.linkCancel());
  handle('whatsapp:unlink', () => wa.unlink());
  handle('chat:archive', ({ chatId, on }) => wa.archive(chatId, on));
}
