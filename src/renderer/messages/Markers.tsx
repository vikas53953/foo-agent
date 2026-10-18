// Spec: 04 §19.5 (system line: centred, max 480, `--t-caption` `--fg-3`; `thread-marker` `data-state` = marker_kind; the
// engine writes the words, so the row's text is shown as written), §10.11 (WhatsApp mirror retention line), §14.2 (status line: 16px spinner + `--t-small` text with the
// `--m-shimmer` sweep; static under reduced motion; announced once per change), §14.3 (Thinking row: 38px, the speaker's
// 26px face in the Thinking mood, aria-hidden; in groups the name label 4px above).
import { useEffect } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { MessageRow } from '../../shared/types';
import { announce } from '../a11y/announce';
import { Face } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import styles from './Bubble.module.css';

export function SystemLine({ m }: { m: MessageRow }) {
  return (
    <div className={styles.marker} data-testid={TID.threadMarker} data-state={m.markerKind ?? 'system_line'} data-copy="ai">
      {m.text}
    </div>
  );
}

export function RetentionLine() {
  return (
    <div className={styles.marker} data-testid={TID.threadMarker} data-state="system_line">
      {t('thread.wa_mirror.retention')}
    </div>
  );
}

export function StatusLine({ text, indent }: { text: string; indent: boolean }) {
  useEffect(() => {
    if (text) announce(text, 'polite');
  }, [text]);
  return (
    <div className={styles.statusLine} data-indent={indent || undefined} data-testid={TID.threadStatusLine}>
      <Spinner size={16} />
      <span className={styles.shimmer} data-copy="data">
        {text}
      </span>
    </div>
  );
}

export function ThinkingRow({
  face,
  name,
  kind,
  color,
  label,
}: {
  face: string;
  name: string;
  kind: 'foo' | 'helper';
  color?: string | null;
  label: boolean;
}) {
  return (
    <div className={styles.thinking} data-indent={label || undefined} aria-hidden="true">
      {label && (
        <div className={styles.sender} data-testid={TID.bubbleSender}>
          <span className={styles.senderName} style={color ? { color: `var(${color})` } : undefined}>
            {name}
          </span>
        </div>
      )}
      <div className={styles.thinkingRow} data-testid={TID.threadThinking}>
        <Face face={face} name={name} kind={kind} color={color} size="inline" mood="thinking" />
      </div>
    </div>
  );
}
