// Spec: 05-3 §5.20 Error card (one shape: line 1 what happened `--t-body-strong`, line 2 what is safe `--t-body`, exactly
// one fix button + at most one Link button, Art. 2; edge `--bad` for failures, `--warn` for paused/limits; icon ErrorCircle
// `--bad` (failures), Clock `--warn` (limits, waiting), Key `--warn` (signed out), Globe `--warn` (offline, site),
// ArrowClockwise `--fg-2` (recovery); states shown / asking / fixed "Fixed · {time}" + "Back on it…" (SM-A10) / resumed / stopped / dismissed; Resume edits
// the card in place, never a new message; Ctrl+Enter = the fix button; Narrator "Problem: {line 1}. {line 2}", assertive for
// failures). The words are the runner's (payload, from `errors.{kind}.*`). G-M4-09 / CR-0008: each FixAction goes to one
// channel — recovery resume/stop → `recovery:choose`; retry on a failed or stopped job → `job:retry`; raise_cap → C-21;
// open_url → `link:open`; every other action → `error:fix` (main checks it against the card).
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import type { Result } from '../../shared/errors';
import { formatTime } from '../../shared/format';
import type { CardRow, ErrorKind, ErrorPayload, FixAction } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectJob } from '../store/jobs';
import { selectSpend } from '../store/spend';
import { Icon, type IconName } from '../ui/Icon';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { RaiseCapDialog } from './RaiseCapDialog';
import { ctrlEnter, useCardAction } from './useCardAction';
import styles from './JobCards.module.css';

type Look = { icon: IconName; tone: 'bad' | 'warn' | 'dim'; edge?: 'bad' | 'warn' };

/** 05-3 §5.20.1 icon and edge per kind. */
export function errorLook(kind: ErrorKind, variant: ErrorPayload['variant']): Look {
  if (variant === 'recovery' || kind === 'SAFE_MODE' || kind === 'DB_REBUILT') return { icon: 'ArrowClockwise', tone: 'dim' };
  switch (kind) {
    case 'NET_OFFLINE':
    case 'SITE_BLOCKED':
      return { icon: 'Globe', tone: 'warn', edge: 'warn' };
    case 'AI_LIMIT':
    case 'SPEND_CAP':
      return { icon: 'Clock', tone: 'warn', edge: 'warn' };
    case 'AI_SIGNED_OUT':
    case 'AI_KEY_INVALID':
      return { icon: 'Key', tone: 'warn', edge: 'warn' };
    default:
      return { icon: 'ErrorCircle', tone: 'bad', edge: 'bad' };
  }
}

const OPEN = ['shown', 'asking'];

export function ErrorCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as ErrorPayload;
  const job = useStore(selectJob(p.jobId ?? card.jobId ?? ''));
  const spend = useStore(selectSpend);
  const [capDialog, setCapDialog] = useState(false);
  const { busy, run } = useCardAction<'fix' | 'link'>();
  const label = t('cards.error.label', { line1: p.whatHappened, line2: p.whatIsSafe });
  const look = errorLook(p.kind, p.variant);
  const answer = { cardId: card.id, nonce: card.nonce, resolvedBy: 'tap' as const };

  const dispatch = (action: FixAction): Promise<Result<unknown>> | undefined => {
    if (p.variant === 'recovery' && (action.kind === 'resume_job' || action.kind === 'stop'))
      return invoke('recovery:choose', { ...answer, choice: action.kind === 'resume_job' ? 'resume' : 'stop' });
    if (action.kind === 'retry' && job && (job.state === 'failed' || job.state === 'cancelled'))
      return invoke('job:retry', { jobId: job.id });
    if (action.kind === 'raise_cap') {
      setCapDialog(true);
      return undefined;
    }
    if (action.kind === 'open_url') return invoke('link:open', { url: action.url });
    return invoke('error:fix', { ...answer, action });
  };

  if (card.state === 'fixed')
    return (
      <CardFrame tid="cardError" card={card} state={card.state} label={label}>
        <div className={styles.summary}>
          <Icon name="CheckmarkCircle" size={16} className={styles.ok} />
          <span className={styles.summaryText}>
            {t('cards.error.summary.fixed', { time: formatTime(card.resolvedAt ?? card.updatedAt, { timeZone: time.timeZone }) })}
          </span>
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
        {p.resumedLine && <div className={styles.body}>{p.resumedLine}</div>}
      </CardFrame>
    );

  const open = OPEN.includes(card.state);
  const fix = open ? () => run('fix', () => dispatch(p.button.action)) : null;
  return (
    <CardFrame
      tid="cardError"
      card={card}
      state={card.state}
      label={label}
      edge={open ? look.edge : undefined}
      muted={!open}
      busy={busy !== null}
      onKeyDown={ctrlEnter(busy === null && card.state === 'asking' ? fix : null)}
    >
      <div className={styles.head} role={open && look.tone === 'bad' ? 'alert' : undefined}>
        <Icon name={look.icon} size={20} className={styles[`${look.tone}Icon`]} />
        <span className={styles.title}>{p.whatHappened}</span>
      </div>
      <div className={styles.body}>{p.whatIsSafe}</div>
      {p.doneLines?.map((l, i) => (
        <div key={i} className={styles.body}>
          {l}
        </div>
      ))}
      <div className={styles.foot}>
        {open && card.state === 'asking' && (
          <div className={styles.buttons}>
            <CardButton tid="cardErrorFix" kind="primary" busy={busy === 'fix'} disabled={busy !== null} onClick={fix!}>
              {p.button.label}
            </CardButton>
            {p.secondary && (
              <CardButton
                tid="cardErrorLink"
                kind="link"
                busy={busy === 'link'}
                disabled={busy !== null}
                onClick={() => run('link', () => dispatch(p.secondary!.action))}
              >
                {p.secondary.label}
              </CardButton>
            )}
          </div>
        )}
        <span className={styles.spacer} />
        <CardTimeLabel {...time} />
      </div>
      {capDialog && spend && <RaiseCapDialog capPaise={spend.aiCapPaise} onClose={() => setCapDialog(false)} />}
    </CardFrame>
  );
}
