// Spec: 04-2 §23.4 (pending-card strip: 40 tall, --bg-raised, 1.5px --accent, --r-md, padding 0 12, --shadow-4; LockClosed 16
// --accent for Approval / Payment, Clock 16 --warn otherwise; one line of --t-small --fg-1; "{m}:{ss} left" --t-caption --warn
// when the soonest expiry is under 10 minutes; Secondary 32 "Show"; a click anywhere on the strip shows the card; never an
// Approve, Pay or Send button; announced once when it appears: "{text}. Show button."; `composer-pending`,
// `composer-pending-show`).
import { useEffect } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import type { StripView } from './pending';
import styles from './Composer.module.css';

export function PendingStrip({ view, onShow }: { view: StripView; onShow: () => void }) {
  useEffect(() => announce(t('composer.pending.accessible_name', { text: view.text })), [view.text]);
  return (
    <div className={styles.pending} data-testid={TID.composerPending} onClick={onShow}>
      <span className={styles.pendingIcon} data-gated={view.icon === 'LockClosed' || undefined}>
        <Icon name={view.icon} size={16} />
      </span>
      <span className={styles.pendingText}>{view.text}</span>
      {view.timeLeft && <span className={styles.timeLeft}>{view.timeLeft}</span>}
      <Button
        variant="secondary"
        size="sm"
        data-testid={TID.composerPendingShow}
        onClick={(e) => {
          e.stopPropagation();
          onShow();
        }}
      >
        {t('composer.pending.show')}
      </Button>
    </div>
  );
}
