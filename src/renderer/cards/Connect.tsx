// Spec: 05-3 §5.11 Connect card (anatomy: 32 logo + title row, `--t-body` lines, [ Connect ] [ Not now ]; §5.11.2 variants
// google / one_app / allow_send / contacts_only (outlook is not rendered while flags.outlook is false, X-41; the whatsapp
// variant and its QR panel are T3's `connect/WhatsAppConnect.tsx`), states and copy; §5.11.3 Tab order, Ctrl+Enter = Primary,
// card label "Connect an app: {title}", connected announced politely, test ids), 08-1 §3.2 connection:connect (returns at
// once; the card follows connection:upsert), 08-3 §16.1.1 ("Gmail isn't available in this build."), 08-5 §4.1 ConnectPayload.
// The official app marks are not bundled yet: the header shows the Fluent Mail / Calendar / People glyph in the 32px logo box
// (implementation-notes "M8 T2"). "Not now" is kept in this window until `card:answer` (M5) stores it.
import { useState, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import type { CardRow, ConnectPayload } from '../../shared/types';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectConnections } from '../store/connections';
import { selectConnection } from '../store/live';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { cardScopes, connectLook, type LocalPhase } from './connect/googleState';
import { useGoogleInfo } from './connect/useGoogleInfo';
import { WhatsAppConnect } from './connect/WhatsAppConnect';
import styles from './Card.module.css';
import own from './Connect.module.css';

const appName = (app: string): string =>
  app === 'gcal'
    ? t('settings.connections.app.calendar')
    : app === 'contacts'
      ? t('settings.connections.app.contacts')
      : t('settings.connections.app.gmail');
const LOGO: Record<string, IconName> = { gmail: 'Mail', gcal: 'Calendar', contacts: 'People' };

function titleOf(p: ConnectPayload): string {
  switch (p.variant) {
    case 'one_app':
      return t('cards.connect.one_app.title', { app: appName(p.app) });
    case 'allow_send':
      return t('cards.connect.allow_send.title', { app: appName(p.app) });
    case 'contacts_only':
      return t('cards.connect.contacts_only.title');
    default:
      return t('cards.connect.google.title');
  }
}

function linesOf(p: ConnectPayload): string[] {
  switch (p.variant) {
    case 'one_app':
      return p.why ? [p.why] : [];
    case 'allow_send':
      return [t('cards.connect.allow_send.line')];
    case 'contacts_only':
      return [t('cards.connect.contacts_only.line_see'), t('cards.connect.contacts_only.line_only_read')];
    default:
      return [t('cards.connect.google.line_read'), t('cards.connect.google.line_drafts'), t('cards.connect.google.line_contacts')];
  }
}

export function ConnectCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as ConnectPayload;
  if (p.variant === 'whatsapp') return <WhatsAppConnect card={card} time={time} />;
  if (p.variant === 'outlook') return null;
  return <GoogleConnect card={card} p={p} time={time} />;
}

function GoogleConnect({ card, p, time }: { card: CardRow; p: ConnectPayload; time: CardTime }) {
  const rows = useStore(selectConnections);
  const offline = useStore(selectConnection) === 'offline';
  const info = useGoogleInfo();
  const [phase, setPhase] = useState<LocalPhase>('idle');
  const [remind, setRemind] = useState(false);
  const look = connectLook({ payload: p, rows, phase, offline, available: info?.available ?? true, cardState: card.state });
  const title = titleOf(p);
  const app = appName(
    p.variant === 'google' || p.variant === 'contacts_only' ? (p.variant === 'contacts_only' ? 'contacts' : 'gmail') : p.app,
  );

  const connect = (scopes = cardScopes(p)) => {
    setPhase('opening');
    void invoke('connection:connect', { app: 'google', scopes })
      .then((r) => setPhase(r.ok ? 'started' : 'idle'))
      .catch(() => setPhase('idle'));
  };
  const showOffline = (look.state === 'offered' && look.offline) || look.state === 'offline';
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && look.state === 'offered' && !look.offline && !look.unavailable) connect();
  };

  return (
    <CardFrame tid="cardConnect" className={own.frame} state={look.state} label={t('cards.connect.accessible_name', { title })}>
      <div className={own.body} onKeyDown={onKey}>
        <div className={own.head}>
          <span className={own.logo} aria-hidden>
            <Icon name={LOGO[p.variant === 'contacts_only' ? 'contacts' : p.app] ?? 'Mail'} size={24} />
          </span>
          <span className={styles.title}>{title}</span>
        </div>
        {(look.state === 'offered' || look.state === 'offline') && (
          <>
            {linesOf(p).map((l) => (
              <p key={l} className={own.line} data-copy={p.variant === 'one_app' ? 'external' : undefined}>
                {l}
              </p>
            ))}
            {look.state === 'offered' && look.unavailable && <p className={own.note}>{t('cards.connect.line.unavailable')}</p>}
            {showOffline && <p className={own.note}>{t('cards.connect.line.offline')}</p>}
          </>
        )}
        {(look.state === 'opening' || look.state === 'waiting') && (
          <div className={own.status} role="status">
            {look.state === 'opening' ? (
              <>
                <Spinner size={16} />
                <span>{t('cards.connect.line.opening', { app })}</span>
              </>
            ) : (
              <span>{t('cards.connect.line.waiting')}</span>
            )}
          </div>
        )}
        {(look.state === 'connected' || look.state === 'partial') && (
          <p className={own.ok} role="status" aria-live="polite">
            {look.state === 'connected'
              ? t('cards.connect.line.connected', { account: look.account })
              : look.missing === 'send'
                ? t('cards.connect.line.partial')
                : t('cards.connect.line.partial_scope', { what: look.missing })}
          </p>
        )}
        {look.state === 'denied' && <p className={own.line}>{t('cards.connect.line.denied', { app })}</p>}
        {look.state === 'expired' && <p className={own.line}>{t('cards.connect.line.expired')}</p>}
        {look.state === 'skipped' && <p className={own.note}>{t('cards.connect.line.skipped')}</p>}
        <div className={styles.foot}>
          <div className={styles.buttons}>
            {look.state === 'offered' && !look.offline && (
              <>
                {p.variant === 'allow_send' ? (
                  <Button
                    variant="primary"
                    size="md"
                    disabled={look.unavailable}
                    data-testid={TID.cardConnectAllowSend}
                    onClick={() => connect()}
                  >
                    {t('cards.connect.button.allow_send')}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    disabled={look.unavailable}
                    data-testid={TID.cardConnectConnect}
                    onClick={() => connect()}
                  >
                    {t('cards.connect.button.connect')}
                  </Button>
                )}
                <Button variant="secondary" size="md" data-testid={TID.cardConnectNotNow} onClick={() => setPhase('skipped')}>
                  {t('cards.connect.button.not_now')}
                </Button>
              </>
            )}
            {showOffline && !remind && (
              <Button variant="secondary" size="md" data-testid={TID.cardConnectRemind} onClick={() => setRemind(true)}>
                {t('cards.connect.button.remind')}
              </Button>
            )}
            {look.state === 'waiting' && (
              <button type="button" className={styles.link} data-testid={TID.cardConnectReopen} onClick={() => connect()}>
                {t('cards.connect.button.reopen')}
              </button>
            )}
            {look.state === 'denied' && (
              <>
                <Button variant="primary" size="md" disabled={offline} data-testid={TID.cardConnectTryAgain} onClick={() => connect()}>
                  {t('cards.connect.button.try_again')}
                </Button>
                <button type="button" className={styles.link} data-testid={TID.cardConnectSkip} onClick={() => setPhase('skipped')}>
                  {t('cards.connect.button.skip')}
                </button>
              </>
            )}
            {look.state === 'expired' && (
              <Button variant="primary" size="md" disabled={offline} data-testid={TID.cardConnectReopen} onClick={() => connect()}>
                {t('cards.connect.button.reopen')}
              </Button>
            )}
            {(look.state === 'connected' || look.state === 'partial') && (
              <button
                type="button"
                className={styles.link}
                aria-label={t('cards.connect.button.different_account_label')}
                data-testid={TID.cardConnectDifferentAccount}
                disabled={offline}
                onClick={() => connect(['gmail', 'gcal', 'contacts'])}
              >
                {t('cards.connect.button.different_account')}
              </button>
            )}
          </div>
          <span className={styles.footSpacer} />
          <CardTimeLabel {...time} />
        </div>
      </div>
    </CardFrame>
  );
}
