// Spec: 03-shell-1 §3.5 (main shell: --bg-app, no wallpaper; header 60 · optional find bar 52 · message list · composer;
// <main aria-label="Chat with {name}">; chat switch budget, skeleton, error state), 03-shell-2 §3.6.1 (composer row reserved:
// a separate grid row whose height 04 sets; the shell assumes none), §3.6.2–§3.6.7. The lead mounts this in A's shell grid.
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button, Icon, Skeleton, selectChat, selectFindOpen, useStore, type ChatRow } from '../_m1b-stubs';
import { MessageList } from '../messages/MessageList';
import { ChatHeader } from './ChatHeader';
import { FindBar, FindProvider } from './FindBar';
import styles from './MainShell.module.css';
import { useChatOpen } from './useChatOpen';

export function MainShell({ chatId }: { chatId: string }) {
  const chat = useStore(selectChat(chatId));
  if (!chat) return <main className={styles.main} data-testid={TID.thread} />;
  return <ChatView key={chat.id} chat={chat} />;
}

function ChatView({ chat }: { chat: ChatRow }) {
  const findOpen = useStore(selectFindOpen);
  const open = useChatOpen(chat.id);
  // Unread count as the chat opened: the divider stays put until the user leaves or sends (§3.6.5).
  const [unread] = useState(() => ({ count: chat.unreadCount }));
  const name = chat.kind === 'foo' && chat.private ? t('chat_header.private.title') : chat.title;

  return (
    <FindProvider chatId={chat.id} open={findOpen}>
      <main className={styles.main} aria-label={t('thread.landmark.label', { name })} data-testid={TID.thread} data-state={open.state}>
        <div className={styles.head}>
          <ChatHeader chat={chat} findOpen={findOpen} />
          {findOpen && <FindBar />}
        </div>
        <div className={styles.list}>
          {open.state === 'ready' && <MessageList chat={chat} unread={unread} />}
          {open.state === 'skeleton' && <ThreadSkeleton />}
          {open.state === 'error' && <ThreadError onRetry={open.retry} />}
        </div>
        <div className={styles.composer} data-composer-row />
      </main>
    </FindProvider>
  );
}

/** 03-shell-1 §3.5: 4 skeleton bubbles, alternating sides, widths 40/60/30/50 %. */
function ThreadSkeleton() {
  return (
    <div className={styles.skeleton} data-testid={TID.threadSkeleton} aria-hidden>
      {[40, 60, 30, 50].map((w, i) => (
        <span key={w} className={styles.skelRow} data-side={i % 2 ? 'me' : 'them'}>
          <Skeleton className={`${styles.skel} ${styles[`skel${w}`]}`} />
        </span>
      ))}
    </div>
  );
}

function ThreadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.error} data-testid={TID.threadError} role="alert">
      <span className={styles.errorIcon}>
        <Icon name="ErrorCircle" size={24} />
      </span>
      <p className={styles.errorText}>{t('thread.error.body')}</p>
      <Button variant="secondary" data-testid={TID.threadErrorRetry} onClick={onRetry}>
        {t('thread.error.action')}
      </Button>
    </div>
  );
}
