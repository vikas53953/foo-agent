// Spec: 03-shell-1 §3.5 chat switch (newest 50 cached messages within 100 ms, Article 28; a cache miss longer than
// --delay-skeleton-chat 300 ms shows the skeleton; failure shows the error state with "Try again"), 08-5 §5 rule 5
// (the first open shows the newest 50 from chat:open), 08-1 §3.2 chat:open (store/apply.ts loadChat).
import { useCallback, useEffect, useState } from 'react';
import { motion } from '../../shared/tokens';
import { loadChat } from '../store/apply';
import { useStore } from '../store/index';

export type OpenState = 'ready' | 'waiting' | 'skeleton' | 'error';

export function useChatOpen(chatId: string): { state: OpenState; retry: () => void } {
  const cached = useStore((s) => !!s.messages.byChat[chatId]);
  const [pending, setPending] = useState<'waiting' | 'skeleton' | 'error'>('waiting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // MainShell keys ChatView by chat id, so a cached chat is 'ready' from the first render.
    if (cached && attempt === 0) return;
    let live = true;
    const slow = setTimeout(() => live && setPending((p) => (p === 'waiting' ? 'skeleton' : p)), motion['delay-skeleton-chat']);
    loadChat(chatId, attempt > 0)
      .catch(() => live && setPending('error'))
      .finally(() => clearTimeout(slow));
    return () => {
      live = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, attempt]);

  const retry = useCallback(() => {
    setPending('waiting');
    setAttempt((a) => a + 1);
  }, []);
  return { state: cached && pending !== 'error' ? 'ready' : pending, retry };
}
