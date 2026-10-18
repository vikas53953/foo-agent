// Spec: 05-3 §5.19 Stuck card (`--card-w`; 1.5px `--warn` top edge; Warning 20 `--warn` + "I'm stuck on the {Goa} job";
// label/value grid "What's wrong" / "Spent so far" / "What I'd do" with the runner's words (the AI never writes "What I'd
// do", 08-4 §26.4); [ Try another way ] Primary (only when the runner allows it), [ Take over ] Secondary (only when the job
// uses the browser), [ Stop ] Secondary; states asking / other_way "Trying another way · {time}" / taken_over / stopped /
// timed_out "Stopped after 15 minutes without an answer. Nothing was booked or paid."), X-80 (Stop = CANCELLED stuck_stop, the
// runner's move). Ctrl+Enter = Try another way; Narrator "Stuck: I'm stuck on the {Goa} job." (assertive on arrival). The
// taken_over and stopped cards keep their rows read-only with no buttons (05 gives them no summary words).
import { t } from '../../shared/copy/t';
import { formatTime } from '../../shared/format';
import type { CardRow, StuckPayload } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectJob } from '../store/jobs';
import { Icon } from '../ui/Icon';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { ctrlEnter, useCardAction } from './useCardAction';
import styles from './JobCards.module.css';

type Choice = 'other_way' | 'take_over' | 'stop';

export function Stuck({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as StuckPayload;
  const job = useStore(selectJob(card.jobId ?? ''));
  const { busy, run } = useCardAction<Choice>();
  const title = t('cards.stuck.title', { job: job?.title ?? '' });
  const label = t('cards.stuck.label', { job: job?.title ?? '' });
  const choose = (choice: Choice) => () =>
    run(choice, () => invoke('stuck:choose', { cardId: card.id, nonce: card.nonce, choice, resolvedBy: 'tap' }));

  if (card.state === 'other_way' || card.state === 'timed_out')
    return (
      <CardFrame tid="cardStuck" card={card} state={card.state} label={label} muted={card.state === 'timed_out'}>
        <div className={styles.summary}>
          <Icon
            name={card.state === 'timed_out' ? 'Clock' : 'CheckmarkCircle'}
            size={16}
            className={card.state === 'timed_out' ? styles.dim : styles.ok}
          />
          <span className={styles.summaryText}>
            {card.state === 'other_way'
              ? t('cards.stuck.summary.other_way', { time: formatTime(card.resolvedAt ?? card.updatedAt, { timeZone: time.timeZone }) })
              : t('cards.stuck.summary.timed_out')}
          </span>
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
      </CardFrame>
    );

  const asking = card.state === 'asking';
  const otherWay = asking && p.allowOtherWay ? choose('other_way') : null;
  return (
    <CardFrame
      tid="cardStuck"
      card={card}
      state={card.state}
      label={label}
      edge={asking ? 'warn' : undefined}
      busy={busy !== null}
      onKeyDown={ctrlEnter(busy === null ? otherWay : null)}
    >
      <div className={styles.head} role={asking ? 'alert' : undefined}>
        <Icon name="Warning" size={20} className={styles.warnIcon} />
        <span className={styles.title}>{title}</span>
      </div>
      <dl className={styles.grid}>
        <dt>{t('cards.stuck.row.whats_wrong')}</dt>
        <dd>{p.whatsWrong}</dd>
        <dt>{t('cards.stuck.row.spent')}</dt>
        <dd>{p.spentLine}</dd>
        <dt>{t('cards.stuck.row.suggestion')}</dt>
        <dd>{p.suggestion}</dd>
      </dl>
      <div className={styles.foot}>
        {asking && (
          <div className={styles.buttons}>
            {otherWay && (
              <CardButton tid="cardStuckOtherWay" kind="primary" busy={busy === 'other_way'} disabled={busy !== null} onClick={otherWay}>
                {t('cards.stuck.other_way')}
              </CardButton>
            )}
            {job?.usesBrowser && (
              <CardButton
                tid="cardStuckTakeOver"
                kind="secondary"
                busy={busy === 'take_over'}
                disabled={busy !== null}
                onClick={choose('take_over')}
              >
                {t('cards.stuck.take_over')}
              </CardButton>
            )}
            <CardButton tid="cardStuckStop" kind="secondary" busy={busy === 'stop'} disabled={busy !== null} onClick={choose('stop')}>
              {t('cards.stuck.stop')}
            </CardButton>
          </div>
        )}
        <span className={styles.spacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
