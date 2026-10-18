// Spec: 04-2 §23.2a (X-149: the error-notice stack above the composer row and the banner slot; each notice min-height 40,
// --r-md, --bad-soft fill, ErrorCircle 16 --bad, --t-small --fg-1 one line, Link "Copy code" → "Copied" for 2 s, Dismiss 16
// in a 40 hit; newest on top; 3 shown then "+{n} more"; "Clear all" at the right of the top notice with 2+ notices;
// Narrator assertive once on arrival; `composer-error` (`data-row-id`), `composer-error-copy`, `composer-error-dismiss`,
// `composer-errors-clear`), 10-1 AT-282. Which notices exist is ComposerNotices.ts (derived from the rows).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { JobRow, MessageRow } from '../../shared/types';
import { announce } from '../a11y/announce';
import { copyText } from '../messages/linkActions';
import { clockNow } from '../store/apply';
import { useStore } from '../store/index';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import {
  chatNotices,
  noticesDismiss,
  noticesEnter,
  noticesExpand,
  noticesLeave,
  stackView,
  useNoticeStore,
  type ErrorNotice,
} from './ComposerNotices';
import styles from './ComposerNoticeStack.module.css';

export const COPIED_MS = 2_000;
const NO_MESSAGES: MessageRow[] = [];

function useChatRows(chatId: string): { messages: MessageRow[]; jobs: JobRow[] } {
  const slice = useStore((s) => s.messages.byChat[chatId]);
  const jobs = useStore(useShallow((s) => (s.jobs.byChat[chatId] ?? []).map((id) => s.jobs.byId[id]!).filter(Boolean)));
  const messages = useMemo(() => (slice ? slice.ids.map((id) => slice.byId[id]!).filter(Boolean) : NO_MESSAGES), [slice]);
  return { messages, jobs };
}

export function ComposerNoticeStack({ chatId }: { chatId: string }) {
  useEffect(() => {
    noticesEnter(chatId, clockNow());
    return () => noticesLeave(chatId, clockNow());
  }, [chatId]);
  const { messages, jobs } = useChatRows(chatId);
  const cards = useStore((s) => s.cards.byId);
  const view = useNoticeStore((s) => s.views[chatId]);
  const expanded = useNoticeStore((s) => s.expanded[chatId] === true);
  const sendErrors = useNoticeStore((s) => s.sendErrors);
  const list = useMemo(
    () => (view ? chatNotices({ chatId, messages, jobs, cards, sendErrors }, view) : []),
    [chatId, messages, jobs, cards, sendErrors, view],
  );

  // Narrator: assertive once per notice, on arrival.
  const heard = useRef(new Set<string>());
  useEffect(() => {
    for (const n of list) {
      if (heard.current.has(n.rowId)) continue;
      heard.current.add(n.rowId);
      announce(n.text, 'assertive');
    }
  }, [list]);

  if (!list.length) return null;
  const { shown, more } = stackView(list, expanded);
  return (
    <div className={styles.stack}>
      {shown.map((n, i) => (
        <NoticeRow
          key={n.rowId}
          notice={n}
          onDismiss={() => noticesDismiss(chatId, [n.rowId], clockNow())}
          onClearAll={
            i === 0 && list.length >= 2
              ? () => {
                  noticesDismiss(
                    chatId,
                    list.map((x) => x.rowId),
                    clockNow(),
                  );
                  noticesExpand(chatId, false);
                }
              : undefined
          }
        />
      ))}
      {more > 0 && (
        <Button variant="link" className={styles.more} onClick={() => noticesExpand(chatId, true)}>
          {t('composer.errors.more', { n: more })}
        </Button>
      )}
    </div>
  );
}

function NoticeRow({ notice, onDismiss, onClearAll }: { notice: ErrorNotice; onDismiss: () => void; onClearAll?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <div className={styles.notice} data-testid={TID.composerError} data-row-id={notice.rowId} data-state={notice.source}>
      <span className={styles.icon}>
        <Icon name="ErrorCircle" size={16} />
      </span>
      <span className={styles.text}>{notice.text}</span>
      <Button
        variant="link"
        data-testid={TID.composerErrorCopy}
        data-state={copied ? 'copied' : undefined}
        onClick={() => void copyText(notice.code).then((ok) => ok && setCopied(true))}
      >
        {copied ? t('composer.error.copied') : t('composer.error.copy')}
      </Button>
      {onClearAll && (
        <Button variant="link" data-testid={TID.composerErrorsClear} onClick={onClearAll}>
          {t('composer.errors.clear')}
        </Button>
      )}
      <Tooltip text={t('composer.error.dismiss')} side="top">
        <button
          type="button"
          className={styles.close}
          aria-label={t('composer.error.dismiss')}
          data-testid={TID.composerErrorDismiss}
          onClick={onDismiss}
        >
          <Icon name="Dismiss" size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
