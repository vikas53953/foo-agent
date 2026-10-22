// Spec: 06-3 §14 C-13 (tray / ⋯ → "Stop everything": "Stop all {3} jobs that are running?" / "Routines keep their schedule.
// Nothing that's already done is undone." / [ Stop all ] [ Cancel ]; destructive order, Cancel holds focus; after: the J18
// combined stop report in foo's chat, Activity `stopped_all`; `dialog-c-13`), 08-1 §3.2 `job:stopAll { confirm: true }`,
// CR-0030 pick 2 (one running job reads "Stop the job that's running?").
import { t } from '../../../shared/copy/t';
import { Dialog } from '../../ui/Dialog';

export interface C13Props {
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function C13({ count, onConfirm, onClose }: C13Props) {
  return (
    <Dialog
      tid="dialogC13"
      destructive
      title={count === 1 ? t('dialog.c_13.title_one') : t('dialog.c_13.title', { count })}
      body={t('dialog.c_13.body')}
      primary={t('dialog.c_13.primary')}
      secondary={t('dialog.c_13.secondary')}
      onPrimary={onConfirm}
      onClose={onClose}
    />
  );
}
