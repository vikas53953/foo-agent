// Spec: 04 §17.1 (action row under foo's latest text answer only, CR-0059 row 2 / X-216; CR-0024 F7: Copy
// (→ Checkmark `--ok` 2 s) · Try again · 👍 · 👎, 32px icon buttons 4 apart, 4px below the bubble), §17.2 (👎 feedback popover: "What went wrong?", five multi-select chips, optional
// field, "Send feedback" disabled until a chip is on, "Cancel"; after send "Thanks. I'll keep that in mind." for 4 s), §15
// ("Worked for 12s ›" link that expands into the step list, ChevronRight → ChevronDown, `aria-expanded`), §19.4 (inline error
// row "That reply got cut off." + "Try again"), §19.6 ("Why am I getting this?" footer and popover: reason by source, "Stop
// these" / "Keep them", caption for 4 s).
// 02 §F7.1 "Chat" (CR-0021, X-179): the cut-off row's retry spinner turns into ✓.
import { lazy, Suspense, useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import type { MessageWhy, StepRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectExpanded, selectFeedback, setFeedback, toggleExpand } from '../store/messages';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { cx } from '../ui/cx';
import { workedAccessible, workedLabel } from './bubbleState';
import { copyText } from './linkActions';
import { RetryControl } from './BubbleParts';
import type { RetryPhase } from './retry';
import styles from './Bubble.module.css';

/** 04 §17.2 and §19.6 captions stay for 4 s. */
export const CAPTION_MS = 4000;

function useFlag(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return [on, () => setOn(true)];
}

// ---------------------------------------------------------------- §17.1 / §17.2

/** 04 §17.2: the 👎 popover loads on its first open (AT-322 first-script budget, CR-0062). */
const FeedbackPopover = lazy(() => import('./FeedbackPopover').then((m) => ({ default: m.FeedbackPopover })));

export function ActionRow({
  messageId,
  stored,
  text,
  canTryAgain,
  onTryAgain,
}: {
  messageId: string;
  /** The stored vote (`MessageRow.feedback`, CR-0062). */
  stored: 'good' | 'bad' | null | undefined;
  text: string;
  canTryAgain: boolean;
  onTryAgain: () => void;
}) {
  const feedback = useStore(selectFeedback(messageId, stored));
  const [copied, flashCopied] = useFlag(motion['dur-confirm']);
  const [thanks, flashThanks] = useFlag(CAPTION_MS);
  const [bad, setBad] = useState<HTMLDivElement | null>(null);
  const [asking, setAsking] = useState(false);
  return (
    <div className={styles.actionsWrap}>
      <div className={styles.actions} role="toolbar" aria-label={t('bubble.toolbar.more')}>
        <IconButton
          icon={copied ? 'Checkmark' : 'Copy'}
          iconSize={16}
          className={cx(styles.actionButton, copied && styles.actionOk)}
          label={t('bubble.actions.copy')}
          tooltip={t('bubble.actions.copy')}
          data-testid={TID.bubbleActionsCopy}
          onClick={() => void copyText(text).then((ok) => ok && flashCopied())}
        />
        {canTryAgain && (
          <IconButton
            icon="ArrowClockwise"
            iconSize={16}
            className={styles.actionButton}
            label={t('bubble.actions.retry')}
            tooltip={t('bubble.actions.retry')}
            data-testid={TID.bubbleActionsRetry}
            onClick={onTryAgain}
          />
        )}
        <IconButton
          icon="ThumbLike"
          iconSize={16}
          className={styles.actionButton}
          pressed={feedback === 'good'}
          label={t('bubble.actions.good')}
          tooltip={t('bubble.actions.good')}
          data-testid={TID.bubbleActionsGood}
          onClick={() => setFeedback(messageId, feedback === 'good' ? null : 'good')}
        />
        <div ref={setBad} className={styles.actionAnchor}>
          <IconButton
            icon="ThumbDislike"
            iconSize={16}
            className={styles.actionButton}
            pressed={feedback === 'bad'}
            label={t('bubble.actions.bad')}
            tooltip={t('bubble.actions.bad')}
            aria-haspopup="dialog"
            data-testid={TID.bubbleActionsBad}
            onClick={() => (feedback === 'bad' ? setFeedback(messageId, null) : setAsking(true))}
          />
        </div>
      </div>
      {thanks && <div className={styles.caption}>{t('bubble.feedback.thanks')}</div>}
      {asking && bad && (
        <Suspense fallback={null}>
          <FeedbackPopover
            anchor={bad}
            onClose={() => setAsking(false)}
            onDone={(chips, note) => {
              setAsking(false);
              setFeedback(messageId, 'bad', { chips, note });
              flashThanks();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

/** §17.1: an older answer keeps its 👍 / 👎 as a tiny 16px glyph next to the meta. */
export function FeedbackMark({ messageId, stored }: { messageId: string; stored: 'good' | 'bad' | null | undefined }) {
  const f = useStore(selectFeedback(messageId, stored));
  if (!f) return null;
  return (
    <span className={styles.fbMark} aria-hidden="true">
      <Icon name={f === 'good' ? 'ThumbLike' : 'ThumbDislike'} size={16} />
    </span>
  );
}

// ---------------------------------------------------------------- §15 Worked for

function stepText(s: StepRow): string {
  const text = s.slots.text;
  return typeof text === 'string' && text ? text : s.phraseKey;
}

export function WorkedLine({ messageId, jobId, ms }: { messageId: string; jobId: string; ms: number }) {
  const open = useStore(selectExpanded(messageId, 'worked'));
  const [steps, setSteps] = useState<StepRow[] | null>(null);
  useEffect(() => {
    if (!open || steps) return;
    let live = true;
    void invoke('job:details', { jobId }).then((r) => live && setSteps(r.ok ? r.value.steps : []));
    return () => {
      live = false;
    };
  }, [open, steps, jobId]);
  return (
    <div className={styles.worked}>
      <button
        type="button"
        className={styles.workedButton}
        aria-expanded={open}
        aria-label={workedAccessible(ms)}
        data-testid={TID.bubbleWorked}
        onClick={() => toggleExpand(messageId, 'worked')}
      >
        <span>{workedLabel(ms).replace(/\s*›$/, '')}</span>
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={16} />
      </button>
      {open && steps && (
        <ul className={styles.steps}>
          {steps.map((s) => (
            <li key={s.id} className={styles.step} data-state={s.state}>
              <Icon name={s.state === 'done' ? 'Checkmark' : s.state === 'failed' ? 'ErrorCircle' : 'Clock'} size={16} />
              <span>{stepText(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- §19.4 inline error

export function CutOffRow({ phase, onRetry }: { phase: RetryPhase; onRetry: () => void }) {
  return (
    <div className={styles.cutOff} data-retry={phase}>
      <Icon name="ErrorCircle" size={16} className={styles.bad} />
      <span>{t('bubble.error.cut_off')}</span>
      <RetryControl phase={phase} label={t('bubble.error.retry')} tid="bubbleErrorRetry" onRetry={onRetry} />
    </div>
  );
}

// ---------------------------------------------------------------- §19.6 Why am I getting this?

/** 04 §19.6: the popover loads on its first open (AT-322 first-script budget). */
const WhyPopover = lazy(() => import('./WhyPopover').then((m) => ({ default: m.WhyPopover })));

export function WhyFooter({ why, timeZone, now }: { why: MessageWhy; timeZone: string; now: number }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [stopped, flashStopped] = useFlag(CAPTION_MS);
  return (
    <div className={styles.why}>
      <button
        ref={setAnchor}
        type="button"
        className={styles.whyLink}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={TID.bubbleWhy}
        onClick={() => setOpen(true)}
      >
        {t('bubble.why.link')}
      </button>
      {stopped && <div className={styles.caption}>{t('bubble.why.stopped')}</div>}
      {open && anchor && (
        <Suspense fallback={null}>
          <WhyPopover anchor={anchor} why={why} timeZone={timeZone} now={now} onClose={() => setOpen(false)} onStopped={flashStopped} />
        </Suspense>
      )}
    </div>
  );
}
