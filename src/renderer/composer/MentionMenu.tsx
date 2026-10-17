// Spec: 04-2 §22.8 (@ mention menu: above the field, left edge at the caret's x kept inside the window, 280 wide, --bg-raised,
// --r-md, --shadow-16, padding 4; rows 40, padding 0 8, --r-sm: 26 avatar + 8 + name --t-body-strong + 8 + job --t-small
// --fg-2; 6 rows visible then it scrolls; selected row --bg-hover; no match → "No helper called “{text}”."; no helpers → "You
// have no helpers yet" + Link "Make a helper"; role="listbox" with aria-activedescendant; `composer-mention`,
// `composer-mention-row` (data-index), `composer-mention-make`).
import { useLayoutEffect, useRef } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { HelperRow } from '../../shared/types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import styles from './Composer.module.css';

export const MENTION_LIST_ID = 'composer-mention-list';
export const mentionRowId = (i: number) => `composer-mention-${i}`;

export interface MentionMenuProps {
  helpers: HelperRow[];
  matches: HelperRow[];
  query: string;
  index: number;
  x: number;
  bottom: number;
  onPick: (h: HelperRow) => void;
  onHover: (i: number) => void;
  onMakeHelper: () => void;
}

export function MentionMenu({ helpers, matches, query, index, x, bottom, onPick, onHover, onMakeHelper }: MentionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gap = 8;
    const w = el.getBoundingClientRect().width;
    el.style.left = `${Math.min(Math.max(gap, x), window.innerWidth - w - gap)}px`;
    el.style.bottom = `${window.innerHeight - bottom + gap}px`;
    el.querySelector(`#${mentionRowId(index)}`)?.scrollIntoView({ block: 'nearest' });
  }, [x, bottom, index]);
  return (
    <div ref={ref} className={styles.mentionMenu} data-testid={TID.composerMention}>
      {helpers.length === 0 ? (
        <div className={styles.mentionEmpty}>
          <span>{t('composer.mention.empty')}</span>
          <Button variant="link" data-testid={TID.composerMentionMake} onMouseDown={(e) => e.preventDefault()} onClick={onMakeHelper}>
            {t('composer.mention.make')}
          </Button>
        </div>
      ) : matches.length === 0 ? (
        <div className={styles.mentionEmpty} role="status">
          {t('composer.mention.none', { text: query })}
        </div>
      ) : (
        <div id={MENTION_LIST_ID} role="listbox" aria-label={t('composer.mention.make')} aria-activedescendant={mentionRowId(index)}>
          {matches.map((h, i) => (
            <div
              key={h.id}
              id={mentionRowId(i)}
              role="option"
              aria-selected={i === index}
              className={styles.mentionRow}
              data-testid={TID.composerMentionRow}
              data-index={i}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(h)}
            >
              <Avatar face={h.faceRef} name={h.name} kind="helper" color={h.colorToken} size="inline" />
              <span className={styles.mentionName}>{h.name}</span>
              <span className={styles.mentionJob}>{h.jobText}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
