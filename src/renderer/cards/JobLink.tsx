// Spec: 05-3 §5.18.2 Job link card (in the chat that asked, while the job runs in a helper's chat): `--card-w`, the whole
// surface is one button (hover `--shadow-4`, border `--line-strong`); helper avatar `--avatar-inline` 26 + "{title} · in
// {helper}" + "Open {helper}"; status pill 24 (Working `--accent-soft`/`--accent`; Needs you `--warn-soft`/`--warn` +
// HandRight 16; Done `--ok-soft`/`--ok` + CheckmarkCircle; Didn't finish `--bad-soft`/`--bad`; Stopped `--bg-sunken`/`--fg-2`),
// words from the runner's state (Art. 12); Done → "✓ Done · in {Trips}". §5.18.3: one Tab stop, Enter opens the chat; label
// "{title} in {helper}, {status}"; status pill test id `card-job-link-status`.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { CardRow, JobLinkPayload } from '../../shared/types';
import { openChat } from '../shell/actions';
import { useStore } from '../store/index';
import { selectHelper } from '../store/helpers';
import { selectJob } from '../store/jobs';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import type { CardTime } from './CardFrame';
import { jobLinkStatus, stepOf } from './jobCards';
import card_ from './Card.module.css';
import styles from './JobCards.module.css';

export function JobLink({ card }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as JobLinkPayload;
  const job = useStore(selectJob(p.jobId));
  const helper = useStore(selectHelper(job?.ownerKind === 'helper' ? job.ownerId : null));
  if (!job) return null;
  const name = helper?.name ?? '';
  const { k, n } = stepOf(job);
  const status = jobLinkStatus(job.state, k, n);
  const words = status.text;
  const done = status.tone === 'done';
  const title = done ? t('cards.job_link.done_title', { helper: name }) : t('cards.job_link.title', { title: job.title, helper: name });
  return (
    <button
      type="button"
      className={cx(card_.card, card_.surface, styles.jobLink)}
      data-testid={TID.cardJobLink}
      data-card-id={card.id}
      data-card-type={card.type}
      data-card-state={card.state}
      data-state={card.state}
      aria-label={t('cards.job_link.label', { title: job.title, helper: name, status: words })}
      onClick={() => openChat(job.chatId)}
    >
      <span className={styles.head}>
        {helper && <Avatar face={helper.faceRef} name={helper.name} kind="helper" color={helper.colorToken} size="inline" />}
        <span className={styles.title} data-copy="ai">
          {title}
        </span>
        {helper && <span className={styles.openLabel}>{t('cards.job_link.open', { helper: name })}</span>}
      </span>
      {!done && (
        <span className={cx(styles.pill, styles[`pill_${status.tone}`])} data-testid={TID.cardJobLinkStatus} data-state={status.tone}>
          {status.tone === 'needs_you' && <Icon name="HandRight" size={16} />}
          {words}
        </span>
      )}
    </button>
  );
}
