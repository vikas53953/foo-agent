// Spec: 04-2 §22.7 (composer notice: one line in the strip slot, ErrorCircle 16 --bad or Info 16 --accent + 8 + --t-small
// --fg-1, no fill, 24 tall; gone after 8 s or on the next input; announced politely; `composer-notice`), §23.6 (the counter
// "{n} left" --t-caption --fg-3 tabular from 9,000 characters, "{n} too many" --bad over 10,000, at the right of this slot;
// `composer-counter`).
import { useEffect } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { Icon } from '../ui/Icon';
import styles from './Composer.module.css';

export const NOTICE_MS = 8_000;

export interface Notice {
  text: string;
  tone: 'bad' | 'info';
  at: number;
}

export function ComposerNotice({ notice, counter }: { notice: Notice | null; counter: { n: number; over: boolean } | null }) {
  useEffect(() => {
    if (notice) announce(notice.text);
  }, [notice]);
  if (!notice && !counter) return null;
  return (
    <div className={styles.noticeRow}>
      {notice && (
        <span className={styles.notice} data-testid={TID.composerNotice} data-state={notice.tone}>
          <span className={notice.tone === 'bad' ? styles.noticeBad : styles.noticeInfo}>
            <Icon name={notice.tone === 'bad' ? 'ErrorCircle' : 'Info'} size={16} />
          </span>
          {notice.text}
        </span>
      )}
      {counter && (
        <span className={styles.counter} data-testid={TID.composerCounter} data-over={counter.over || undefined}>
          {counter.over
            ? t('composer.counter.too_many', { n: counter.n.toLocaleString('en-IN') })
            : t('composer.counter.left', { n: counter.n.toLocaleString('en-IN') })}
        </span>
      )}
    </div>
  );
}
