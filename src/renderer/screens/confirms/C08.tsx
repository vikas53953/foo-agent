// Spec: 06-3 §14 C-8 (WhatsApp group → "Hide from foo": "Hide {Family group} from foo?" / "It stays in WhatsApp. I'll stop
// reading it." / [ Hide ] [ Cancel ]; destructive order, Cancel holds focus; after: the row is removed and can be shown
// again in Settings → Connections → WhatsApp; `dialog-c-08`), 08-1 §3.2 `chat:archive { chatId, on: true }`.
import { t } from '../../../shared/copy/t';
import { Dialog } from '../../ui/Dialog';

export interface C08Props {
  group: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function C08({ group, onConfirm, onClose }: C08Props) {
  return (
    <Dialog
      tid="dialogC08"
      destructive
      title={t('dialog.c_08.title', { group })}
      body={t('dialog.c_08.body')}
      primary={t('dialog.c_08.primary')}
      secondary={t('dialog.c_08.secondary')}
      onPrimary={onConfirm}
      onClose={onClose}
    />
  );
}
