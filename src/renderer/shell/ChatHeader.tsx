// Spec: 03-shell-2 §3.6.2 (chat header: back at XS, avatar 40, name h1, status line), §3.6.2.1 (status from the job runner),
// §3.6.2.2 (actions in X-128 order: Watch live · Private toggle · Find · Panel toggle · Options; the Chat options menu),
// §3.6.2.3 (the selection bar takes this box), §3.9.5 (Narrator), 12-2 §12.30.4 (private chat), 03-shell-1 §3.0.2.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  Menu,
  invoke,
  navigate,
  selectAiStatus,
  selectCardsById,
  selectChatsById,
  selectConnection,
  selectHelpers,
  selectJobsById,
  selectSelection,
  selectSettings,
  selectSetup,
  selectTakenOverJobIds,
  selectTypingChatId,
  setDialog,
  setFindOpen,
  setXsPane,
  useBreakpoint,
  useNow,
  useStore,
  type ChatRow,
  type JobRow,
  type MenuItem,
} from '../_m1b-stubs';
import styles from './ChatHeader.module.css';
import { hasLiveBrowser } from './doingNow';
import { SelectionBar } from './SelectionBar';
import { quietUntil, statusLine } from './statusLine';
import { useRightShell } from './useRightShell';

/** Below this header width the Watch live button keeps only its icon (03-shell-2 §3.10.4). */
const COMPACT_HEADER_W = 440;

export function profileView(chat: ChatRow) {
  if (chat.kind === 'group') return { kind: 'screen' as const, id: 'group-profile', params: { chatId: chat.id } };
  if (chat.kind === 'helper' && chat.helperId) return { kind: 'screen' as const, id: 'helper-profile', params: { helperId: chat.helperId } };
  return { kind: 'screen' as const, id: 'foo-profile' };
}

/** The live browser job "Watch live" opens: the most recently started one in this chat (§3.6.2.2). */
export function watchTarget(jobs: JobRow[], chatId: string): JobRow | undefined {
  return jobs
    .filter((j) => j.chatId === chatId && hasLiveBrowser(j))
    .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))[0];
}

export function ChatHeader({ chat, findOpen }: { chat: ChatRow; findOpen: boolean }) {
  const selection = useStore(selectSelection);
  if (selection.size > 0) return <SelectionBar chatId={chat.id} count={selection.size} />;
  return <HeaderBar chat={chat} findOpen={findOpen} />;
}

function HeaderBar({ chat, findOpen }: { chat: ChatRow; findOpen: boolean }) {
  const bp = useBreakpoint();
  const now = useNow();
  const jobsById = useStore(selectJobsById);
  const cards = useStore(selectCardsById);
  const chats = useStore(selectChatsById);
  const setup = useStore(selectSetup);
  const connection = useStore(selectConnection);
  const ai = useStore(selectAiStatus);
  const takenOver = useStore(selectTakenOverJobIds);
  const typingChatId = useStore(selectTypingChatId);
  const settings = useStore(selectSettings);
  const helpers = useStore(selectHelpers);
  const panel = useRightShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
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
  const tz = settings.locale.timeZone;
  const helper = chat.helperId ? helpers[chat.helperId] : undefined;
  const memberNames = useMemo(
    () =>
      (chat.memberIds ?? [])
        .map((id) => (id === 'foo' ? settings.identity.agentName : helpers[id]?.name))
        .filter((n): n is string => !!n),
    [chat.memberIds, helpers, settings.identity.agentName],
  );
  const quiet = quietUntil(settings.notifications.quiet, now, tz);
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
    agentName: settings.identity.agentName,
    helper,
    memberNames,
    waMembers: chat.memberIds?.length,
  });

  const isFoo = chat.kind === 'foo';
  const name = isFoo && chat.private ? t('chat_header.private.title') : chat.title;
  const live = watchTarget(jobs, chat.id);
  const liveJobsHere = jobs.filter((j) => j.chatId === chat.id && ['queued', 'working', 'waiting', 'needs_you'].includes(j.state));
  const privateBusy = chat.private && Object.values(cards).some((c) => c.chatId === chat.id && ['RUNNING', 'CHECKING'].includes(c.state));
  const muted = settings.notifications.mutedChats[chat.id] !== undefined;
  const panelTooltip = panel.open ? t('chat_header.panel.tooltip.hide') : t('chat_header.panel.tooltip.show');

  const privateChat = Object.values(chats).find((c) => c.kind === 'foo' && c.private);
  const onPrivate = () => {
    if (chat.private) setDialog('c-23');
    else if (privateChat) navigate({ kind: 'chat', chatId: privateChat.id });
    // Starting a new private chat needs an invoke 08-1 §3.2 does not list yet (implementation-notes, M1 builder B).
  };

  const mute = (until: number | 'forever' | null) => void invoke('chat:mute', { chatId: chat.id, until }).catch(() => undefined);
  const HOUR = 3_600_000;
  const items: MenuItem[] = [
    {
      key: 'profile',
      label: chat.kind === 'group' ? t('chat_header.menu.profile_group') : t('chat_header.menu.profile'),
      testid: TID.chatHeaderMenuProfile,
      onSelect: () => navigate(profileView(chat)),
    },
    muted
      ? { key: 'mute', label: t('chat_header.menu.unmute'), testid: TID.chatHeaderMenuMute, onSelect: () => mute(null) }
      : {
          key: 'mute',
          label: t('chat_header.menu.mute'),
          testid: TID.chatHeaderMenuMute,
          submenu: [
            { key: '8h', label: t('chat_header.menu.mute_8h'), onSelect: () => mute(now + 8 * HOUR) },
            { key: '1w', label: t('chat_header.menu.mute_1w'), onSelect: () => mute(now + 7 * 24 * HOUR) },
            { key: 'always', label: t('chat_header.menu.mute_always'), onSelect: () => mute('forever') },
          ],
        },
  ];
  if (!isFoo)
    items.push({
      key: 'pin',
      label: chat.pinned ? t('chat_header.menu.unpin') : t('chat_header.menu.pin'),
      testid: TID.chatHeaderMenuPin,
      onSelect: () => void invoke('chat:pin', { chatId: chat.id, on: !chat.pinned }).catch(() => undefined),
    });
  if (liveJobsHere.length)
    items.push({ key: 'stop', label: t('chat_header.menu.stop_all'), testid: TID.chatHeaderMenuStopAll, onSelect: () => setDialog('c-13b') });
  if (chat.kind === 'wa_mirror')
    items.push({
      key: 'catch',
      label: t('chat_header.menu.catch_up'),
      testid: TID.chatHeaderMenuCatchUp,
      onSelect: () => {
        const fooChat = Object.values(chats).find((c) => c.kind === 'foo' && !c.private);
        if (fooChat) navigate({ kind: 'chat', chatId: fooChat.id });
      },
    });
  const destructive: MenuItem[] = [];
  if (chat.private)
    destructive.push({ key: 'end', label: t('chat_header.menu.end_private'), testid: TID.chatHeaderMenuEndPrivate, onSelect: () => setDialog('c-23') });
  else destructive.push({ key: 'clear', label: t('chat_header.menu.clear'), testid: TID.chatHeaderMenuClear, onSelect: () => setDialog('c-01') });
  if (chat.kind === 'helper' || chat.kind === 'group')
    destructive.push({
      key: 'delete',
      label: chat.kind === 'group' ? t('chat_header.menu.delete.group') : t('chat_header.menu.delete.helper'),
      testid: TID.chatHeaderMenuDelete,
      onSelect: () => setDialog(chat.kind === 'group' ? 'c-07' : liveJobsHere.length ? 'c-06' : 'c-05'),
    });
  destructive[0]!.separatorBefore = true;

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
        <Avatar faceRef={chat.face} name={chat.title} size={40} color={chat.colorToken} />
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
            filled={chat.private}
            aria-pressed={chat.private}
            aria-disabled={privateBusy || undefined}
            data-state={privateBusy ? 'busy' : chat.private ? 'on' : 'off'}
            data-testid={TID.chatHeaderPrivateToggle}
            onClick={() => !privateBusy && onPrivate()}
          />
        )}
        <IconButton
          icon="Search"
          label={t('chat_header.find.label')}
          tooltip={t('chat_header.find.tooltip')}
          aria-pressed={findOpen}
          aria-keyshortcuts="Control+F"
          className={findOpen ? styles.on : undefined}
          data-testid={TID.chatHeaderFind}
          onClick={() => setFindOpen(!findOpen)}
        />
        <IconButton
          icon="PanelRight"
          label={t('chat_header.panel.label')}
          tooltip={panelTooltip}
          filled={panel.open}
          aria-pressed={panel.open}
          aria-expanded={panel.open}
          aria-keyshortcuts="Control+Shift+D"
          data-testid={TID.chatHeaderPanel}
          onClick={(e) => panel.toggle(byKey(e))}
        />
        <span className={styles.menuAnchor}>
          <IconButton
            ref={moreRef}
            icon="MoreHorizontal"
            label={t('chat_header.more.label')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-state={menuOpen ? 'open' : undefined}
            data-testid={TID.chatHeaderMore}
            onClick={() => setMenuOpen((o) => !o)}
          />
          <Menu
            open={menuOpen}
            label={t('chat_header.more.label')}
            items={[...items, ...destructive]}
            onClose={() => {
              setMenuOpen(false);
              moreRef.current?.focus();
            }}
          />
        </span>
      </div>
    </div>
  );
}
