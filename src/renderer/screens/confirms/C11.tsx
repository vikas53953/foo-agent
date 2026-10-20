// Spec: 06-3 §14 C-11 (Connections → WhatsApp "Unlink": "Unlink WhatsApp?" / "I'll stop reading your chats and can't draft
// WhatsApp messages. Your phone keeps everything." / [ Unlink ] [ Cancel ]; destructive order, Cancel holds focus; after:
// the linked device is logged out, the session file deleted, Activity `disconnected` "Disconnected WhatsApp"; `dialog-c-11`),
// 08-1 §3.2 `whatsapp:unlink`.
import { t } from '../../../shared/copy/t';
import { Dialog } from '../../ui/Dialog';

export interface C11Props {
  onConfirm: () => void;
  onClose: () => void;
}

export function C11({ onConfirm, onClose }: C11Props) {
  return (
    <Dialog
      tid="dialogC11"
      destructive
      title={t('dialog.c_11.title')}
      body={t('dialog.c_11.body')}
      primary={t('dialog.c_11.primary')}
      secondary={t('dialog.c_11.secondary')}
      onPrimary={onConfirm}
      onClose={onClose}
    />
  );
}
