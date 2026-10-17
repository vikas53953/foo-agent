// Spec: 04 §17.1 (action row under foo's latest text answer: Copy (→ Checkmark `--ok` 2 s) · Try again · 👍 · 👎, 32px icon
// buttons 4 apart, 4px below the bubble), §17.2 (👎 feedback popover: "What went wrong?", five multi-select chips, optional
// field, "Send feedback" disabled until a chip is on, "Cancel"; after send "Thanks. I'll keep that in mind." for 4 s), §15
// ("Worked for 12s ›" link that expands into the step list, ChevronRight → ChevronDown, `aria-expanded`), §19.4 (inline error
// row "That reply got cut off." + "Try again"), §19.6 ("Why am I getting this?" footer and popover: reason by source, "Stop
// these" / "Keep them", caption for 4 s).
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import type { MessageWhy, StepRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectExpanded, selectFeedback, setFeedback, toggleExpand } from '../store/messages';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Popover } from '../ui/Popover';
import { cx } from '../ui/cx';
import { workedAccessible, workedLabel } from './bubbleState';
import { copyText } from './linkActions';
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

const CHIPS = ['wrong', 'not_asked', 'too_long', 'too_short', 'other'] as const;
type Chip = (typeof CHIPS)[number];

function chipLabel(c: Chip): string {
  switch (c) {
    case 'wrong':
      return t('bubble.feedback.chip.wrong');
    case 'not_asked':
      return t('bubble.feedback.chip.not_asked');
    case 'too_long':
      return t('bubble.feedback.chip.too_long');
    case 'too_short':
      return t('bubble.feedback.chip.too_short');
    case 'other':
      return t('bubble.feedback.chip.other');
  }
}

function FeedbackPopover({ anchor, onDone, onClose }: { anchor: HTMLElement; onDone: () => void; onClose: () => void }) {
  const [chips, setChips] = useState<Set<Chip>>(new Set());
  const [note, setNote] = useState('');
  const toggle = (c: Chip) =>
    setChips((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  return (
    <Popover anchor={anchor} label={t('bubble.feedback.title')} tid="bubbleFeedback" autoFocus onClose={onClose}>
      <div className={styles.popTitle}>{t('bubble.feedback.title')}</div>
      <div className={styles.feedbackChips}>
        {CHIPS.map((c, i) => (
          <button
            key={c}
            type="button"
            className={cx(styles.fbChip, chips.has(c) && styles.fbChipOn)}
            aria-pressed={chips.has(c)}
            data-testid={TID.bubbleFeedbackChip}
            data-index={i}
            onClick={() => toggle(c)}
          >
            {chips.has(c) && <Icon name="Checkmark" size={16} />}
            {chipLabel(c)}
          </button>
        ))}
      </div>
      <textarea
        className={styles.fbField}
        rows={1}
        placeholder={t('bubble.feedback.placeholder')}
        aria-label={t('bubble.feedback.placeholder')}
        data-testid={TID.bubbleFeedbackField}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className={styles.popButtons}>
        <Button variant="primary" size="md" disabled={chips.size === 0} data-testid={TID.bubbleFeedbackSend} onClick={onDone}>
          {t('bubble.feedback.send')}
        </Button>
        <Button variant="secondary" size="md" data-testid={TID.bubbleFeedbackCancel} onClick={onClose}>
          {t('bubble.feedback.cancel')}
        </Button>
      </div>
    </Popover>
  );
}

export function ActionRow({
  messageId,
  text,
  canTryAgain,
  onTryAgain,
}: {
  messageId: string;
  text: string;
  canTryAgain: boolean;
  onTryAgain: () => void;
}) {
  const feedback = useStore(selectFeedback(messageId));
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
        <FeedbackPopover
          anchor={bad}
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            setFeedback(messageId, 'bad');
            flashThanks();
          }}
        />
      )}
    </div>
  );
}

/** §17.1: an older answer keeps its 👍 / 👎 as a tiny 16px glyph next to the meta. */
export function FeedbackMark({ messageId }: { messageId: string }) {
  const f = useStore(selectFeedback(messageId));
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

export function CutOffRow({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.cutOff}>
      <Icon name="ErrorCircle" size={16} className={styles.bad} />
      <span>{t('bubble.error.cut_off')}</span>
      <button type="button" className={styles.linkButton} data-testid={TID.bubbleErrorRetry} onClick={onRetry}>
        {t('bubble.error.retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- §19.6 Why am I getting this?

export function whyReason(why: MessageWhy, o: { timeZone: string; now: number }): string {
  const v = why.vars;
  const date = v.at ? formatDate(Number(v.at), 'date', o) : (v.date ?? '');
  switch (why.source) {
    case 'routine_asked':
      return t('bubble.why.reason.routine_asked', { date, title: v.title ?? '' });
    case 'routine_suggested':
      return t('bubble.why.reason.routine_suggested', { date, title: v.title ?? '' });
    case 'suggestion':
      return t('bubble.why.reason.suggestion', { what: v.what ?? '' });
    case 'habit_offer':
      return t('bubble.why.reason.habit_offer', { count: Number(v.count ?? 0) });
    case 'housekeeping':
      return t('bubble.why.reason.housekeeping');
    case 'cap_warning':
      return t('bubble.why.reason.cap_warning');
  }
}

/**
 * What "Stop these" can do in M2 (implementation-notes GAP): a routine is paused with routine:pause; the cap warning turns
 * `money.warnAt80` off. Suggestion kinds, habit offers and housekeeping messages have no settings keys or channel yet, so
 * their Stop only closes the popover with the caption.
 */
async function stopSource(why: MessageWhy): Promise<boolean> {
  if ((why.source === 'routine_asked' || why.source === 'routine_suggested') && why.routineId) {
    return (await invoke('routine:pause', { routineId: why.routineId })).ok;
  }
  if (why.source === 'cap_warning') return (await invoke('settings:set', { path: 'money.warnAt80', value: false })).ok;
  return true;
}

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
        <Popover anchor={anchor} label={t('bubble.why.title')} tid="bubbleWhyPopover" autoFocus onClose={() => setOpen(false)}>
          <div className={styles.popTitle}>{t('bubble.why.title')}</div>
          <p className={styles.popBody}>{whyReason(why, { timeZone, now })}</p>
          <div className={styles.popButtons}>
            <Button
              variant="secondary"
              size="md"
              data-testid={TID.bubbleWhyStop}
              onClick={() => {
                setOpen(false);
                void stopSource(why).then((ok) => ok && flashStopped());
              }}
            >
              {t('bubble.why.stop')}
            </Button>
            <Button variant="primary" size="md" data-testid={TID.bubbleWhyKeep} onClick={() => setOpen(false)}>
              {t('bubble.why.keep')}
            </Button>
          </div>
        </Popover>
      )}
    </div>
  );
}
