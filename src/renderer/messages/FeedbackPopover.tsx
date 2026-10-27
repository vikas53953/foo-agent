// Spec: 04 §17.2 (👎 feedback popover: "What went wrong?", five multi-select chips, optional field, "Send feedback"
// disabled until a chip is on, "Cancel"), CR-0062 (X-219: the chips and words are kept on this PC). Loaded on first open
// from AnswerExtras (AT-322 first-script budget).
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/Popover';
import { cx } from '../ui/cx';
import styles from './Bubble.module.css';

const CHIPS = ['wrong', 'not_asked', 'too_long', 'too_short', 'other'] as const;
export type Chip = (typeof CHIPS)[number];

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

export function FeedbackPopover({
  anchor,
  onDone,
  onClose,
}: {
  anchor: HTMLElement;
  onDone: (chips: Chip[], note: string) => void;
  onClose: () => void;
}) {
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
        maxLength={500}
        placeholder={t('bubble.feedback.placeholder')}
        aria-label={t('bubble.feedback.placeholder')}
        data-testid={TID.bubbleFeedbackField}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className={styles.popButtons}>
        <Button
          variant="primary"
          size="md"
          disabled={chips.size === 0}
          data-testid={TID.bubbleFeedbackSend}
          onClick={() => onDone([...chips], note)}
        >
          {t('bubble.feedback.send')}
        </Button>
        <Button variant="secondary" size="md" data-testid={TID.bubbleFeedbackCancel} onClick={onClose}>
          {t('bubble.feedback.cancel')}
        </Button>
      </div>
    </Popover>
  );
}
