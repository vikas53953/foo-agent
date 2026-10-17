// Spec: 03-shell-2 §3.6.4 (column max --column-max centred, side padding 24 when the main shell is ≥ 900 else 16, top and
// bottom --s3; role="log" "Messages with {name}", one Tab stop, ↑/↓ between messages, Ctrl+Home / Ctrl+End; virtualised with
// @tanstack/react-virtual useVirtualizer, overscan 8, measureElement on every row, 02-2 §F13.3 estimates; scroll memory in
// ui.scroll[chatId]), §3.6.5 (separators, sticky date, unread divider and where the chat opens), §3.6.6, §3.6.7, §3.6.3 (centre
// the current find match), §3.9.2 (F6 lands on the last focused message, else the newest). M2 replaces the placeholder row
// with MessageRow / Bubble / cards.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { bp, motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import type { CardRow, ChatRow, MessageRow } from '../../shared/types';
import { registerFocusTarget } from '../a11y/focusTargets';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { CARD_ESTIMATE, titleOfCard } from '../cards/registry';
import { invoke } from '../ipc/client';
import { saveScroll, update, useStore } from '../store/index';
import { selectNow } from '../store/live';
import { prependMessagesReducer, selectChatMessages } from '../store/messages';
import { selectAgentName, selectTimeZone } from '../store/settings';
import { useFind } from '../shell/FindBar';
import { DateSeparator, StickyDate } from './DateSeparator';
import { JumpToLatest } from './JumpToLatest';
import { LoadOlder, StartOfChat } from './LoadOlder';
import styles from './MessageList.module.css';
import { REVEAL_EVENT, takeReveal } from './reveal';
import { buildRows, estimateRow, firstUnreadId, type VRow } from './rows';
import { nearTop, showJump, unreadOpenTop } from './stickToBottom';
import { UnreadDivider } from './UnreadDivider';
import { useStickToBottom } from './useStickToBottom';

export const PAGE = 50;

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

type OlderState = 'idle' | 'pending' | 'loading' | 'failed';

export function MessageList({ chat, unread }: { chat: ChatRow; unread: { count: number } }) {
  const slice = useStore(selectChatMessages(chat.id));
  const cards = useStore((s) => s.cards.byId);
  const tz = useStore(selectTimeZone);
  const agentName = useStore(selectAgentName);
  const now = useStore(selectNow);
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

  const messages = useMemo<MessageRow[]>(() => (slice ? slice.ids.map((id) => slice.byId[id]!) : []), [slice]);
  // The unread divider is fixed when the chat opens and removed when the user sends a message here (§3.6.5).
  const [unreadFrom, setUnreadFrom] = useState<string | null>(() => firstUnreadId(messages, unread.count));
  const userCount = useRef(messages.filter((m) => m.authorKind === 'user').length);
  useEffect(() => {
    const n = messages.filter((m) => m.authorKind === 'user').length;
    if (n > userCount.current) setUnreadFrom(null);
    userCount.current = n;
  }, [messages]);

  const rows = useMemo<VRow[]>(() => {
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
    return r;
  }, [messages, now, tz, slice?.hasMore, unreadFrom, unread.count, chat, agentName]);

  const cardType = useCallback((id: string) => (cards as Record<string, CardRow>)[id]?.type, [cards]);
  const rem = useMemo(remPx, []);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateRow(rows[i]!, cardType, CARD_ESTIMATE),
    getItemKey: (i) => rows[i]!.key,
    overscan: 8,
    paddingStart: rem,
    paddingEnd: rem,
  });

  const target = useMemo(
    () => ({ scrollToEnd: () => rows.length && v.scrollToIndex(rows.length - 1, { align: 'end' }), getTotalSize: () => v.getTotalSize() }),
    [rows.length, v],
  );
  const stick = useStickToBottom(scrollRef, rows, target);

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

  // A row grew or was measured: keep following at the bottom.
  const total = v.getTotalSize();
  useEffect(() => stick.onSizeChange(), [total]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.onScroll();
    setJumpShown(showJump(el));
    if (nearTop(el.scrollTop) && older === 'idle' && slice?.hasMore) void loadOlder();
    const firstVisible = v.getVirtualItems().find((i) => i.end > el.scrollTop + rem);
    const label = firstVisible ? dayLabels[firstVisible.index] : '';
    if (label && el.scrollTop > 0 && performance.now() - userInputAt.current < motion['delay-sticky-hide']) {
      setSticky({ label, shown: true });
      clearTimeout(stickyTimer.current);
      stickyTimer.current = setTimeout(() => setSticky((s) => ({ ...s, shown: false })), motion['delay-sticky-hide']);
    }
  };
  useEffect(() => () => clearTimeout(stickyTimer.current), []);

  const focusRow = useCallback(
    (index: number) => {
      if (index < 0 || index >= rows.length) return;
      v.scrollToIndex(index, { align: 'auto' });
      requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"][data-message-id]`)?.focus());
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

  // Doing-now row click (§3.7.3.1): scroll to the job's checklist card and flash it for 2 s.
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      const jobId = takeReveal(chat.id);
      if (!jobId) return;
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
        onScroll={onScroll}
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
        <div className={styles.column} role="list" style={{ height: v.getTotalSize() }}>
          {v.getVirtualItems().map((item) => {
            const r = rows[item.index]!;
            return (
              <div
                key={item.key}
                ref={v.measureElement}
                data-index={item.index}
                className={styles.row}
                style={{ transform: `translateY(${item.start}px)` }}
                role="listitem"
                {...(r.kind === 'message' ? { 'data-message-id': r.message.id, tabIndex: -1 } : {})}
                data-flash={(r.kind === 'message' && r.message.id === flashId) || undefined}
              >
                <Row row={r} index={item.index} cards={cards} />
              </div>
            );
          })}
        </div>
      </div>
      <JumpToLatest shown={jumpShown} count={stick.newCount} onJump={jump} />
    </div>
  );
}

function Row({ row, index, cards }: { row: VRow; index: number; cards: Record<string, CardRow> }) {
  const find = useFind();
  switch (row.kind) {
    case 'start':
      return <StartOfChat label={row.label} messageId={row.messageId} />;
    case 'date':
      return <DateSeparator label={row.label} index={index} />;
    case 'unread':
      return <UnreadDivider label={row.label} />;
    case 'message': {
      const m = row.message;
      const text = m.kind === 'card' && m.cardId ? (titleOfCard(cards[m.cardId]) ?? '') : m.text;
      const ranges = m.kind === 'card' ? [] : find.matches.filter((x) => x.messageId === m.id);
      const cur = find.index >= 0 ? find.matches[find.index] : undefined;
      return (
        <div className={styles.placeholder} data-author={m.authorKind} data-kind={m.kind}>
          <span className={styles.text}>
            {ranges.length ? <Marked text={text} ranges={ranges} current={cur?.messageId === m.id ? cur : undefined} /> : text}
          </span>
        </div>
      );
    }
  }
}

function Marked({
  text,
  ranges,
  current,
}: {
  text: string;
  ranges: { start: number; end: number }[];
  current?: { messageId: string; start: number };
}) {
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    parts.push(text.slice(at, r.start));
    parts.push(
      <mark key={i} className={styles.match} data-current={current?.start === r.start || undefined}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}
