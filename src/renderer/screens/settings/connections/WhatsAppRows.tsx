// Spec: 06-2 §6.8 Connections, WhatsApp row group (`settings-row-connections-whatsapp`): header `--t-body-strong` "WhatsApp",
// status "Linked · {+91 98••• ••210}" / "WhatsApp unlinked foo." (`--warn`) / "Not linked"; buttons "Unlink" (→ 06-3 §14 C-11)
// / Primary "Link again" / Primary "Link WhatsApp" (→ `dialog-link-whatsapp`); detail rows Toggle "Read my chats"
// (`connections.whatsapp.read`), Toggle "Draft messages for me" (`connections.whatsapp.draft`), "Groups I read"
// (`settings-row-connections-w-hidden`, one row per linked group, `data-row-id` = jid; off → `chat:archive { on: true }` adds
// the jid to `hiddenJids`, on → `chat:archive { on: false }`, 08-1 §3.2), note `--t-small` `--fg-2` "WhatsApp may unlink foo
// now and then…"; Offline: Link disabled with the offline tooltip, Unlink still works. The `error` row (the bridge gave up,
// 08-1 §2.1) reads as unlinked: Link again. Hidden groups are listed while this window knows their names (a hidden mirror
// leaves the chat list; implementation-notes "M8 T3").
import { useMemo } from 'react';
import { t } from '../../../../shared/copy/t';
import { TID } from '../../../../shared/testids';
import type { ChatRow } from '../../../../shared/types';
import { invoke } from '../../../ipc/client';
import { closeDialog, openDialog, update, useStore } from '../../../store/index';
import { archiveMirror } from './archiveMirror';
import { selectHiddenMirrors, selectWhatsAppRow } from '../../../store/connections';
import { selectConnection } from '../../../store/live';
import { selectSettings } from '../../../store/settings';
import { Button } from '../../../ui/Button';
import { Toggle } from '../../../ui/Toggle';
import { Tooltip } from '../../../ui/Tooltip';
import { C11 } from '../../confirms/C11';
import { RowGroup } from '../../shared/RowGroup';
import { LinkWhatsAppDialog } from '../LinkWhatsAppDialog';
import styles from '../SettingsPage.module.css';
import own from './WhatsAppRows.module.css';

type Look = 'linked' | 'unlinked' | 'not_linked';

function setWa(path: 'connections.whatsapp.read' | 'connections.whatsapp.draft', value: boolean) {
  void invoke('settings:set', { path, value })
    .then((r) => {
      if (r.ok)
        update((s) => {
          s.settings.value = r.value.settings;
        });
    })
    .catch(() => undefined);
}

export function WhatsAppRows() {
  const row = useStore(selectWhatsAppRow);
  const settings = useStore(selectSettings);
  const offline = useStore(selectConnection) === 'offline';
  const dialog = useStore((s) => s.ui.dialog);
  const byId = useStore((s) => s.chats.byId);
  // Groups hidden in this window: the chat list drops them, so the store keeps them to show them again.
  const hidden = useStore(selectHiddenMirrors);
  const groups = useMemo(() => {
    const shown = Object.values(byId).filter((c) => c.kind === 'wa_mirror' && c.waJid);
    const all = [...shown, ...Object.values(hidden).filter((h) => !byId[h.id])];
    return all.sort((a, b) => a.title.localeCompare(b.title));
  }, [byId, hidden]);

  const look: Look =
    row?.status === 'connected' ? 'linked' : row?.status === 'unlinked' || row?.status === 'error' ? 'unlinked' : 'not_linked';
  const wa = settings?.connections.whatsapp;

  const archive = (chat: ChatRow, on: boolean) => void archiveMirror(chat.id, on).catch(() => undefined);

  const link = (label: string) => {
    const button = (
      <Button variant="primary" disabled={offline} onClick={() => openDialog('link-whatsapp')}>
        {label}
      </Button>
    );
    return offline ? <Tooltip text={t('settings.connections.whatsapp.offline_tooltip')}>{button}</Tooltip> : button;
  };

  return (
    <section aria-labelledby="settings-connections-whatsapp">
      <RowGroup>
        <li
          className={styles.row}
          data-testid={TID.settingsRowConnectionsWhatsapp}
          data-row-id="settings/connections/whatsapp"
          data-state={look}
        >
          <span className={styles.rowText}>
            <span id="settings-connections-whatsapp" className={styles.rowLabel}>
              <strong>{t('settings.connections.whatsapp.name')}</strong>
            </span>
            <span className={styles.status} data-tone={look === 'unlinked' ? 'warn' : 'dim'} role="status">
              {look === 'linked'
                ? t('settings.connections.whatsapp.linked', { account: row?.accountLabel ?? '' })
                : look === 'unlinked'
                  ? t('settings.connections.whatsapp.unlinked')
                  : t('settings.connections.whatsapp.not_linked')}
            </span>
          </span>
          {look === 'linked' ? (
            <Button variant="secondary" onClick={() => openDialog('c-11')}>
              {t('settings.connections.whatsapp.unlink')}
            </Button>
          ) : look === 'unlinked' ? (
            link(t('settings.connections.whatsapp.link_again'))
          ) : (
            link(t('settings.connections.whatsapp.link'))
          )}
        </li>
        {look !== 'not_linked' && wa && (
          <>
            <li className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{t('settings.connections.whatsapp.read')}</span>
              </span>
              <Toggle
                checked={wa.read}
                label={t('settings.connections.whatsapp.read')}
                onChange={(on) => setWa('connections.whatsapp.read', on)}
              />
            </li>
            <li className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{t('settings.connections.whatsapp.draft')}</span>
              </span>
              <Toggle
                checked={wa.draft}
                label={t('settings.connections.whatsapp.draft')}
                onChange={(on) => setWa('connections.whatsapp.draft', on)}
              />
            </li>
            {groups.length > 0 && (
              <li className={styles.rowItem}>
                <span className={styles.row}>
                  <span className={styles.rowLabel}>{t('settings.connections.whatsapp.groups')}</span>
                </span>
                <ul role="list" className={own.groups}>
                  {groups.map((g) => {
                    const on = !wa.hiddenJids.includes(g.waJid ?? '');
                    return (
                      <li key={g.id} className={styles.row} data-testid={TID.settingsRowConnectionsWHidden} data-row-id={g.waJid ?? ''}>
                        <span className={styles.rowText}>
                          <span className={styles.rowLabel}>{g.title}</span>
                        </span>
                        <Toggle checked={on} label={g.title} onChange={(next) => archive(g, !next)} />
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
          </>
        )}
      </RowGroup>
      <p className={styles.rowSecond}>{t('settings.connections.whatsapp.note')}</p>
      {dialog === 'link-whatsapp' && <LinkWhatsAppDialog onClose={closeDialog} />}
      {dialog === 'c-11' && (
        <C11
          onClose={closeDialog}
          onConfirm={() => {
            closeDialog();
            // Unlink deletes every mirror, the hidden ones too.
            update((s) => {
              s.connections.hiddenMirrors = {};
            });
            void invoke('whatsapp:unlink', {}).catch(() => undefined);
          }}
        />
      )}
    </section>
  );
}
