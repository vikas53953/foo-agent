// Spec: 04 §19.5 (system line: centred, max 480, `--t-caption` `--fg-3`; `thread-marker` `data-state` = marker_kind; the
// engine writes the words, so the row's text is shown as written), §10.11 (WhatsApp mirror retention line), §14.2 (status line: 16px spinner + `--t-small` text with the
// `--m-shimmer` sweep; static under reduced motion; announced once per change), §14.3 (Thinking row: 38px, the speaker's
// 26px face in the Thinking mood, aria-hidden; in groups the name label 4px above). M6 T5: a `memory_chip` marker is the
// memory chip (05-3 §5.17, MemoryChip.tsx).
import { useEffect } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { MessageRow } from '../../shared/types';
import { announce } from '../a11y/announce';
import { navigate } from '../store/index';
import { Face } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import styles from './Bubble.module.css';
import { requestRevealCard } from './reveal'; // M8 T7
import { MemoryChip } from './MemoryChip';
import { SettingLine, settingLineOf } from './SettingLine'; // CR-0043

export function SystemLine({ m }: { m: MessageRow }) {
  // M6 T5: the memory chip (05-3 §5.17; G-M6-05 `data-state="memory"`).
  if (m.markerKind === 'memory_chip') return <MemoryChip m={m} />;
  // CR-0043: the settings-by-chat line and its button.
  const setting = settingLineOf(m);
  if (setting) return <SettingLine m={m} line={setting} />;
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

/** M8 T7 (04 §10.11): the mirror's "Draft ready in {agentName}'s chat." and Link "Open" → foo's chat at that Draft card. */
export function MirrorDraftLine({ agentName, fooChatId, draftCardId }: { agentName: string; fooChatId: string; draftCardId: string }) {
  return (
    <div className={styles.marker} data-testid={TID.threadMarker} data-state="system_line" data-card-id={draftCardId}>
      {t('thread.wa_mirror.draft_made', { agentName })}{' '}
      <button
        type="button"
        className={styles.markerLink}
        data-testid={TID.threadMarkerLink}
        onClick={() => {
          navigate({ kind: 'chat', chatId: fooChatId });
          requestRevealCard(fooChatId, draftCardId);
        }}
      >
        {t('thread.wa_mirror.open')}
      </button>
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
        <Face face={face} name={name} kind={kind} color={color} size="inline" mood="thinking" animate={!label} />
      </div>
    </div>
  );
}
