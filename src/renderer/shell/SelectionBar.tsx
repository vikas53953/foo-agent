// Spec: 03-shell-2 §3.6.2.3 (selection bar in the chat header's 60px box; "{n} selected" announced politely; Copy with the
// 2 s "Copied" swap, 02-3 §F21.1 rung 1; Delete → C-25; Cancel = Esc), 08-0 §G.10 (ui.selection).
import { useEffect, useRef, useState } from 'react';
import { t } from '../../shared/copy/t';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import { Button, IconButton, announce, clearSelection, getState, setDialog } from '../_m1b-stubs';
import styles from './SelectionBar.module.css';

export function SelectionBar({ chatId, count }: { chatId: string; count: number }) {
  const [copied, setCopied] = useState(false);
  const label = t('chat_header.selection.count', { count });
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    announce(label);
  }, [label]);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = () => {
    // 04 §1.9 owns the copy format; until M2, the selected messages' plain text in thread order (02-3 §F30.4).
    const s = getState();
    const chat = s.messages.byChat[chatId];
    const text = (chat?.ids ?? [])
      .filter((id) => s.ui.selection.has(id))
      .map((id) => chat!.byId[id]!.text)
      .join('\n\n');
    void navigator.clipboard?.writeText(text).then(() => setCopied(true));
  };

  return (
    <div role="toolbar" aria-label={t('chat_header.selection.label')} className={styles.bar} data-testid={TID.chatHeaderSelection}>
      <span className={styles.count} data-testid={TID.chatHeaderSelectionCount}>
        {label}
      </span>
      <div className={styles.group}>
        <Button variant="secondary" size="sm" disabled={count === 0} data-testid={TID.chatHeaderSelectionCopy} onClick={copy}>
          {copied ? t('chat_header.selection.copied') : t('chat_header.selection.copy')}
        </Button>
        <Button variant="destructive" size="sm" disabled={count === 0} data-testid={TID.chatHeaderSelectionDelete} onClick={() => setDialog('c-25')}>
          {t('chat_header.selection.delete')}
        </Button>
        <IconButton
          icon="Dismiss"
          label={t('chat_header.selection.cancel.label')}
          tooltip={t('chat_header.selection.cancel.tooltip')}
          aria-keyshortcuts="Escape"
          data-testid={TID.chatHeaderSelectionCancel}
          onClick={clearSelection}
        />
      </div>
    </div>
  );
}
