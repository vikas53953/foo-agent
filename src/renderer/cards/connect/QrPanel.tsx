// Spec: 05-3 §5.11.1 WhatsApp QR panel (QR `--qr-size` 200, 8px quiet zone, `--qr-bg` / `--qr-fg` in both themes, `--r-sm`;
// numbered steps beside it, number `--t-body-strong`, text `--t-body`; under a < 400px inner card the steps go under the QR;
// footer `--t-caption` `--fg-3` "WhatsApp may unlink foo now and then…", always visible), §5.11.2 states (QR shown; QR
// expired: QR blurred 6px with "This code expired." in `--fg-3` and [ New code ]; WhatsApp linked: `--ok` summary "✓
// WhatsApp linked ({+91 98••• ••210})"; failed 3×: "WhatsApp didn't link. You can try later in Settings → Connections."
// [ Skip for now ]), §5.11.3 (QR `alt`; linked announced politely; test ids `card-connect-qr`, `card-connect-new-code`,
// `card-connect-skip`). Shared by the WhatsApp Connect card and `dialog-link-whatsapp` (06-2 §6.8).
import { Icon } from '../../ui/Icon';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { Button } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import type { WaLinkPhase } from './waLink';
import styles from './QrPanel.module.css';

export interface QrPanelProps {
  phase: Exclude<WaLinkPhase, 'idle'>;
  png: string | null;
  account: string;
  onNewCode: () => void;
  onSkip: () => void;
}

export function QrPanel({ phase, png, account, onNewCode, onSkip }: QrPanelProps) {
  if (phase === 'linked')
    return (
      <p className={styles.linked} role="status" aria-live="polite">
        <Icon name="Checkmark" size={16} />
        {t('cards.connect.whatsapp.linked', { account })}
      </p>
    );
  if (phase === 'failed')
    return (
      <div className={styles.failed}>
        <p className={styles.line}>{t('cards.connect.whatsapp.failed')}</p>
        <div>
          <Button variant="secondary" size="md" data-testid={TID.cardConnectSkip} onClick={onSkip}>
            {t('cards.connect.whatsapp.skip')}
          </Button>
        </div>
      </div>
    );
  const expired = phase === 'expired';
  return (
    <div className={styles.panel} data-phase={phase}>
      <div className={styles.row}>
        <div className={styles.qrBox}>
          {png ? (
            <img
              className={expired ? `${styles.qr} ${styles.blurred}` : styles.qr}
              src={png}
              alt={t('cards.connect.qr.alt')}
              data-testid={TID.cardConnectQr}
            />
          ) : (
            <span className={styles.qrWait}>
              <Spinner size={24} />
            </span>
          )}
          {expired && (
            <div className={styles.expired}>
              <span>{t('cards.connect.qr.expired')}</span>
              <Button variant="secondary" size="md" data-testid={TID.cardConnectNewCode} onClick={onNewCode}>
                {t('cards.connect.qr.new_code')}
              </Button>
            </div>
          )}
        </div>
        <ol className={styles.steps}>
          {[t('cards.connect.qr.step_1'), t('cards.connect.qr.step_2'), t('cards.connect.qr.step_3')].map((text, i) => (
            <li key={i} className={styles.step}>
              <span className={styles.num}>{i + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className={styles.risk}>{t('cards.connect.qr.risk')}</p>
    </div>
  );
}
