// Spec: 03-shell-1 §3.4.5 row anatomy (avatar 48, name + time line, preview + right slot: pill, unread badge, pin,
// mute), §3.4.5.1 WhatsApp mirror row (WhatsApp mark, never a pill, muted badge), §3.4.6 preview, §3.4.7 row states
// (selected bar, unread time in `--accent`, folded 44px line, first-run disabled foo row), 03-shell-2 §3.9.5 (`option`,
// aria-selected, name "{name}, {pill}, {n} unread messages, pinned, muted, {preview}, {full time}"), 02-3 §F26
// (state in data-* and ARIA). Test ids per §3.4.5.
import { memo, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate, formatRowTime, formatWeekday } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { ChatRow as Row, TickState } from '../../shared/types';
import { useStore } from '../store/index';
import { selectChatMood } from '../store/live';
import { selectAgentName, selectSetupComplete, selectTimeZone } from '../store/settings';
import { selectOpenChatId } from '../store/ui';
import { selectIsFolded, selectIsMuted } from '../store/chats';
import { Avatar, type AvatarMember } from '../ui/Avatar';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import { TickSingle, TicksDouble } from '../ui/icons/Ticks';
import { Pill } from '../ui/Pill';
import { effectivePill, isUserPinned, unreadText } from './rules';
import { previewParts, previewText } from './preview';
import styles from './ChatRow.module.css';

const PILL_KEY = {
  needs_you: () => t('chatlist.row.pill.needs_you'),
  paused: () => t('chatlist.row.pill.paused'),
  working: () => t('chatlist.row.pill.working'),
  done: () => t('chatlist.row.pill.done'),
} as const;

function Tick({ state }: { state: TickState }) {
  if (state === 'waiting')
    return (
      <span className={styles.tick} data-state={state}>
        <Icon name="Clock" size={16} />
      </span>
    );
  return (
    <span className={cx(styles.tick, state === 'read' && styles.tickRead)} data-state={state}>
      {state === 'sent' ? <TickSingle /> : <TicksDouble />}
    </span>
  );
}

/** Members for a group's avatar cluster: foo and helpers from their chat rows. */
function useMembers(row: Row): AvatarMember[] | undefined {
  // Selected as one string so the subscription compares by value (new member objects would re-render forever).
  const key = useStore((s) => {
    if (row.kind !== 'group' || !row.memberIds) return '';
    const agent = s.settings.value?.identity.agentName ?? 'foo';
    return JSON.stringify(
      row.memberIds.slice(0, 3).map((id): AvatarMember => {
        if (id === 'foo') return { face: 'living:default', name: agent, kind: 'foo' };
        const helperChat = Object.values(s.chats.byId).find((c) => c.helper?.id === id);
        return {
          face: helperChat?.face ?? 'letter:?',
          name: helperChat?.title ?? '',
          kind: 'helper',
          color: helperChat?.helper?.color ?? null,
        };
      }),
    );
  });
  return useMemo(() => (key ? (JSON.parse(key) as AvatarMember[]) : undefined), [key]);
}

export interface ChatRowProps {
  row: Row;
  index: number;
  focusable: boolean;
  onOpen: (chatId: string) => void;
  onMenu: (chatId: string, at: { x: number; y: number } | HTMLElement) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, chatId: string) => void;
}

export const ChatRow = memo(function ChatRow({ row, index, focusable, onOpen, onMenu, onKeyDown }: ChatRowProps) {
  const now = useStore((s) => s.live.now);
  const tz = useStore(selectTimeZone);
  const open = useStore(selectOpenChatId) === row.id;
  const typing = useStore((s) => s.live.typingChatId === row.id);
  const markedUnread = useStore((s) => s.live.markedUnread[row.id] === true);
  const muted = useStore(selectIsMuted(row.id));
  const folded = useStore(selectIsFolded(row.id));
  const setupComplete = useStore(selectSetupComplete);
  const agentName = useStore(selectAgentName);
  const mood = useStore(selectChatMood(row.id));
  const members = useMembers(row);

  const disabled = !setupComplete && row.kind === 'foo';
  const pill = disabled ? null : effectivePill(row, now);
  const unread = row.unreadCount > 0 || markedUnread;
  const pinned = isUserPinned(row);
  const preview = previewParts(row, { typing, isOpen: open, setupComplete });
  const time = formatRowTime(row.lastTime, { timeZone: tz, now });
  const fullTime = formatDate(row.lastTime, 'full', { timeZone: tz, now });
  const name = row.kind === 'foo' && !row.private ? agentName : row.title;
  const pillWord = pill ? PILL_KEY[pill]() : null;
  const label = t('chatlist.row.accessible_name', {
    name,
    pill: pillWord ? pillWord.toLocaleLowerCase('en-IN') : 'none',
    unread: row.unreadCount,
    pinned: pinned ? 'yes' : 'no',
    muted: muted ? 'yes' : 'no',
    preview: previewText(preview),
    time: fullTime,
  });
  const avatarKind = row.kind === 'wa_mirror' ? 'wa_mirror' : row.kind;
  const color = row.helper?.color ?? row.colorToken;

  const onClick = () => {
    if (!disabled) onOpen(row.id);
  };
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) onMenu(row.id, { x: e.clientX, y: e.clientY });
  };

  const common = {
    role: 'option',
    'aria-selected': open,
    'aria-disabled': disabled || undefined,
    'aria-label': label,
    tabIndex: focusable ? 0 : -1,
    'data-chat-id': row.id,
    'data-index': index,
    'data-chat-kind': row.kind,
    'data-folded': folded ? 'true' : undefined,
    'data-unread': unread ? 'true' : undefined,
    onClick,
    onContextMenu,
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => onKeyDown(e, row.id),
  } as const;

  if (folded) {
    return (
      <div {...common} className={cx(styles.row, styles.folded, open && styles.selected)} data-testid={TID.chatlistRow}>
        <Avatar
          face={row.face}
          name={row.title}
          kind={avatarKind}
          color={color}
          size="inline"
          mood={mood}
          data-testid={TID.chatlistRowAvatar}
        />
        <span className={styles.foldedName} data-testid={TID.chatlistRowName}>
          {name}
        </span>
        <span className={styles.foldedDone} data-testid={TID.chatlistRowPreview} data-state="folded">
          {' · '}
          {t('chatlist.row.folded.done', { day: formatWeekday(row.list.lastEndedDoneAt ?? row.lastTime, tz) })}
        </span>
        <span className={styles.time} data-testid={TID.chatlistRowTime}>
          {time}
        </span>
      </div>
    );
  }

  return (
    <div
      {...common}
      className={cx(styles.row, open && styles.selected, disabled && styles.disabled, unread && styles.unread)}
      data-testid={TID.chatlistRow}
    >
      <span className={styles.avatarBox}>
        <Avatar
          face={row.face}
          name={row.title}
          kind={avatarKind}
          color={color}
          members={members}
          mood={mood}
          data-testid={TID.chatlistRowAvatar}
        />
        {row.kind === 'wa_mirror' && (
          <span className={styles.source} data-testid={TID.chatlistRowSource} data-state="whatsapp" aria-hidden="true">
            <WhatsAppMark />
          </span>
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.line1}>
          {row.private && (
            <span className={styles.privateMark} data-testid={TID.chatlistPrivateMark}>
              <Icon name="EyeOff" size={16} />
            </span>
          )}
          <span className={styles.name} data-testid={TID.chatlistRowName}>
            {name}
          </span>
          <span className={styles.time} data-testid={TID.chatlistRowTime}>
            {time}
          </span>
        </span>
        <span className={styles.line2}>
          <span
            className={cx(styles.preview, preview.tone === 'accent' && styles.accent)}
            data-testid={TID.chatlistRowPreview}
            data-state={preview.rule}
          >
            {preview.lead && <span className={styles.accent}>{preview.lead} </span>}
            {preview.tick && <Tick state={preview.tick} />}
            {preview.icon && (
              <span className={cx(styles.previewIcon, preview.icon.tone === 'bad' && styles.bad)}>
                <Icon name={preview.icon.name} size={16} />
              </span>
            )}
            <span className={styles.previewText}>{preview.text}</span>
          </span>
          <span className={styles.slot}>
            {pill && <Pill state={pill} label={pillWord ?? ''} data-testid={TID.chatlistRowPill} />}
            {row.unreadCount > 0 ? (
              <span
                className={cx(styles.badge, muted && styles.badgeMuted)}
                data-testid={TID.chatlistRowUnread}
                data-state={muted ? 'muted' : 'count'}
              >
                {unreadText(row.unreadCount, t('chatlist.row.unread.overflow'))}
              </span>
            ) : (
              markedUnread && <span className={styles.dot} data-testid={TID.chatlistRowUnread} data-state="marked" />
            )}
            {pinned && (
              <span className={styles.slotIcon} data-testid={TID.chatlistRowPin}>
                <Icon name="Pin" size={16} />
              </span>
            )}
            {muted && (
              <span className={styles.slotIcon} data-testid={TID.chatlistRowMute}>
                <Icon name="AlertOff" size={16} />
              </span>
            )}
          </span>
        </span>
      </span>
    </div>
  );
});

/** 03-shell-1 §3.4.5.1: the bundled 16px WhatsApp mark on a `--logo` tile with a 2px inset (M8 T3: the Connect card's 32px
 * logo, 05-3 §5.11.1, draws the same mark). */
export function WhatsAppMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        className={styles.waMark}
        d="M8 2.25a5.75 5.75 0 0 0-4.98 8.62l-.77 2.88 2.95-.77A5.75 5.75 0 1 0 8 2.25Zm0 10.5a4.73 4.73 0 0 1-2.42-.66l-.17-.1-1.75.46.47-1.7-.11-.18A4.75 4.75 0 1 1 8 12.75Zm2.6-3.55c-.14-.07-.84-.41-.97-.46-.13-.05-.22-.07-.32.07-.1.14-.37.46-.45.55-.08.1-.17.1-.31.04-.14-.07-.6-.22-1.14-.7a4.3 4.3 0 0 1-.79-.98c-.08-.14 0-.22.06-.29l.21-.25c.07-.08.1-.14.14-.24.05-.1.03-.18-.01-.25-.04-.07-.32-.76-.43-1.04-.11-.27-.23-.24-.32-.24h-.27a.52.52 0 0 0-.38.18c-.13.14-.5.48-.5 1.18 s.51 1.37.58 1.47c.07.1 1 1.53 2.43 2.15.34.15.6.23.81.3.34.1.65.1.9.06.27-.04.84-.34.96-.68.12-.33.12-.62.08-.68-.03-.06-.13-.1-.27-.17Z"
      />
    </svg>
  );
}
