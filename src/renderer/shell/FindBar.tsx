// Spec: 03-shell-2 §3.6.3 (find bar under the chat header: 52 strip, 36 search field, "{i} of {n}" / "No matches",
// Previous / Next / Close; Enter next, Shift+Enter previous, Esc closes and returns focus to the message list; local search;
// the list centres the current match), J22 step 7.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { MessageRow } from '../../shared/types';
import { focusPane } from '../a11y/focusTargets';
import { setFindOpen, useStore } from '../store/index';
import { selectChatMessages } from '../store/messages';
import { IconButton } from '../ui/IconButton';
import { TextField } from '../ui/TextField';
import styles from './FindBar.module.css';
import { findMatches, stepMatch, type FindMatch } from './findMatches';

export interface FindState {
  open: boolean;
  query: string;
  matches: FindMatch[];
  index: number;
  setQuery: (q: string) => void;
  step: (dir: 1 | -1) => void;
}

const FindContext = createContext<FindState>({
  open: false,
  query: '',
  matches: [],
  index: -1,
  setQuery: () => undefined,
  step: () => undefined,
});
export const useFind = () => useContext(FindContext);

export function FindProvider({ chatId, open, children }: { chatId: string; open: boolean; children: ReactNode }) {
  const chat = useStore(selectChatMessages(chatId));
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(-1);
  const messages = useMemo<MessageRow[]>(() => (chat ? chat.ids.map((id) => chat.byId[id]!) : []), [chat]);
  const matches = useMemo(() => (open ? findMatches(messages, query) : []), [messages, query, open]);

  // Derived during render (no effect): closing clears the query; a new query or match count puts the cursor on the newest
  // match. MainShell keys the provider by chat, so a chat switch starts fresh.
  const [seen, setSeen] = useState({ open, query, n: matches.length });
  if (seen.open !== open || seen.query !== query || seen.n !== matches.length) {
    setSeen({ open, query, n: matches.length });
    if (!open && query) setQuery('');
    setIndex(matches.length ? matches.length - 1 : -1);
  }

  const value = useMemo<FindState>(
    () => ({ open, query, matches, index, setQuery, step: (dir) => setIndex((i) => stepMatch(i, matches.length, dir)) }),
    [open, query, matches, index],
  );
  return <FindContext.Provider value={value}>{children}</FindContext.Provider>;
}

export const focusMessageList = () => requestAnimationFrame(() => void focusPane('messages'));

export function closeFind() {
  setFindOpen(false);
  focusMessageList();
}

export function FindBar() {
  const f = useFind();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);

  const count = f.query.trim()
    ? f.matches.length
      ? t('thread.find.count', { i: f.index + 1, n: f.matches.length })
      : t('thread.find.none')
    : '';

  return (
    <div className={styles.strip} data-testid={TID.threadFind}>
      <TextField
        ref={field}
        size="sm"
        shape="search"
        className={styles.field}
        type="search"
        data-find-field
        data-testid={TID.threadFindField}
        placeholder={t('thread.find.placeholder')}
        aria-label={t('thread.find.placeholder')}
        value={f.query}
        onChange={(e) => f.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            f.step(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeFind();
          }
        }}
      />
      <span className={styles.count} data-testid={TID.threadFindCount} hidden={!count} aria-live="off">
        {count}
      </span>
      <IconButton
        icon="ChevronUp"
        label={t('thread.find.prev')}
        data-testid={TID.threadFindPrev}
        disabled={!f.matches.length}
        onClick={() => f.step(-1)}
      />
      <IconButton
        icon="ChevronDown"
        label={t('thread.find.next')}
        data-testid={TID.threadFindNext}
        disabled={!f.matches.length}
        onClick={() => f.step(1)}
      />
      <IconButton icon="Dismiss" label={t('thread.find.close')} data-testid={TID.threadFindClose} onClick={closeFind} />
    </div>
  );
}
