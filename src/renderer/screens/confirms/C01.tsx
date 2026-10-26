// Spec: 06-3 §14 C-1 (Chat options → "Clear messages…": "Clear messages in {Trips}?" / "Messages, cards and files in this
// chat are removed from your PC. Bookings, payments and your activity log stay. This can't be undone." / [ Clear messages ]
// [ Cancel ]; destructive order, Cancel holds focus; `dialog-c-01`), CR-0060 `chat:clear { chatId, confirm: true }`.
// Mounted once by the shell; the chat is `ui.dialogTarget` (chat header ⋯ and the chat-list row menu both set it).
import { t } from '../../../shared/copy/t';
import { invoke } from '../../ipc/client';
import { closeDialog, useStore } from '../../store/index';
import { Dialog } from '../../ui/Dialog';

export function C01() {
  const open = useStore((s) => s.ui.dialog === 'c-01');
  const chatId = useStore((s) => s.ui.dialogTarget);
  const name = useStore((s) => (s.ui.dialogTarget ? (s.chats.byId[s.ui.dialogTarget]?.title ?? '') : ''));
  if (!open || !chatId) return null;
  return (
    <Dialog
      tid="dialogC01"
      destructive
      title={t('dialog.c_01.title', { name })}
      body={t('dialog.c_01.body')}
      primary={t('dialog.c_01.primary')}
      secondary={t('dialog.c_01.secondary')}
      onPrimary={() => {
        closeDialog();
        void invoke('chat:clear', { chatId, confirm: true });
      }}
      onClose={closeDialog}
    />
  );
}
