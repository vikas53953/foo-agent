// Spec: 06-3 §14 C-10 ("Disconnect Google?" / body + one line per routine using Gmail, Calendar or Contacts: "Your
// "{Airtel bill}" routine uses {Gmail}. It will stop working." / [ Disconnect Google ] [ Cancel ]; result: the three rows
// "Not connected", vault entry deleted, access revoked at Google now or when back online, Activity `disconnected`), 06 §0.3
// (destructive order, Cancel focused), 08-1 §3.2 connection:disconnect { connectionId; confirm: true }.
import { t } from '../../../shared/copy/t';
import { invoke } from '../../ipc/client';
import { closeDialog, useStore } from '../../store/index';
import { selectConnections } from '../../store/connections';
import { Dialog } from '../../ui/Dialog';
import { useGoogleInfo } from '../../cards/connect/useGoogleInfo';

const APP = {
  gmail: () => t('settings.connections.app.gmail'),
  gcal: () => t('settings.connections.app.calendar'),
  contacts: () => t('settings.connections.app.contacts'),
};

export function C10DisconnectGoogle() {
  const open = useStore((s) => s.ui.dialog === 'c-10');
  const row = useStore(selectConnections).find((r) => ['gmail', 'gcal', 'contacts'].includes(r.app) && r.status !== 'disconnected');
  const info = useGoogleInfo(open);
  if (!open || !row) return null;
  const body = [
    t('dialog.c_10.body'),
    ...(info?.routines ?? []).map((r) => t('dialog.c_10.body_routine', { routine: r.title, app: APP[r.app]() })),
  ].join(' ');
  return (
    <Dialog
      tid="dialogC10"
      destructive
      title={t('dialog.c_10.title')}
      body={body}
      primary={t('dialog.c_10.primary')}
      secondary={t('dialog.c_10.secondary')}
      onClose={closeDialog}
      onPrimary={() => {
        closeDialog();
        void invoke('connection:disconnect', { connectionId: row.id, confirm: true }).catch(() => undefined);
      }}
    />
  );
}
