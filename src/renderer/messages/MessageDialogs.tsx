// Spec: 04 §6.3 / 06-3 §14 C-24 (delete one message: "Delete this message?", body for the user's own bubble or for foo's /
// a helper's (§17.4), Destructive "Delete" + "Cancel" with Cancel focused), §1.9 C-25 (delete the selected messages:
// "Delete {count} messages?"; the selection ends after), §13 C-26 (a link whose text names another domain: "Open {domain}"
// Primary, "Not now" Secondary); 06 §0.3 dialog anatomy (ui/Dialog). The dialogs read the targets the message list stored
// (`messages.pendingDelete`, `ui.selection`, `messages.pendingLink`).
import { t } from '../../shared/copy/t';
import { closeDialog, update, useStore } from '../store/index';
import { deleteMessages } from '../store/messages';
import { selectAgentName } from '../store/settings';
import { Dialog } from '../ui/Dialog';
import { openUrl } from './linkActions';

export function MessageDialogs({ chatId }: { chatId: string }) {
  const dialog = useStore((s) => s.ui.dialog);
  const agentName = useStore(selectAgentName);
  const pendingDelete = useStore((s) => s.messages.pendingDelete);
  const selection = useStore((s) => s.ui.selection);
  const link = useStore((s) => s.messages.pendingLink);
  const first = useStore((s) => (pendingDelete[0] ? s.messages.byChat[chatId]?.byId[pendingDelete[0]] : undefined));

  const close = () => {
    closeDialog();
    update((s) => {
      s.messages.pendingDelete = [];
      s.messages.pendingLink = null;
    });
  };

  if (dialog === 'c-24' && pendingDelete.length)
    return (
      <Dialog
        tid="dialogC24"
        destructive
        title={t('dialog.c_24.title')}
        body={first?.authorKind === 'user' ? t('dialog.c_24.body_mine', { agentName }) : t('dialog.c_24.body_other')}
        primary={t('dialog.c_24.primary')}
        secondary={t('dialog.c_24.secondary')}
        onClose={close}
        onPrimary={() => {
          const ids = pendingDelete;
          close();
          void deleteMessages(ids);
        }}
      />
    );
  if (dialog === 'c-25' && selection.size)
    return (
      <Dialog
        tid="dialogC25"
        destructive
        title={t('dialog.c_25.title', { count: selection.size })}
        body={t('dialog.c_25.body', { agentName })}
        primary={t('dialog.c_25.primary')}
        secondary={t('dialog.c_25.secondary')}
        onClose={close}
        onPrimary={() => {
          const ids = [...selection];
          close();
          update((s) => {
            s.ui.selection = new Set();
          });
          void deleteMessages(ids);
        }}
      />
    );
  if (dialog === 'c-26' && link)
    return (
      <Dialog
        tid="dialogC26"
        title={t('dialog.c_26.title', { domain: link.domain })}
        body={t('dialog.c_26.body', { shown: link.shown, domain: link.domain })}
        primary={t('dialog.c_26.primary', { domain: link.domain })}
        secondary={t('dialog.c_26.secondary')}
        onClose={close}
        onPrimary={() => {
          const url = link.url;
          close();
          openUrl(url);
        }}
      />
    );
  return null;
}
