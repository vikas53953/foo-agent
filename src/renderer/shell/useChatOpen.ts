// Spec: 03-shell-1 §3.5 chat switch (newest 50 cached messages within 100 ms, Article 28; a cache miss longer than
// --delay-skeleton-chat 300 ms shows the skeleton; failure shows the error state with "Try again"), 08-5 §5 rule 5
// (the first open shows the newest 50 from chat:open), 08-1 §3.2 chat:open.
import { useCallback, useEffect, useState } from 'react';
import { motion } from '../../shared/tokens';
import { getState, invoke, putCards, putJobs, putMessages } from '../_m1b-stubs';

export const FIRST_PAGE = 50;
export type OpenState = 'ready' | 'waiting' | 'skeleton' | 'error';

export function useChatOpen(chatId: string): { state: OpenState; retry: () => void } {
  const cached = () => !!getState().messages.byChat[chatId];
  const [state, setState] = useState<OpenState>(() => (cached() ? 'ready' : 'waiting'));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // MainShell keys ChatView by chat id, so a cached chat was 'ready' from the first render.
    if (cached() && attempt === 0) return;
    let live = true;
    const slow = setTimeout(() => live && setState((s) => (s === 'waiting' ? 'skeleton' : s)), motion['delay-skeleton-chat']);
    invoke('chat:open', { chatId })
      .then((r) => {
        if (!live) return;
        const newest = r.messages.slice(-FIRST_PAGE);
        putMessages(chatId, newest, { prepend: false, hasMore: r.messages.length >= FIRST_PAGE });
        putJobs(r.jobs);
        putCards(r.cards);
        setState('ready');
      })
      .catch(() => live && setState('error'))
      .finally(() => clearTimeout(slow));
    return () => {
      live = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, attempt]);

  const retry = useCallback(() => {
    setState('waiting');
    setAttempt((a) => a + 1);
  }, []);
  return { state, retry };
}
