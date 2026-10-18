// Spec: 05-3 §5.15 Proof chip (under foo's result bubble, 4px gap; 0.3 Chip: 24 visual / 40 hit, `--ok-soft`, `--ok`,
// `--t-caption-strong`, CheckmarkCircle 16; numbers tabular; "Proof: {booking #TJ88213 | screenshot | email from {sender} | in
// your Gmail Sent folder | Delivered}", PNR and messages-read forms; click: a number opens a popover with the number in
// `--t-mono`, Secondary "Copy" and Link "See in activity" (06 §9); an email opens the message in the default browser; Sent
// folder opens Gmail Sent; Delivered does nothing; offline: email / Sent links disabled. Test ids `thread-proof-chip`
// (`data-index`, `data-state` = ProofKind), `thread-proof-copy`, `thread-proof-see-activity`). Art. 11 / 08-2 §5.8: the
// chip is drawn only from the runner's verified `jobs.proof`, never from the AI's words.
import { useState, type MouseEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { navigate, useStore } from '../store/index';
import { selectConnection } from '../store/live';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/Popover';
import { proofChip, type Proof } from '../cards/jobCards';
import { copyText } from './linkActions';
import styles from './Proof.module.css';

/** 05-3 §5.15.2 chip click targets in the default browser (Gmail web). */
const gmailMessage = (id: string) => `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;
const GMAIL_SENT = 'https://mail.google.com/mail/u/0/#sent';

export function ProofChip({ proof, index = 0 }: { proof: Proof; index?: number }) {
  const chip = proofChip(proof);
  const offline = useStore(selectConnection) === 'offline';
  const [open, setOpen] = useState<HTMLButtonElement | null>(null);
  if (!chip) return null;
  const text = chip.text;
  const url = proof.kind === 'email' ? gmailMessage(proof.messageId) : proof.kind === 'sent_folder' ? GMAIL_SENT : null;
  const needsNet = url !== null;
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    if (chip.number) setOpen(e.currentTarget);
    else if (url && !offline) void invoke('link:open', { url });
  };
  return (
    <>
      <button
        type="button"
        className={styles.proof}
        data-testid={TID.threadProofChip}
        data-index={index}
        data-state={chip.state}
        aria-disabled={(needsNet && offline) || undefined}
        title={needsNet && offline ? t('cards.proof_chip.popover.offline') : undefined}
        onClick={click}
      >
        <Icon name="CheckmarkCircle" size={16} />
        <span className={styles.chipText}>{text}</span>
      </button>
      {open && chip.number && (
        <Popover anchor={open} label={text} onClose={() => setOpen(null)} size="md" side="above" autoFocus>
          <div className={styles.popover}>
            <span className={styles.number}>{chip.number}</span>
            <div className={styles.popButtons}>
              <Button variant="secondary" size="sm" data-testid={TID.threadProofCopy} onClick={() => void copyText(chip.number!)}>
                {t('cards.proof_chip.popover.copy')}
              </Button>
              <Button
                variant="link"
                size="sm"
                data-testid={TID.threadProofSeeActivity}
                onClick={() => {
                  setOpen(null);
                  navigate({ kind: 'screen', id: 'activity' });
                }}
              >
                {t('cards.proof_chip.popover.see_activity')}
              </Button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
