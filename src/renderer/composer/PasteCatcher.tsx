// Spec: 04-2 §22.4 (the only paste-catcher implementation; docked in the strip slot above the pill; --bg-raised, 1px --warn,
// --r-lg, 12/14 padding, --shadow-16; Warning 16 --warn + "That looks like a password or key" --t-body-strong; body
// --t-small --fg-2; "Move to secret box" Primary 40 and "Send anyway" Secondary 40, 8 apart; role="alertdialog" named by the
// title, focus moves to "Move to secret box"; Esc returns focus to the field; `composer-paste`, `composer-paste-move`,
// `composer-paste-send`), 05-2 §5.9.3 (assertive "Warning: That looks like a password or key. Press Tab to choose." is
// replaced by 04-2's focus rule, 04 wins per §25 #16; appears with fade + 8px rise --m-slow), §5.9.4 (no toast, no card).
import { useEffect, useId, useRef } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import styles from './Composer.module.css';

export function PasteCatcher({ onMove, onSendAnyway, onDismiss }: { onMove: () => void; onSendAnyway: () => void; onDismiss: () => void }) {
  const title = useId();
  const move = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    move.current?.focus();
  }, []);
  return (
    <div
      className={styles.catch}
      role="alertdialog"
      aria-labelledby={title}
      data-testid={TID.composerPaste}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        } else if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          onMove();
        }
      }}
    >
      <div className={styles.catchTitle} id={title}>
        <span className={styles.warnIcon}>
          <Icon name="Warning" size={16} />
        </span>
        {t('composer.paste.title')}
      </div>
      <p className={styles.catchBody}>{t('composer.paste.body')}</p>
      <div className={styles.catchButtons}>
        <Button ref={move} variant="primary" size="md" data-testid={TID.composerPasteMove} onClick={onMove}>
          {t('composer.paste.move')}
        </Button>
        <Button variant="secondary" size="md" data-testid={TID.composerPasteSend} onClick={onSendAnyway}>
          {t('composer.paste.send_anyway')}
        </Button>
      </div>
    </div>
  );
}
