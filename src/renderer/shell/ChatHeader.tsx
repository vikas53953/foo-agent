// Spec: 03-shell-2 §3.6.2 (chat header: back at XS, avatar 40, name h1, status line), §3.6.2.1 (status from the job runner),
// §3.6.2.2 (actions in X-128 order: Watch live · Private toggle · Find · Panel toggle · Options; the Chat options menu),
// §3.6.2.3 (the selection bar takes this box), §3.9.5 (Narrator), 12-2 §12.30.4 (private chat), 03-shell-1 §3.0.2.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { ChatRow, JobRow, View } from '../../shared/types';
import { invoke } from '../ipc/client';
import { navigate, openDialog, setFindOpen, setMenu, setXsPane, update, useStore } from '../store/index';
import { selectHelpers } from '../store/helpers';
import { selectAi, selectChatMood, selectConnection, selectNow, selectTypingChatId } from '../store/live';
import { selectSettings } from '../store/settings';
import { selectMenu } from '../store/ui';
import { Avatar, type AvatarMember } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Menu, type MenuEntry } from '../ui/Menu';
import { openChat } from './actions';
import styles from './ChatHeader.module.css';
import { hasLiveBrowser } from './doingNowRows';
import { SelectionBar } from './SelectionBar';
import { quietUntil, statusLine } from './statusLine';
import { useLayout } from './layout';
import { useRightShell } from './useRightShell';

const MENU_ID = 'chat-header-options';
const NO_TAKEN_OVER: string[] = [];
/** Fallback until the bootstrap's AI status arrives. */
const NO_AI = { displayName: '', state: 'ok' as const };

/** Below this header width the Watch live button keeps only its icon (03-shell-2 §3.10.4). */
const COMPACT_HEADER_W = 440;

export function profileView(chat: ChatRow): View {
  if (chat.kind === 'group') return { kind: 'screen' as const, id: 'group-profile', params: { chatId: chat.id } };
  if (chat.kind === 'helper' && chat.helperId)
    return { kind: 'screen' as const, id: 'helper-profile', params: { helperId: chat.helperId } };
  return { kind: 'screen' as const, id: 'foo-profile' };
}

/** The live browser job "Watch live" opens: the most recently started one in this chat (§3.6.2.2). */
export function watchTarget(jobs: JobRow[], chatId: string): JobRow | undefined {
  return jobs
    .filter((j) => j.chatId === chatId && hasLiveBrowser(j))
    .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))[0];
}

export function ChatHeader({ chat, findOpen }: { chat: ChatRow; findOpen: boolean }) {
  const selection = useStore((s) => s.ui.selection);
  if (selection.size > 0) return <SelectionBar chatId={chat.id} count={selection.size} />;
  return <HeaderBar chat={chat} findOpen={findOpen} />;
}

function HeaderBar({ chat, findOpen }: { chat: ChatRow; findOpen: boolean }) {
  // 04 §14.3: the face thinks while foo replies (02-2 §F15.9.3 moods).
  const mood = useStore(selectChatMood(chat.id));
  const { bp } = useLayout();
  const now = useStore(selectNow);
  const jobsById = useStore((s) => s.jobs.byId);
  const cards = useStore((s) => s.cards.byId);
  const privateChatId = useStore((s) => s.chats.order.find((id) => s.chats.byId[id]?.kind === 'foo' && s.chats.byId[id]?.private));
  const fooChatId = useStore((s) => s.chats.order.find((id) => s.chats.byId[id]?.kind === 'foo' && !s.chats.byId[id]?.private));
  const setup = useStore(
    useShallow((s) => ({ complete: s.settings.value?.setup.complete ?? true, step: s.settings.value?.setup.step ?? 5 })),
  );
  const connection = useStore(selectConnection);
  const ai = useStore(selectAi) ?? NO_AI;
  // "You're in control" (row 3) needs the takeover state of the live window, which arrives with it (09 §9.27).
  const takenOver = NO_TAKEN_OVER;
  const typingChatId = useStore(selectTypingChatId);
  const settings = useStore(selectSettings);
  const helpers = useStore(selectHelpers);
  const panel = useRightShell();
  const menuOpen = useStore(selectMenu) === MENU_ID;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCompact((e?.contentRect.width ?? Infinity) < COMPACT_HEADER_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const jobs = useMemo(() => Object.values(jobsById), [jobsById]);
  const tz = settings?.locale.timeZone ?? 'Asia/Kolkata';
  const agentName = settings?.identity.agentName ?? 'foo';
  const helper = chat.helperId ? helpers[chat.helperId] : undefined;
  const memberNames = useMemo(
    () => (chat.memberIds ?? []).map((id) => (id === 'foo' ? agentName : helpers[id]?.name)).filter((n): n is string => !!n),
    [chat.memberIds, helpers, agentName],
  );
  const members = useMemo(
    (): AvatarMember[] | undefined =>
      chat.kind === 'group'
        ? (chat.memberIds ?? []).slice(0, 3).map((id) => {
            if (id === 'foo') return { face: 'living:default', name: agentName, kind: 'foo' };
            const h = helpers[id];
            return { face: h?.faceRef ?? 'letter:?', name: h?.name ?? '', kind: 'helper', color: h?.colorToken ?? null };
          })
        : undefined,
    [chat.kind, chat.memberIds, helpers, agentName],
  );
  const quiet = settings ? quietUntil(settings.notifications.quiet, now, tz) : null;
  const status = statusLine({
    chat,
    jobs,
    cards,
    setup,
    connection,
    ai,
    takenOverJobIds: takenOver,
    typing: typingChatId === chat.id,
    quiet: quiet === null ? null : { until: quiet },
    now,
    timeZone: tz,
    agentName,
    helper,
    memberNames,
    waMembers: chat.memberIds?.length,
  });

  const isFoo = chat.kind === 'foo';
  const name = isFoo && chat.private ? t('chat_header.private.title') : chat.title;
  const live = watchTarget(jobs, chat.id);
  const liveJobsHere = jobs.filter((j) => j.chatId === chat.id && ['queued', 'working', 'waiting', 'needs_you'].includes(j.state));
  const privateBusy = chat.private && Object.values(cards).some((c) => c.chatId === chat.id && ['RUNNING', 'CHECKING'].includes(c.state));
  const muted = settings?.notifications.mutedChats[chat.id] !== undefined;
  const panelTooltip = panel.open ? t('chat_header.panel.tooltip.hide') : t('chat_header.panel.tooltip.show');

  const onPrivate = () => {
    if (chat.private) openDialog('c-23');
    else if (privateChatId) openChat(privateChatId);
    // Starting a new private chat needs an invoke 08-1 §3.2 does not list yet (implementation-notes, M1 builder B).
  };

  const mute = (until: number | 'forever' | null) => void invoke('chat:mute', { chatId: chat.id, until }).catch(() => undefined);
  const HOUR = 3_600_000;
  // C-1 / C-5 / C-6 / C-7 read the chat they are about from ui.dialogTarget.
  const confirm = (id: Parameters<typeof openDialog>[0]) => {
    update((s) => {
      s.ui.dialogTarget = chat.id;
    });
    openDialog(id);
  };
  const entries: MenuEntry[] = [
    {
      kind: 'item',
      id: 'profile',
      label: chat.kind === 'group' ? t('chat_header.menu.profile_group') : t('chat_header.menu.profile'),
      tid: 'chatHeaderMenuProfile',
      onSelect: () => navigate(profileView(chat)),
    },
    muted
      ? { kind: 'item', id: 'mute', label: t('chat_header.menu.unmute'), tid: 'chatHeaderMenuMute', onSelect: () => mute(null) }
      : {
          kind: 'item',
          id: 'mute',
          label: t('chat_header.menu.mute'),
          tid: 'chatHeaderMenuMute',
          submenu: [
            { kind: 'item', id: '8h', label: t('chat_header.menu.mute_8h'), onSelect: () => mute(now + 8 * HOUR) },
            { kind: 'item', id: '1w', label: t('chat_header.menu.mute_1w'), onSelect: () => mute(now + 7 * 24 * HOUR) },
            { kind: 'item', id: 'always', label: t('chat_header.menu.mute_always'), onSelect: () => mute('forever') },
          ],
        },
  ];
  if (!isFoo)
    entries.push({
      kind: 'item',
      id: 'pin',
      label: chat.pinned ? t('chat_header.menu.unpin') : t('chat_header.menu.pin'),
      tid: 'chatHeaderMenuPin',
      onSelect: () => void invoke('chat:pin', { chatId: chat.id, on: !chat.pinned }).catch(() => undefined),
    });
  if (liveJobsHere.length)
    entries.push({
      kind: 'item',
      id: 'stop',
      label: t('chat_header.menu.stop_all'),
      tid: 'chatHeaderMenuStopAll',
      onSelect: () => confirm('c-13b'),
    });
  if (chat.kind === 'wa_mirror')
    entries.push({
      kind: 'item',
      id: 'catch',
      label: t('chat_header.menu.catch_up'),
      tid: 'chatHeaderMenuCatchUp',
      onSelect: () => fooChatId && openChat(fooChatId),
    });
  entries.push({ kind: 'separator', id: 'sep' });
  if (chat.private)
    entries.push({
      kind: 'item',
      id: 'end',
      label: t('chat_header.menu.end_private'),
      tid: 'chatHeaderMenuEndPrivate',
      destructive: true,
      onSelect: () => confirm('c-23'),
    });
  else
    entries.push({
      kind: 'item',
      id: 'clear',
      label: t('chat_header.menu.clear'),
      tid: 'chatHeaderMenuClear',
      destructive: true,
      onSelect: () => confirm('c-01'),
    });
  if (chat.kind === 'helper' || chat.kind === 'group')
    entries.push({
      kind: 'item',
      id: 'delete',
      label: chat.kind === 'group' ? t('chat_header.menu.delete.group') : t('chat_header.menu.delete.helper'),
      tid: 'chatHeaderMenuDelete',
      destructive: true,
      onSelect: () => confirm(chat.kind === 'group' ? 'c-07' : liveJobsHere.length ? 'c-06' : 'c-05'),
    });

  const byKey = (e: MouseEvent) => e.detail === 0;

  return (
    <div ref={rootRef} className={styles.header} data-testid={TID.chatHeader} data-compact={compact || undefined}>
      {bp === 'XS' && (
        <IconButton
          icon="ArrowLeft"
          label={t('chat_header.back.label')}
          data-testid={TID.chatHeaderBack}
          className={styles.back}
          onClick={() => setXsPane('list')}
        />
      )}
      <button
        type="button"
        className={styles.avatar}
        data-testid={TID.chatHeaderAvatar}
        aria-label={t('chat_header.menu.profile')}
        onClick={() => navigate(profileView(chat))}
      >
        <Avatar
          face={chat.face}
          name={chat.title}
          kind={chat.kind}
          size="header"
          color={chat.colorToken ?? chat.helper?.color}
          members={members}
          mood={mood}
        />
      </button>
      <div className={styles.text}>
        <h1 className={styles.name} data-testid={TID.chatHeaderName}>
          {chat.private && (
            <span data-testid={TID.chatHeaderPrivateMark} className={styles.privateMark}>
              <Icon name="EyeOff" size={16} />
            </span>
          )}
          <span className={styles.nameText}>{name}</span>
        </h1>
        <div role="status" className={styles.status} data-testid={TID.chatHeaderStatus} data-state={status.tone} data-row={status.row}>
          {status.dot && <span className={styles.dot} aria-hidden />}
          <span className={styles.statusText}>{status.text}</span>
        </div>
      </div>
      <div className={styles.actions}>
        {live && (
          <Button
            size="sm"
            icon="Window"
            className={styles.watch}
            data-testid={TID.chatHeaderWatchLive}
            aria-label={compact ? t('chat_header.watch_live.label') : undefined}
            title={t('chat_header.watch_live.tooltip')}
            onClick={() => void invoke('job:watch', { jobId: live.id, on: true }).catch(() => undefined)}
          >
            {!compact && <span>{t('chat_header.watch_live.label')}</span>}
          </Button>
        )}
        {isFoo && (
          <IconButton
            icon="EyeOff"
            label={t('chat_header.private.title')}
            tooltip={
              privateBusy
                ? t('chat_header.private_toggle.tooltip.busy')
                : chat.private
                  ? t('chat_header.private_toggle.tooltip.on')
                  : t('chat_header.private_toggle.tooltip.off')
            }
            pressed={chat.private}
            disabled={privateBusy}
            data-state={privateBusy ? 'busy' : chat.private ? 'on' : 'off'}
            data-testid={TID.chatHeaderPrivateToggle}
            onClick={() => !privateBusy && onPrivate()}
          />
        )}
        <IconButton
          icon="Search"
          label={t('chat_header.find.label')}
          tooltip={t('chat_header.find.tooltip')}
          pressed={findOpen}
          aria-keyshortcuts="Control+F"
          data-testid={TID.chatHeaderFind}
          onClick={() => setFindOpen(!findOpen)}
        />
        <IconButton
          icon="PanelRight"
          label={t('chat_header.panel.label')}
          tooltip={panelTooltip}
          pressed={panel.open}
          aria-expanded={panel.open}
          aria-keyshortcuts="Control+Shift+D"
          data-testid={TID.chatHeaderPanel}
          onClick={(e) => panel.toggle(byKey(e))}
        />
        <span className={styles.menuAnchor}>
          <IconButton
            icon="MoreHorizontal"
            label={t('chat_header.more.label')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-state={menuOpen ? 'open' : undefined}
            data-testid={TID.chatHeaderMore}
            onClick={(e) => {
              setAnchor(e.currentTarget);
              setMenu(menuOpen ? null : MENU_ID);
            }}
          />
          {menuOpen && anchor && (
            <Menu
              entries={entries}
              anchor={{ el: anchor, align: 'end' }}
              label={t('chat_header.more.label')}
              onClose={() => {
                setMenu(null);
                anchor.focus();
              }}
            />
          )}
        </span>
      </div>
    </div>
  );
}
