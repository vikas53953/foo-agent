// Spec: 03-shell-2 §3.6.3 (Ctrl+F opens the find bar in the open chat, or focuses its field when open), §3.6.2.2 / X-21
// (Ctrl+Shift+D toggles the right shell; Ctrl+Shift+L opens the Live window of this chat's live browser job), §3.9.2 (F6),
// §3.9.4 (Esc ladder). Renders nothing; the lead mounts it once at the App root.
import { useEffect } from 'react';
import { TID } from '../../shared/testids';
import { breakpointFor, getState, invoke, setFindOpen } from '../_m1b-stubs';
import { useEscLadder } from '../a11y/useEscLadder';
import { useF6Ladder } from '../a11y/useF6Ladder';
import { watchTarget } from './ChatHeader';
import { rightShellOpenNow, setRightShell } from './useRightShell';

export function ShellKeys(): null {
  useEscLadder();
  useF6Ladder();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.ctrlKey || e.altKey || e.metaKey) return;
      const s = getState();
      if (s.ui.view.kind !== 'chat' || !s.ui.view.chatId) return;
      const chatId = s.ui.view.chatId;
      const key = e.key.toLowerCase();
      if (key === 'f' && !e.shiftKey) {
        e.preventDefault();
        if (s.ui.findOpen)
          document
            .querySelector<HTMLElement>(`[data-testid="${TID.threadFindField}"] input, input[data-testid="${TID.threadFindField}"]`)
            ?.focus();
        else setFindOpen(true);
      } else if (key === 'd' && e.shiftKey) {
        e.preventDefault();
        const bp = breakpointFor(innerWidth);
        setRightShell(bp, !rightShellOpenNow(bp), { byKeyboard: true });
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
