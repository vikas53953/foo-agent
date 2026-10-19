// Spec: 06-2 §6.8 Gmail, Calendar and Contacts rows (status lines per state; Gmail "Disconnect Google" → C-10 / Primary
// "Reconnect" / Primary "Connect"; "To let me send, allow one more permission." + Link "Allow sending"; Calendar / Contacts
// "Turn off" / "Turn on" via `connections.google.calendarOn` / `contactsOn` at once, or "Not allowed yet" (`--warn`) + Primary
// "Allow" → connection:connect with only that scope; Connect / Reconnect follow the Connect card states inline: "Opening
// {Gmail} sign-in in your browser…", "{Gmail} isn't connected." + Link "Try again", "That sign-in link expired." + Link
// "Reopen"; offline: Connect, Reconnect disabled, Disconnect still works), 08-3 §16.1.1 (missing client file), §16.1.2.
import { useState } from 'react';
import { t } from '../../../../shared/copy/t';
import type { ConnectionRow } from '../../../../shared/types';
import { TID } from '../../../../shared/testids';
import { invoke } from '../../../ipc/client';
import { openDialog, useStore } from '../../../store/index';
import { selectConnections } from '../../../store/connections';
import { selectConnection } from '../../../store/live';
import { selectSettings } from '../../../store/settings';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import type { GoogleApp } from '../../../cards/connect/googleState';
import styles from '../ConnectionsPage.module.css';

type Phase = { app: GoogleApp; state: 'opening' | 'started' } | null;

const NAME: Record<GoogleApp, () => string> = {
  gmail: () => t('settings.connections.app.gmail'),
  gcal: () => t('settings.connections.app.calendar'),
  contacts: () => t('settings.connections.app.contacts'),
};

export function GoogleRows({ available }: { available: boolean }) {
  const rows = useStore(selectConnections);
  const offline = useStore(selectConnection) === 'offline';
  const google = useStore(selectSettings)?.connections.google ?? { calendarOn: true, contactsOn: true };
  const [phase, setPhase] = useState<Phase>(null);
  const live = (app: GoogleApp) => rows.find((r) => r.app === app && r.status !== 'disconnected');
  const gmail = live('gmail');
  const anyConnected = ['gmail', 'gcal', 'contacts'].some((a) => live(a as GoogleApp)?.status === 'connected');

  const connect = (app: GoogleApp, scopes?: GoogleApp[]) => {
    setPhase({ app, state: 'opening' });
    void invoke('connection:connect', { app: 'google', ...(scopes ? { scopes } : {}) })
      .then((r) => setPhase(r.ok ? { app, state: 'started' } : null))
      .catch(() => setPhase(null));
  };
  const blocked = offline || !available;

  /** The inline sign-in line for the row that started it, or null when the row shows its own status. */
  const inline = (app: GoogleApp, row: ConnectionRow | undefined) => {
    if (phase?.app !== app) return null;
    if (phase.state === 'opening' || row?.status === 'connecting')
      return (
        <span className={styles.status} role="status">
          <Spinner size={16} /> {t('cards.connect.line.opening', { app: NAME[app]() })}
        </span>
      );
    if (row?.status === 'connected' || !row?.lastErrorKind) return null;
    const expired = row.lastErrorKind === 'OAUTH_TIMEOUT';
    return (
      <span className={styles.detail}>
        <span>{expired ? t('cards.connect.line.expired') : t('settings.connections.row.denied', { app: NAME[app]() })}</span>
        <button type="button" className={styles.link} disabled={blocked} onClick={() => connect(app, app === 'gmail' ? undefined : [app])}>
          {expired ? t('settings.connections.button.reopen') : t('settings.connections.button.try_again')}
        </button>
      </span>
    );
  };

  // ---- Gmail
  const gmailState = gmail?.status ?? 'disconnected';
  const gmailStatus =
    gmailState === 'connected' ? (
      <span className={styles.status}>
        {gmail!.granted.send
          ? t('settings.connections.gmail.status_send', { account: gmail!.accountLabel })
          : t('settings.connections.gmail.status_draft', { account: gmail!.accountLabel })}
      </span>
    ) : gmailState === 'needs_signin' ? (
      <span className={styles.warn}>{t('settings.connections.gmail.needs_signin')}</span>
    ) : (
      <span className={styles.status}>{t('settings.connections.row.not_connected')}</span>
    );

  return (
    <>
      <div className={styles.group} data-testid={TID.settingsRowConnectionsGmail} data-state={gmailState}>
        <div className={styles.header}>
          <div className={styles.text}>
            <span className={styles.name}>{NAME.gmail()}</span>
            {inline('gmail', gmail) ?? gmailStatus}
          </div>
          <div className={styles.buttons}>
            {gmailState === 'connected' && (
              <Button variant="secondary" size="md" onClick={() => openDialog('c-10')}>
                {t('settings.connections.button.disconnect_google')}
              </Button>
            )}
            {gmailState === 'needs_signin' && (
              <Button variant="primary" size="md" disabled={blocked} onClick={() => connect('gmail')}>
                {t('settings.connections.button.reconnect')}
              </Button>
            )}
            {gmailState !== 'connected' && gmailState !== 'needs_signin' && gmailState !== 'connecting' && (
              <Button variant="primary" size="md" disabled={blocked} onClick={() => connect('gmail')}>
                {t('settings.connections.button.connect')}
              </Button>
            )}
          </div>
        </div>
        {gmailState === 'connected' && !gmail!.granted.send && (
          <div className={styles.detail}>
            <span>{t('settings.connections.gmail.allow_send_line')}</span>
            <button type="button" className={styles.link} disabled={blocked} onClick={() => connect('gmail', ['gmail'])}>
              {t('settings.connections.button.allow_sending')}
            </button>
          </div>
        )}
        {!available && gmailState !== 'connected' && <p className={styles.note}>{t('cards.connect.line.unavailable')}</p>}
      </div>
      <SubRow
        app="gcal"
        tid="settingsRowConnectionsCalendar"
        row={live('gcal')}
        googleOn={anyConnected}
        on={google.calendarOn}
        allowed={(r) => r.granted.calendarWrite}
        okLine={t('settings.connections.calendar.status')}
        inline={inline('gcal', live('gcal'))}
        blocked={blocked}
        connect={connect}
      />
      <SubRow
        app="contacts"
        tid="settingsRowConnectionsContacts"
        row={live('contacts')}
        googleOn={anyConnected}
        on={google.contactsOn}
        allowed={(r) => r.granted.contactsRead}
        okLine={t('settings.connections.contacts.status')}
        inline={inline('contacts', live('contacts'))}
        blocked={blocked}
        connect={connect}
      />
    </>
  );
}

function SubRow(p: {
  app: 'gcal' | 'contacts';
  tid: 'settingsRowConnectionsCalendar' | 'settingsRowConnectionsContacts';
  row: ConnectionRow | undefined;
  googleOn: boolean;
  on: boolean;
  allowed: (r: ConnectionRow) => boolean;
  okLine: string;
  inline: React.ReactNode;
  blocked: boolean;
  connect: (app: GoogleApp, scopes?: GoogleApp[]) => void;
}) {
  const connected = p.googleOn && p.row?.status === 'connected';
  const notAllowed = p.googleOn && (!p.row || (connected && !p.allowed(p.row)));
  const state = notAllowed ? 'not_allowed' : connected ? (p.on ? 'on' : 'off') : (p.row?.status ?? 'disconnected');
  const path = p.app === 'gcal' ? 'connections.google.calendarOn' : 'connections.google.contactsOn';
  return (
    <div className={styles.group} data-testid={TID[p.tid]} data-state={state}>
      <div className={styles.header}>
        <div className={styles.text}>
          <span className={styles.name}>{NAME[p.app]()}</span>
          {p.inline ??
            (notAllowed ? (
              <span className={styles.warn}>{t('settings.connections.row.not_allowed_yet')}</span>
            ) : connected ? (
              <span className={styles.status}>{p.on ? p.okLine : t('settings.connections.row.turned_off')}</span>
            ) : (
              <span className={styles.status}>{t('settings.connections.row.not_connected')}</span>
            ))}
        </div>
        <div className={styles.buttons}>
          {notAllowed && (
            <Button variant="primary" size="md" disabled={p.blocked} onClick={() => p.connect(p.app, [p.app])}>
              {t('settings.connections.button.allow')}
            </Button>
          )}
          {!notAllowed && connected && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void invoke('settings:set', { path, value: !p.on }).catch(() => undefined)}
            >
              {p.on ? t('settings.connections.button.turn_off') : t('settings.connections.button.turn_on')}
            </Button>
          )}
          {!p.googleOn && p.row?.status !== 'connecting' && (
            <Button variant="primary" size="md" disabled={p.blocked} onClick={() => p.connect(p.app)}>
              {t('settings.connections.button.connect')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
