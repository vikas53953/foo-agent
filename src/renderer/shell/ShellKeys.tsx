// Spec: 03-shell-2 §3.6.3 (Ctrl+F opens the find bar in the open chat, or focuses its field when open), §3.6.2.2 / X-21
// (Ctrl+Shift+D toggles the right shell; Ctrl+Shift+L opens the Live window of this chat's live browser job), §3.9.2 (F6),
// §3.9.4 (Esc ladder); 05-1 §0 / 09 §9.17.1 [X-09, X-21] (Ctrl+J focuses the oldest card in this chat that needs you, else
// Narrator "Nothing needs you here."). Renders nothing; App mounts it once at the root (the list keys are shell/shortcuts.ts).
import { useEffect } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { announce } from '../a11y/announce';
import { useEscLadder } from '../a11y/useEscLadder';
import { useF6Ladder } from '../a11y/useF6Ladder';
import { invoke } from '../ipc/client';
import { requestRevealCard } from '../messages/reveal';
import { setFindOpen, useStore } from '../store/index';
import { watchTarget } from './ChatHeader';
import { oldestNeedsYouCard } from './jumpToCard';
import { rightShellOpenNow, setRightShell } from './useRightShell';

export function ShellKeys(): null {
  useEscLadder();
  useF6Ladder();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.ctrlKey || e.altKey || e.metaKey) return;
      const s = useStore.getState();
      if (s.ui.dialog !== null || s.ui.view.kind !== 'chat' || !s.ui.view.chatId) return;
      const chatId = s.ui.view.chatId;
      const key = e.key.toLowerCase();
      if (key === 'f' && !e.shiftKey) {
        e.preventDefault();
        if (s.ui.findOpen) document.querySelector<HTMLElement>(`input[data-testid="${TID.threadFindField}"]`)?.focus();
        else setFindOpen(true);
      } else if (key === 'd' && e.shiftKey) {
        e.preventDefault();
        setRightShell(!rightShellOpenNow(), { byKeyboard: true });
      } else if (key === 'j' && !e.shiftKey) {
        e.preventDefault();
        const card = oldestNeedsYouCard(Object.values(s.cards.byId), chatId, s.live.now);
        if (card) requestRevealCard(chatId, card.id);
        else announce(t('thread.jump.none'));
      } else if (key === 'l' && e.shiftKey) {
        const job = watchTarget(Object.values(s.jobs.byId), chatId);
        if (!job) return;
        e.preventDefault();
        void invoke('job:watch', { jobId: job.id, on: true }).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
