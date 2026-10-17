// Spec: 03-shell-1 §3.4.3 search field (margin 0 16 8; `--field-h` 36; `--r-full`; `--bg-sunken`; Search 16 `--fg-3` 12
// from the left; `--t-small`; placeholder "Search chats"; Clear button 36 hit when text is present; filters live with no
// debounce, combined with the chip; Enter opens the first match; ↓ moves into the list; Esc clears, a second Esc returns
// to the list; Ctrl+Shift+F focuses it; `role="searchbox"`, `aria-controls` = the list; `announce("{n} chats")` at most
// once per 2 s), 02-3 §F25.2 (announce). `chatSearch` is the seam the Esc ladder (03-shell-2 §3.9.4) uses.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { focusPane, registerFocusTarget } from '../a11y/focusTargets';
import { openChat } from '../shell/actions';
import { setChatQuery, useStore } from '../store/index';
import { selectVisibleChatIds } from '../store/chats';
import { selectChatQuery } from '../store/ui';
import { Icon } from '../ui/Icon';
import styles from './ChatSearch.module.css';

export const SEARCH_ANNOUNCE_MS = 2000;
export const CHATLIST_DOM_ID = 'chatlist';

/** For the Esc ladder: "clear the search field" is one of its steps. */
export const chatSearch = {
  hasText: (): boolean => useStore.getState().ui.chatQuery !== '',
  clear: (): void => setChatQuery(''),
};

function useCountAnnouncer(query: string): void {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (query === '') return;
    const say = () => {
      last.current = Date.now();
      timer.current = null;
      announce(t('sidebar.search.count', { count: selectVisibleChatIds(useStore.getState()).length }), 'polite');
    };
    const wait = SEARCH_ANNOUNCE_MS - (Date.now() - last.current);
    if (timer.current) clearTimeout(timer.current);
    if (wait <= 0) say();
    else timer.current = setTimeout(say, wait);
  }, [query]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}

export function ChatSearch() {
  const query = useStore(selectChatQuery);
  const input = useRef<HTMLInputElement>(null);
  useCountAnnouncer(query);

  useEffect(
    () =>
      registerFocusTarget('search', () => {
        const el = input.current;
        if (!el || !el.isConnected) return false;
        el.focus();
        el.select();
        return true;
      }),
    [],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query !== '') setChatQuery('');
      else focusPane('chatlist');
    } else if (e.key === 'Enter') {
      const first = selectVisibleChatIds(useStore.getState())[0];
      if (first) {
        e.preventDefault();
        openChat(first);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusPane('chatlist');
    }
  };

  return (
    <div className={styles.box} data-testid={TID.sidebarSearchField}>
      <Icon name="Search" size={16} className={styles.icon} />
      <input
        ref={input}
        className={styles.input}
        type="search"
        role="searchbox"
        value={query}
        placeholder={t('sidebar.search.placeholder')}
        aria-label={t('sidebar.search.placeholder')}
        aria-controls={CHATLIST_DOM_ID}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setChatQuery(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      {query !== '' && (
        <button
          type="button"
          className={styles.clear}
          aria-label={t('sidebar.search.clear')}
          data-testid={TID.sidebarSearchClear}
          onClick={() => {
            setChatQuery('');
            input.current?.focus();
          }}
        >
          <Icon name="Dismiss" size={16} />
        </button>
      )}
    </div>
  );
}
