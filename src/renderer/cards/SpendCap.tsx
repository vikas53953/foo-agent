// Spec: 05-3 §5.21 Spend-cap card, AI variant only in M4 (G-M4-10): 1.5px `--warn` top edge; Money 20 `--warn` + "You've
// reached this month's AI cap (₹{1,000})."; "I've paused {2} jobs and {4} routines. Nothing was lost."; [ Raise cap ] opens
// C-21 (X-15: a plain confirm dialog, never an inline editor) · "Wait until {Sun 1 Nov}"; states shown / raised (summary
// `--ok` "Cap raised to ₹{1,500} on {Fri 16 Oct, 3:10 PM}. Carrying on.") / dismissed (summary grey "Paused until {Sun 1
// Nov}."). Ctrl+Enter = Raise cap; Narrator "Spending cap: {line 1}". "Wait until" ends the card through `error:fix` with
// `dismiss` (CR-0008 G-M4-09). The paused counts are the jobs the runner paused for the cap (`waiting_reason = spend_cap`);
// routines are paused from M7 on, so the count is 0 until then (implementation-notes "M4 T5").
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate, formatInr } from '../../shared/format';
import type { CardRow, SpendCapPayload } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectSettings } from '../store/settings';
import { Icon } from '../ui/Icon';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { nextMonthStart } from './jobCards';
import { Money } from './parts/Money';
import { RaiseCapDialog } from './lazyCapDialogs';
import { ctrlEnter, useCardAction } from './useCardAction';
import styles from './JobCards.module.css';

export function SpendCap({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SpendCapPayload;
  const settings = useStore(selectSettings);
  const pausedJobs = useStore(
    (s) => Object.values(s.jobs.byId).filter((j) => j.state === 'waiting' && j.waitingReason === 'spend_cap').length,
  );
  const [capDialog, setCapDialog] = useState(false);
  const { busy, run } = useCardAction<'wait'>();
  const o = { timeZone: time.timeZone, now: time.now };
  const until = formatDate(nextMonthStart(card.createdAt, time.timeZone), 'date', o);
  const line1 = t('cards.spend_cap.line1.ai', { cap: formatInr(p.capPaise) });
  const label = t('cards.spend_cap.label', { line1 });

  if (card.state === 'raised' || card.state === 'dismissed') {
    const raised = card.state === 'raised';
    return (
      <CardFrame tid="cardSpendCap" card={card} state={card.state} label={label} muted={!raised}>
        <div className={styles.summary}>
          <Icon name={raised ? 'CheckmarkCircle' : 'Clock'} size={16} className={raised ? styles.ok : styles.dim} />
          <span className={styles.summaryText}>
            {raised ? (
              <Money
                text={t('cards.spend_cap.summary.raised', {
                  cap: formatInr(settings?.money.aiCapPaise ?? p.capPaise),
                  time: formatDate(card.resolvedAt ?? card.updatedAt, 'full', o),
                })}
              />
            ) : (
              t('cards.spend_cap.summary.dismissed', { date: until })
            )}
          </span>
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
      </CardFrame>
    );
  }

  const raise = () => setCapDialog(true);
  return (
    <CardFrame
      tid="cardSpendCap"
      card={card}
      state={card.state}
      label={label}
      edge="warn"
      busy={busy !== null}
      onKeyDown={ctrlEnter(raise)}
    >
      <div className={styles.head}>
        <Icon name="Money" size={20} className={styles.warnIcon} />
        <span className={styles.title}>
          <Money text={line1} />
        </span>
      </div>
      <div className={styles.body}>{t('cards.spend_cap.line2.ai', { jobs: pausedJobs, routines: 0 })}</div>
      <div className={styles.foot}>
        <div className={styles.buttons}>
          <CardButton tid="cardSpendCapRaise" kind="primary" disabled={busy !== null} onClick={raise}>
            {t('cards.spend_cap.raise')}
          </CardButton>
          <CardButton
            tid="cardSpendCapWait"
            kind="link"
            busy={busy === 'wait'}
            onClick={() =>
              run('wait', () => invoke('error:fix', { cardId: card.id, nonce: card.nonce, action: { kind: 'dismiss' }, resolvedBy: 'tap' }))
            }
          >
            {t('cards.spend_cap.wait', { date: until })}
          </CardButton>
        </div>
        <span className={styles.spacer} />
        <CardTimeLabel {...time} />
      </div>
      {capDialog && <RaiseCapDialog capPaise={settings?.money.aiCapPaise ?? p.capPaise} onClose={() => setCapDialog(false)} />}
    </CardFrame>
  );
}
