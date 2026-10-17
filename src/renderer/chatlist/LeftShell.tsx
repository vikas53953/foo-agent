// Spec: 03-shell-1 §3.4 left shell (`<nav aria-label="Chats">`, test id `sidebar`), §3.4.1 column (`--bg-sidebar`, 1px
// `--line` right edge; header 60 · search 52 · chips 44 · list (scrolls) · footer 64; resize handle at L and M), §3.4.9
// (the pin-limit line "You can pin up to 3 chats." for 4 s under the header, `role="status"`, `chatlist-status`).
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { ChatList } from './ChatList';
import { ChatListHeader } from './ChatListHeader';
import { ChatSearch } from './ChatSearch';
import { FilterChips } from './FilterChips';
import { onListStatus, PIN_STATUS_MS } from './actions';
import { ResizeHandle } from './ResizeHandle';
import { SidebarFooter } from './SidebarFooter';
import styles from './LeftShell.module.css';

function useListStatus(): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onListStatus((key) => {
      if (timer) clearTimeout(timer);
      setText(key === 'pin_limit' ? t('chatlist.status.pin_limit') : null);
      if (key) timer = setTimeout(() => setText(null), PIN_STATUS_MS);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return text;
}

export function LeftShell() {
  const status = useListStatus();
  return (
    <nav className={styles.left} data-testid={TID.sidebar} aria-label={t('sidebar.landmark.label')}>
      <ChatListHeader />
      <div className={styles.status} role="status" data-testid={TID.chatlistStatus} data-state={status ? 'shown' : 'empty'}>
        {status}
      </div>
      <ChatSearch />
      <FilterChips />
      <ChatList />
      <SidebarFooter />
      <ResizeHandle />
    </nav>
  );
}
