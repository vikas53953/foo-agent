// Spec: 03-shell-2 §3.6.4 (column max --column-max centred, side padding 24 when the main shell is ≥ 900 else 16, top and
// bottom --s3; role="log" "Messages with {name}", one Tab stop, ↑/↓ between messages, Ctrl+Home / Ctrl+End; virtualised with
// @tanstack/react-virtual useVirtualizer, overscan 8, measureElement on every row, 02-2 §F13.3 estimates; scroll memory in
// ui.scroll[chatId]), §3.6.5 (separators, sticky date, unread divider and where the chat opens), §3.6.6, §3.6.7, §3.6.3 (centre
// the current find match), §3.9.2 (F6 lands on the last focused message, else the newest). M2 (04 §1–§19): rows render as
// bubbles, cards and markers (Bubble.tsx) with the run layout of runs.ts; §1.5 new rows fade and rise (history rows do
// not); §1.6 a streaming answer is followed until its top is 16px below the header; X-152 the chat is marked read after the
// newest message was visible for 1 s with the window focused; §1.8 each row is named "{sender}, {time}: {text}. {state}",
// keys Enter / Shift+F10 / Menu, Ctrl+Shift+R, Ctrl+Shift+E, Ctrl+C; new foo rows are announced once (streaming: when done);
// §6.4 a quote click jumps and highlights 1600 ms; §14.2 / §14.3 status line and Thinking row; §10.11 the WhatsApp mirror.
import { observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import { batchScrollAdjustments } from './scrollAdjust';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { bp, motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import type { CardRow, ChatRow, MessageRow } from '../../shared/types';
import { announce } from '../a11y/announce';
import { registerFocusTarget } from '../a11y/focusTargets';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { CARD_ESTIMATE, titleOfCard } from '../cards/registry';
import { invoke } from '../ipc/client';
import { saveScroll, update, useStore } from '../store/index';
import { selectConnection, selectNow, selectTypingChatId, selectWindowFocused } from '../store/live';
import { prependMessagesReducer, selectChatMessages, setHighlight, type StoredMessage } from '../store/messages';
import { selectAgentName, selectTimeZone } from '../store/settings';
import { useFind } from '../shell/FindBar';
import { DateSeparator, StickyDate } from './DateSeparator';
import { JumpToLatest } from './JumpToLatest';
import { LoadOlder, StartOfChat } from './LoadOlder';
import styles from './MessageList.module.css';
import { REVEAL_EVENT, takeReveal } from './reveal';
import { MessageView, WaBubble, messageAccessibleName, messagePlainText, runRowCommand, senderOf, type RowCtx } from './Bubble';
import { MessageDialogs } from './MessageDialogs';
import { RowHotCtx } from './bubbleContext';
import { RetentionLine, StatusLine, ThinkingRow } from './Markers';
import { buildRows, buildWaRows, estimateRow, firstUnreadId, type VRow } from './rows';
import { layoutRows, type RowLayout } from './runs';
import { followStreaming, MARK_READ_AFTER_MS, nearTop, rowVisible, showJump, unreadOpenTop, type ScrollMetrics } from './stickToBottom';
import { Marked } from './Marked';
import { UnreadDivider } from './UnreadDivider';
import { useStickToBottom } from './useStickToBottom';

export const PAGE = 50;
/** 04 §6.4: the jump highlight stays 1600 ms. */
export const HIGHLIGHT_MS = 1600;
/** 04 §1.8: new foo rows are announced with their first 140 characters. */
export const ANNOUNCE_CHARS = 140;
/**
 * PERF-04: the user's own scrolling faster than this (px per ms, about four 900px screens a second) is a fling, and message
 * rows are drawn light until the scroll settles (`FlingRow`).
 */
export const FLING_PX_PER_MS = 4;
/** Below one frame apart, two scroll events are timed as one frame (a jump of a whole wheel arrives as one event). */
const FRAME_MS = 16;

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

type OlderState = 'idle' | 'pending' | 'loading' | 'failed';

export function MessageList({ chat, unread }: { chat: ChatRow; unread: { count: number } }) {
  const slice = useStore(selectChatMessages(chat.id));
  const cards = useStore((s) => s.cards.byId);
  const tz = useStore(selectTimeZone);
  const agentName = useStore(selectAgentName);
  const now = useStore(selectNow);
  const helpers = useStore((s) => s.helpers.byId);
  const jobs = useStore((s) => s.jobs.byId);
  const typing = useStore(selectTypingChatId) === chat.id;
  const connection = useStore(selectConnection);
  const focused = useStore(selectWindowFocused);
  const selecting = useStore((s) => s.ui.selection.size > 0);
  const highlightId = useStore((s) => s.messages.highlightId);
  const waRowsData = useStore((s) => s.messages.wa[chat.id]);
  const fooFace = useStore((s) => {
    const id = s.chats.order.find((x) => s.chats.byId[x]?.kind === 'foo' && !s.chats.byId[x]?.private);
    return (id && s.chats.byId[id]?.face) || '';
  });
  const reduced = useReducedMotion();
  const find = useFind();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<string | null>(null);
  const [older, setOlder] = useState<OlderState>('idle');
  const [sticky, setSticky] = useState<{ label: string; shown: boolean }>({ label: '', shown: false });
  const [jumpShown, setJumpShown] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide((e?.contentRect.width ?? 0) >= bp.gutter));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stickyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The sticky date follows the user's scrolling only (§3.6.5), not the scroll the list makes when it opens or follows.
  const userInputAt = useRef(-Infinity);
  const markUserInput = () => {
    userInputAt.current = performance.now();
  };
  // PERF-04: a fast fling by the user draws message rows light (same box and colours, plain text, nothing measured) and the
  // full rows return when the scroll settles (the virtualiser's isScrolling ends 150 ms after the last scroll event).
  const [fling, setFling] = useState(false);
  const flinging = useRef(false);
  const lastScroll = useRef<{ at: number; offset: number } | null>(null);
  const flingCheck = (offset: number, isScrolling: boolean) => {
    const at = performance.now();
    const prev = lastScroll.current;
    lastScroll.current = { at, offset };
    if (!isScrolling) {
      if (flinging.current) {
        flinging.current = false;
        setFling(false);
      }
      return;
    }
    if (flinging.current || !prev || at - userInputAt.current >= motion['delay-sticky-hide']) return;
    if (Math.abs(offset - prev.offset) / Math.max(at - prev.at, FRAME_MS) <= FLING_PX_PER_MS) return;
    flinging.current = true;
    setFling(true);
  };
  const flingCheckRef = useRef(flingCheck);
  flingCheckRef.current = flingCheck;

  const messages = useMemo<StoredMessage[]>(() => (slice ? slice.ids.map((id) => slice.byId[id]!) : []), [slice]);
  const isWa = chat.kind === 'wa_mirror';
  const isGroup = chat.kind === 'group';
  // The unread divider is fixed when the chat opens and removed when the user sends a message here (§3.6.5).
  const [unreadFrom, setUnreadFrom] = useState<string | null>(() => firstUnreadId(messages, unread.count));
  const userCount = useRef(messages.filter((m) => m.authorKind === 'user').length);
  useEffect(() => {
    const n = messages.filter((m) => m.authorKind === 'user').length;
    if (n > userCount.current) setUnreadFrom(null);
    userCount.current = n;
  }, [messages]);

  // §14.2 / §14.3: the status line when a working job of this chat reports its step and no answer started; else the
  // Thinking row while a reply is in flight (chat:typing).
  const live = useMemo<VRow | null>(() => {
    if (isWa) return null;
    const streaming = messages.some((m) => m.status === 'streaming');
    if (streaming) return null;
    const working = Object.values(jobs).find(
      (j) =>
        j.chatId === chat.id &&
        j.state === 'working' &&
        j.nowLine &&
        !j.resultMessageId &&
        !Object.values(cards).some((c) => c.jobId === j.id && c.type === 'checklist'),
    );
    if (working) return { kind: 'status', key: 'live-status', text: working.nowLine };
    if (typing) return { kind: 'thinking', key: 'live-thinking', helperId: chat.kind === 'helper' ? chat.helperId : null };
    return null;
  }, [isWa, messages, jobs, cards, chat.id, chat.kind, chat.helperId, typing]);

  const rows = useMemo<VRow[]>(() => {
    if (isWa) return buildWaRows(waRowsData ?? [], { now, timeZone: tz });
    const r = buildRows(messages, {
      now,
      timeZone: tz,
      hasMore: slice?.hasMore ?? true,
      unreadFromId: unreadFrom,
      unreadCount: unread.count,
      chatTitle: chat.title,
      chatCreatedAt: chat.createdAt,
      isFoo: chat.kind === 'foo' && !chat.private,
      agentName,
    });
    if (live) r.push(live);
    return r;
  }, [isWa, waRowsData, messages, now, tz, slice?.hasMore, unreadFrom, unread.count, chat, agentName, live]);
  const layouts = useMemo<RowLayout[]>(() => layoutRows(rows, { isGroup }), [rows, isGroup]);
  const latestUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i]!.authorKind === 'user' && messages[i]!.deletedAt === null) return messages[i]!.id;
    return null;
  }, [messages]);

  const onJump = useCallback((messageId: string) => {
    jumpRef.current(messageId);
  }, []);
  const jumpRef = useRef<(id: string) => void>(() => undefined);
  const ctx = useMemo<RowCtx>(
    () => ({
      chat,
      isGroup,
      agentName,
      fooFace,
      timeZone: tz,
      now,
      offline: connection === 'offline',
      aiDown: connection === 'ai_down',
      helpers,
      cards: cards as Record<string, CardRow>,
      jobs,
      byId: slice?.byId ?? {},
      latestUserId,
      selecting,
      highlightId,
      onJump,
    }),
    [
      chat,
      isGroup,
      agentName,
      fooFace,
      tz,
      now,
      connection,
      helpers,
      cards,
      jobs,
      slice?.byId,
      latestUserId,
      selecting,
      highlightId,
      onJump,
    ],
  );

  const cardType = useCallback((id: string) => (cards as Record<string, CardRow>)[id]?.type, [cards]);
  const onVirtualChange = useRef<(total: number) => void>(() => undefined);
  const afterScroll = useRef<() => void>(() => undefined);
  const rem = useMemo(remPx, []);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateRow(rows[i]!, cardType, CARD_ESTIMATE),
    getItemKey: (i) => rows[i]!.key,
    overscan: 8,
    // PERF-04: row positions and the column height are written straight to the DOM; React re-renders only when the
    // visible range changes, not once per measured row. 'position' (top) keeps rows off their own compositor layers.
    directDomUpdates: true,
    directDomUpdatesMode: 'position',
    useFlushSync: false,
    onChange: (inst) => onVirtualChange.current(inst.getTotalSize()),
    // The list's own scroll handling runs right after the virtualiser has taken the new offset, so it reads the offset
    // from the virtualiser instead of the DOM (PERF-04, `scrollMetrics`).
    observeElementOffset: (inst, cb) =>
      observeElementOffset(inst, (offset, isScrolling) => {
        flingCheckRef.current(offset, isScrolling);
        cb(offset, isScrolling);
        if (isScrolling) afterScroll.current();
      }),
    paddingStart: rem,
    paddingEnd: rem,
  });
  // PERF-04: one scroll correction per measurement pass instead of one forced layout per row measured above the fold.
  const sticking = useRef<() => boolean>(() => false);
  useLayoutEffect(() => batchScrollAdjustments(v, () => sticking.current()), [v]);

  const target = useMemo(
    () => ({
      scrollToEnd: () => rows.length && v.scrollToIndex(rows.length - 1, { align: 'end' }),
      getTotalSize: () => v.getTotalSize(),
      // TanStack Virtual keeps a scroll-to-index in `scrollState` until the target holds still (private in its typings).
      isFollowing: () => (v as unknown as { scrollState: unknown }).scrollState != null,
    }),
    [rows.length, v],
  );
  const stick = useStickToBottom(scrollRef, rows, target);
  sticking.current = () => stick.wasAtBottom.current;

  // Open position: restore this session's scrollTop, else the unread divider 1/3 down, else the end (§3.6.4, §3.6.5).
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !rows.length || !scrollRef.current) return;
    opened.current = true;
    const el = scrollRef.current;
    const saved = useStore.getState().ui.scroll[chat.id];
    if (saved !== undefined) {
      el.scrollTop = saved;
      return;
    }
    const idx = rows.findIndex((r) => r.kind === 'unread');
    if (idx >= 0) {
      const top = v.getOffsetForIndex(idx, 'start')?.[0] ?? 0;
      el.scrollTop = unreadOpenTop({ dividerTop: top, totalHeight: v.getTotalSize(), clientHeight: el.clientHeight });
    } else target.scrollToEnd();
  }, [rows, chat.id, v, target]);

  useEffect(() => {
    const el = scrollRef.current;
    return () => {
      if (el) saveScroll(chat.id, el.scrollTop);
    };
  }, [chat.id]);

  // A row grew or was measured: keep following at the bottom, except past the top of a streaming answer (04 §1.6).
  // With direct DOM updates a measured row no longer re-renders the list, so growth is seen here, in the virtualizer's
  // change callback: every measured row can change the total. The streaming row is found once per rows change, and the
  // scroller's layout is read only when there is one (a layout read per measurement forced a reflow per frame, PERF-04).
  const streamingIndex = useMemo(() => rows.findIndex((r) => r.kind === 'message' && r.message.status === 'streaming'), [rows]);
  const lastTotal = useRef(-1);
  const sizeQueued = useRef(false);
  const sizeChanged = () => {
    sizeQueued.current = false;
    const el = scrollRef.current;
    const i = streamingIndex;
    const start = i >= 0 ? v.getOffsetForIndex(i, 'start')?.[0] : undefined;
    if (start === undefined || !el) {
      stick.onSizeChange(true);
      return;
    }
    stick.onSizeChange(followStreaming({ rowStart: start, scrollTop: el.scrollHeight - el.clientHeight }));
  };
  const sizeChangedRef = useRef(sizeChanged);
  sizeChangedRef.current = sizeChanged;
  // Called inside the virtualizer's measuring: the follow runs right after it, before the frame paints.
  onVirtualChange.current = (total: number) => {
    if (total === lastTotal.current) return;
    lastTotal.current = total;
    if (sizeQueued.current) return;
    sizeQueued.current = true;
    queueMicrotask(() => sizeChangedRef.current());
  };

  // §1.5: rows that arrive after the list opened fade and rise; history rows do not.
  const known = useRef<Set<string> | null>(null);
  const fresh = useRef<Set<string>>(new Set());
  useEffect(() => {
    const keys = rows.filter((r) => r.kind === 'message').map((r) => r.key);
    if (known.current === null) {
      known.current = new Set(keys);
      return;
    }
    for (const r of rows) {
      if (r.kind !== 'message' || known.current.has(r.key)) continue;
      known.current.add(r.key);
      // Older pages (scroll-back) arrive without motion and are not announced.
      if (r.message.seq <= (prevLast.current ?? 0) && !r.key.startsWith('local:')) continue;
      fresh.current.add(r.key);
      announceRow(r.message);
    }
    prevLast.current = slice?.lastSeq ?? 0;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevLast = useRef<number | null>(slice?.lastSeq ?? null);
  const announced = useRef<Set<string>>(new Set());
  const announceRow = (m: MessageRow) => {
    if (m.authorKind === 'user' || m.kind === 'marker' || m.status === 'streaming' || announced.current.has(m.id)) return;
    announced.current.add(m.id);
    const text = m.kind === 'card' ? (titleOfCard(cards[m.cardId ?? '']) ?? '') : m.text;
    announce(t('bubble.row.announce_new', { sender: senderOf(m, ctx).name, text: text.slice(0, ANNOUNCE_CHARS) }), 'polite');
  };
  // Streaming text is announced once, when it finishes (§1.8).
  const streamingIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of messages) {
      if (m.status === 'streaming') streamingIds.current.add(m.id);
      else if (streamingIds.current.has(m.id)) {
        streamingIds.current.delete(m.id);
        announceRow(m);
      }
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // X-152: mark read once the newest message has been visible for 1 s while the window is focused.
  const [scrollTick, setScrollTick] = useState(0);
  useEffect(() => {
    if (chat.unreadCount <= 0 || !focused || isWa) return;
    const el = scrollRef.current;
    const last = rows.length - 1;
    if (!el || last < 0) return;
    const [start] = v.getOffsetForIndex(last, 'start') ?? [0];
    const visible = rowVisible({ start, end: v.getTotalSize(), scrollTop: el.scrollTop, clientHeight: el.clientHeight });
    if (!visible) return;
    const id = setTimeout(() => {
      void invoke('chat:markRead', { chatId: chat.id, upToSeq: slice?.lastSeq ?? Math.max(0, chat.nextSeq - 1) });
    }, MARK_READ_AFTER_MS);
    return () => clearTimeout(id);
  }, [chat.unreadCount, chat.id, chat.nextSeq, focused, isWa, rows.length, scrollTick, slice?.lastSeq, v]);

  const loadOlder = useCallback(async () => {
    const s = useStore.getState().messages.byChat[chat.id];
    if (!s?.hasMore) return;
    setOlder('pending');
    const slow = setTimeout(() => setOlder((o) => (o === 'pending' ? 'loading' : o)), motion['delay-loading']);
    try {
      const r = await invoke('message:list', { chatId: chat.id, beforeSeq: s.oldestSeq ?? undefined, limit: PAGE });
      if (!r.ok) throw new Error(r.error.kind);
      update((d) => prependMessagesReducer(d.messages, chat.id, r.value, PAGE));
      setOlder('idle');
    } catch {
      setOlder('failed');
    } finally {
      clearTimeout(slow);
    }
  }, [chat.id]);

  const dayLabels = useMemo(() => {
    let label = '';
    return rows.map((r) => (r.kind === 'date' ? (label = r.label) : label));
  }, [rows]);

  // PERF-04: the scroller's metrics from the virtualiser (this runs from its offset observer, right after it read the
  // offset; the column is its total size), not from the DOM: reading scrollHeight after the virtualiser wrote the row
  // positions forced a style and layout pass on every scroll event. The "load older" banner above the column is the one thing it does not know; while it shows
  // (rarely), the DOM is read.
  const scrollMetrics = (el: HTMLElement): ScrollMetrics => {
    const scrollTop = v.scrollOffset;
    const clientHeight = v.scrollRect?.height;
    if (scrollTop === null || clientHeight === undefined || older === 'loading' || older === 'failed')
      return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    return { scrollTop, clientHeight, scrollHeight: Math.max(clientHeight, v.getTotalSize()) };
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const m = scrollMetrics(el);
    const byUser = performance.now() - userInputAt.current < motion['delay-sticky-hide'];
    stick.onScroll(m, byUser);
    // Only the mark-read check (X-152) reads the tick; with nothing unread a scroll needs no list re-render for it.
    if (chat.unreadCount > 0) setScrollTick((n) => (n + 1) % 1024);
    setJumpShown(showJump(m));
    if (nearTop(m.scrollTop) && older === 'idle' && slice?.hasMore) void loadOlder();
    const firstVisible = v.getVirtualItems().find((i) => i.end > m.scrollTop + rem);
    const label = firstVisible ? dayLabels[firstVisible.index] : '';
    if (label && m.scrollTop > 0 && byUser) {
      // The same label while shown is no change: no list re-render per scroll event for it.
      setSticky((s) => (s.shown && s.label === label ? s : { label, shown: true }));
      clearTimeout(stickyTimer.current);
      stickyTimer.current = setTimeout(() => setSticky((s) => ({ ...s, shown: false })), motion['delay-sticky-hide']);
    }
  };
  afterScroll.current = onScroll;
  useEffect(() => () => clearTimeout(stickyTimer.current), []);

  const focusRow = useCallback(
    (index: number) => {
      if (index < 0 || index >= rows.length) return;
      const row = () => scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"][data-message-id]`);
      v.scrollToIndex(index, { align: 'auto' });
      // A row already rendered takes focus now, so the next key (F6, ↑/↓) starts from it; else after the scroll renders it.
      const now = row();
      if (now) now.focus();
      else requestAnimationFrame(() => row()?.focus());
    },
    [rows.length, v],
  );
  const messageIndexes = useMemo(() => rows.flatMap((r, i) => (r.kind === 'message' ? [i] : [])), [rows]);

  // F6 and the find bar's Esc land on the last focused message, else the newest (03-shell-2 §3.9.2).
  useEffect(
    () =>
      registerFocusTarget('messages', () => {
        const el = scrollRef.current;
        if (!el || !el.isConnected) return false;
        const i = lastFocused.current ? rows.findIndex((r) => r.key === lastFocused.current) : -1;
        const index = i >= 0 ? i : messageIndexes[messageIndexes.length - 1];
        if (index === undefined) el.focus();
        else focusRow(index);
        return true;
      }),
    [rows, messageIndexes, focusRow],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-message-id]');
    const at = current ? Number(current.dataset.index) : -1;
    // 04 §1.8: keys on a focused message row (the row itself, not a control inside it).
    if (current && document.activeElement === current && current.dataset.messageId) {
      const id = current.dataset.messageId;
      const k = e.key.toLowerCase();
      const cmd =
        e.key === 'Enter' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)
          ? 'menu'
          : e.ctrlKey && e.shiftKey && k === 'r'
            ? 'reply'
            : e.ctrlKey && e.shiftKey && k === 'e'
              ? 'react'
              : e.ctrlKey && !e.shiftKey && k === 'c' && !window.getSelection()?.toString()
                ? 'copy'
                : null;
      if (cmd && runRowCommand(id, cmd)) {
        e.preventDefault();
        return;
      }
    }
    const pos = messageIndexes.indexOf(at);
    let next: number | undefined;
    if (e.key === 'ArrowDown')
      next = pos < 0 ? messageIndexes[messageIndexes.length - 1] : messageIndexes[Math.min(pos + 1, messageIndexes.length - 1)];
    else if (e.key === 'ArrowUp') next = pos < 0 ? messageIndexes[messageIndexes.length - 1] : messageIndexes[Math.max(pos - 1, 0)];
    else if (e.key === 'Home' && e.ctrlKey) next = messageIndexes[0];
    else if (e.key === 'End' && e.ctrlKey) next = messageIndexes[messageIndexes.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    focusRow(next);
  };

  // Find: centre the current match (§3.6.3).
  const current = find.index >= 0 ? find.matches[find.index] : undefined;
  useEffect(() => {
    if (!current) return;
    const i = rows.findIndex((r) => r.kind === 'message' && r.message.id === current.messageId);
    if (i >= 0) v.scrollToIndex(i, { align: 'center' });
  }, [current, rows, v]);

  // §6.4: a quote click scrolls to the original and highlights its row for 1600 ms.
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  jumpRef.current = (messageId: string) => {
    const i = rows.findIndex((r) => r.kind === 'message' && r.message.id === messageId);
    if (i < 0) return;
    v.scrollToIndex(i, { align: 'center' });
    setHighlight(messageId);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
  };
  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  // Doing-now row click (§3.7.3.1): scroll to the job's checklist card and flash it for 2 s.
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      const target = takeReveal(chat.id);
      if (!target) return;
      if (target.kind === 'card') {
        // 04-2 §23.4 (builder B): the pending strip's Show centres the card and focuses its row (the card group).
        const at = rows.findIndex((r) => r.kind === 'message' && r.message.cardId === target.cardId);
        if (at < 0) return;
        v.scrollToIndex(at, { align: 'center' });
        const row = () => scrollRef.current?.querySelector<HTMLElement>(`[data-index="${at}"][data-message-id]`);
        timer = setTimeout(() => row()?.focus(), motion.slow);
        return;
      }
      const { jobId } = target;
      const isCard = (r: VRow) => r.kind === 'message' && r.message.jobId === jobId && r.message.kind === 'card';
      const checklist = rows.findIndex((r) => isCard(r) && r.kind === 'message' && cards[r.message.cardId ?? '']?.type === 'checklist');
      const i = checklist >= 0 ? checklist : rows.findIndex(isCard);
      const r = rows[i];
      if (!r || r.kind !== 'message') return;
      v.scrollToIndex(i, { align: 'center' });
      setFlashId(r.message.id);
      clearTimeout(timer);
      timer = setTimeout(() => setFlashId(null), motion['dur-confirm']);
    };
    reveal();
    window.addEventListener(REVEAL_EVENT, reveal);
    return () => {
      window.removeEventListener(REVEAL_EVENT, reveal);
      clearTimeout(timer);
    };
  }, [chat.id, rows, cards, v]);

  const jump = () => {
    stick.resetCount();
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div ref={areaRef} className={styles.area} data-wide={wide || undefined}>
      <StickyDate label={sticky.label} shown={sticky.shown} />
      <div
        ref={scrollRef}
        className={styles.scroller}
        role="log"
        aria-label={t('thread.log.label', { name: chat.title })}
        tabIndex={0}
        data-testid={TID.threadLog}
        onWheel={markUserInput}
        onPointerDown={markUserInput}
        onTouchStart={markUserInput}
        onKeyDown={(e) => {
          markUserInput();
          onKeyDown(e);
        }}
        onFocus={(e) => {
          const row = (e.target as HTMLElement).closest<HTMLElement>('[data-message-id]');
          if (row?.dataset.messageId) lastFocused.current = row.dataset.messageId;
        }}
      >
        {(older === 'loading' || older === 'failed') && <LoadOlder state={older} onRetry={() => void loadOlder()} />}
        <div ref={v.containerRef} className={styles.column} role="list">
          {v.getVirtualItems().map((item) => {
            const r = rows[item.index]!;
            if (fling && r.kind === 'message' && r.key !== lastFocused.current)
              return (
                <FlingRow
                  key={item.key}
                  index={item.index}
                  start={item.start}
                  size={item.size}
                  m={r.message}
                  layout={layouts[item.index]!}
                  cards={cards}
                />
              );
            return (
              <RowFrame
                key={item.key}
                measure={v.measureElement}
                index={item.index}
                row={r}
                cards={cards}
                layout={layouts[item.index]!}
                ctx={ctx}
                isNew={fresh.current.has(r.key)}
                flash={r.kind === 'message' && r.message.id === flashId}
              />
            );
          })}
        </div>
      </div>
      <JumpToLatest shown={jumpShown} count={stick.newCount} onJump={jump} />
      <MessageDialogs chatId={chat.id} />
    </div>
  );
}

/**
 * One positioned row of the virtual list. Memoised: the list re-renders on every scroll event and virtualizer change
 * (sticky date, Jump to latest, measured sizes), and a row's content, its markdown and its accessible name only change
 * when its own props do (PERF-04).
 */
const RowFrame = memo(function RowFrame({
  measure,
  index,
  row,
  cards,
  layout,
  ctx,
  isNew,
  flash,
}: {
  measure: (el: Element | null) => void;
  index: number;
  row: VRow;
  cards: Record<string, CardRow>;
  layout: RowLayout;
  ctx: RowCtx;
  isNew: boolean;
  flash: boolean;
}) {
  const m = row.kind === 'message' ? row.message : null;
  const name = useMemo(() => (m ? messageAccessibleName(m, ctx) : undefined), [m, ctx]);
  const [hot, setHot] = useState(false);
  const warm = () => {
    if (!hot) setHot(true);
  };
  return (
    <div
      ref={measure}
      onPointerEnter={warm}
      onFocus={warm}
      data-index={index}
      className={styles.row}
      role="listitem"
      {...(m ? { 'data-message-id': m.id, tabIndex: -1, 'aria-label': name } : {})}
      data-new={isNew ? '' : undefined}
      data-flash={flash || undefined}
    >
      <RowHotCtx.Provider value={hot}>
        <Row row={row} index={index} cards={cards} layout={layout} ctx={ctx} />
      </RowHotCtx.Provider>
    </div>
  );
});

/**
 * PERF-04: a message row while the user flings the list: the bubble's or card's box at the row's known (measured, else
 * estimated) height, its colours and its plain text, with no meta, badges, chips, markdown, media or toolbar, and nothing
 * measured. Mounting a screen of full rows per wheel was the long frame; at rest every row is the full row again.
 */
const FlingRow = memo(function FlingRow({
  index,
  start,
  size,
  m,
  layout,
  cards,
}: {
  index: number;
  start: number;
  size: number;
  m: MessageRow;
  layout: RowLayout;
  cards: Record<string, CardRow>;
}) {
  const side = m.kind === 'card' ? 'card' : m.authorKind === 'user' ? 'me' : 'them';
  const text = m.kind === 'marker' ? m.text : flingText(m, cards);
  return (
    <div data-index={index} className={styles.row} role="listitem" style={{ top: start, height: size }}>
      <div className={styles.fling} data-side={side} data-gap={layout.gap} data-marker={m.kind === 'marker' || undefined}>
        <div className={styles.flingBox} data-deleted={m.deletedAt !== null || undefined}>
          {text}
        </div>
      </div>
    </div>
  );
});

/** Enough plain text to fill any row's box (the box clips it). */
const FLING_CHARS = 600;
const flingText = (m: MessageRow, cards: Record<string, CardRow>) => messagePlainText(m, cards).slice(0, FLING_CHARS);

function Row({
  row,
  index,
  cards,
  layout,
  ctx,
}: {
  row: VRow;
  index: number;
  cards: Record<string, CardRow>;
  layout: RowLayout;
  ctx: RowCtx;
}) {
  const find = useFind();
  switch (row.kind) {
    case 'start':
      return <StartOfChat label={row.label} messageId={row.messageId} />;
    case 'date':
      return <DateSeparator label={row.label} index={index} />;
    case 'unread':
      return <UnreadDivider label={row.label} />;
    case 'retention':
      return <RetentionLine />;
    case 'wa':
      return <WaBubble w={row.wa} gap={layout.gap === 'none' ? 's2' : layout.gap} ctx={ctx} />;
    case 'status':
      return <StatusLine text={row.text} indent={ctx.isGroup} />;
    case 'thinking': {
      const h = row.helperId ? ctx.helpers[row.helperId] : undefined;
      return h ? (
        <ThinkingRow face={h.faceRef} name={h.name} kind="helper" color={h.colorToken} label={ctx.isGroup} />
      ) : (
        <ThinkingRow face={ctx.fooFace} name={ctx.agentName} kind="foo" label={ctx.isGroup} />
      );
    }
    case 'message': {
      const m = row.message;
      const ranges = m.kind === 'card' ? [] : find.matches.filter((x) => x.messageId === m.id);
      void cards;
      if (!ranges.length) return <MessageView m={m} layout={layout} ctx={ctx} />;
      // In-chat find (03-shell-2 §3.6.3, 04 §1.10): while the bar is open, a matching bubble shows its text with the marks.
      const cur = find.index >= 0 ? find.matches[find.index] : undefined;
      return (
        <MessageView
          m={m}
          layout={layout}
          ctx={ctx}
          found={<Marked text={m.text} ranges={ranges} current={cur?.messageId === m.id ? cur : undefined} />}
        />
      );
    }
  }
}
