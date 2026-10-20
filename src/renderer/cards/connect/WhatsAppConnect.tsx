// Spec: 05-3 §5.11 Connect card, `whatsapp` variant: title "Link WhatsApp", lines "I can read your chats to remind you of
// things, and draft messages for you to send." / "I never send a WhatsApp message without your tap.", [ Show QR code ]
// (→ `whatsapp:linkStart`) [ Not now ]; after Show QR code the §5.11.1 QR panel and its states (QrPanel); Not now → grey
// summary "Not connected. You can do this later in Settings → Connections."; read-only in history = summary only;
// §5.11.3 Tab order, Ctrl+Enter = Primary, card label "Connect an app: {title}", `--logo` 32 header row, test ids. The
// official mark is the bundled one the chat list draws (03-shell-1 §3.4.5.1). Like T2's Google card, "Not now" lives in
// this window (the card's answer is not stored yet).
import { useState, type KeyboardEvent } from 'react';
import { t } from '../../../shared/copy/t';
import type { CardRow } from '../../../shared/types';
import { TID } from '../../../shared/testids';
import { WhatsAppMark } from '../../chatlist/ChatRow';
import { useStore } from '../../store/index';
import { selectConnection } from '../../store/live';
import { Button } from '../../ui/Button';
import { CardFrame, CardTimeLabel, type CardTime } from '../CardFrame';
import { QrPanel } from './QrPanel';
import { useWaLink } from './waLink';
import styles from '../Card.module.css';
import own from './WhatsAppConnect.module.css';

export function WhatsAppConnect({ card, time }: { card: CardRow; time: CardTime }) {
  const offline = useStore(selectConnection) === 'offline';
  const { phase, qr, row, start } = useWaLink();
  const [skipped, setSkipped] = useState(card.state === 'skipped');
  const title = t('cards.connect.whatsapp.title');
  const state = skipped
    ? 'skipped'
    : phase === 'linked'
      ? 'connected'
      : phase === 'failed'
        ? 'failed'
        : phase === 'idle'
          ? 'offered'
          : 'waiting';
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && state === 'offered' && !offline) start();
  };

  return (
    <CardFrame tid="cardConnect" card={card} state={state} label={t('cards.connect.whatsapp.accessible_name', { title })}>
      <div className={own.body} onKeyDown={onKey}>
        <div className={own.head}>
          <span className={own.logo} aria-hidden>
            <WhatsAppMark size={24} />
          </span>
          <span className={styles.title}>{title}</span>
        </div>
        {state === 'offered' && (
          <>
            <p className={own.line}>{t('cards.connect.whatsapp.line_read')}</p>
            <p className={own.line}>{t('cards.connect.whatsapp.line_never_send')}</p>
          </>
        )}
        {skipped ? (
          <p className={own.note}>{t('cards.connect.whatsapp.skipped')}</p>
        ) : (
          phase !== 'idle' && (
            <QrPanel
              phase={phase}
              png={qr?.png ?? null}
              account={row?.accountLabel ?? ''}
              onNewCode={start}
              onSkip={() => setSkipped(true)}
            />
          )
        )}
        <div className={styles.foot}>
          {state === 'offered' && (
            <div className={styles.buttons}>
              <Button variant="primary" size="md" disabled={offline} data-testid={TID.cardConnectShowQr} onClick={start}>
                {t('cards.connect.whatsapp.show_qr')}
              </Button>
              <Button variant="secondary" size="md" data-testid={TID.cardConnectNotNow} onClick={() => setSkipped(true)}>
                {t('cards.connect.whatsapp.not_now')}
              </Button>
            </div>
          )}
          <span className={styles.footSpacer} />
          <CardTimeLabel {...time} />
        </div>
      </div>
    </CardFrame>
  );
}
