// Spec: 06-3 §14 C-3 (Memory ⋯ → "Forget everything from {Gmail}": "Forget {23} things I learned from your {Gmail}?" /
// "{Gmail} stays connected. I just forget what I learned." / [ Forget {23} things ] [ Cancel ]; destructive, Cancel holds
// focus, `role="alertdialog"`; after: status "Forgot {23} things." with no undo; `dialog-c-03`), CR-0010 G-M6-07 (built in
// M6, M13 reuses it).
import { t } from '../../../shared/copy/t';
import { Dialog } from '../../ui/Dialog';

export interface C03Props {
  app: string;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function C03({ app, count, onConfirm, onClose }: C03Props) {
  return (
    <Dialog
      tid="dialogC03"
      destructive
      title={t('dialog.c_03.title', { count, app })}
      body={t('dialog.c_03.body', { app })}
      primary={t('dialog.c_03.primary', { count })}
      secondary={t('dialog.c_03.secondary')}
      onPrimary={onConfirm}
      onClose={onClose}
    />
  );
}
