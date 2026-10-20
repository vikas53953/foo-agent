// Spec: 03-shell-1 §3.4.5–§3.4.8 rows in the §3.4.8 order (no section labels; focus and selection follow the chat id),
// §3.4.7 loading skeleton rows, §3.4.9 row context menu (right-click, Shift+F10, Menu key; only the items that apply;
// mute submenu; pins limited to 3), §3.4.10 empty and error states (02-2 §F16.2 Block: 32 top, centred, max 260, icon 24
// → 12 → body `--t-small` `--fg-2` → 16 → one button; `role="status"`), 03-shell-2 §3.9.1 (one Tab stop, roving
// tabindex), §3.9.2 (F6 lands on the selected row or the first), §3.9.3 (↑/↓, Home/End, Enter/Space opens and moves focus
// to the composer, Shift+F10 / Menu key, type-ahead by name), §3.9.5 (`listbox` "Chat list"). Test id `chatlist`.
// 02 §F7.1 "Chat list" [X-179]: a new chat slides in at the top while the others glide down (FLIP from row tops, CSS
// transitions only, FE-24); a newly pinned chat drops in with the overshooting spring; search results stagger 30ms; no
// results shows foo's 64px face scanning in the icon slot (02-2 §F16.2 Block face, CR-0021 pick 6: decorative, no ring).
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { ChatFilter, ChatRow as Row } from '../../shared/types';
import { focusPane, registerFocusTarget } from '../a11y/focusTargets';
import { reducedMotionNow } from '../a11y/useReducedMotion';
import { motion } from '../../shared/tokens';
import { openChat } from '../shell/actions';
import { loadBootstrap } from '../store/apply';
import { setMenu, useStore } from '../store/index';
import { selectVisibleChatIds } from '../store/chats';
import { selectLoaded, selectLoadFailed } from '../store/live';
import { selectAgentName } from '../store/settings';
import { selectChatFilter, selectChatQuery } from '../store/ui';
import { Button } from '../ui/Button';
import { FacePose } from '../ui/Face';
import { Icon, type IconName } from '../ui/Icon';
import { Menu } from '../ui/Menu';
import { Skeleton } from '../ui/Skeleton';
import { ChatRow } from './ChatRow';
import { CHATLIST_DOM_ID } from './ChatSearch';
import { rowMenuEntries, typeAheadTarget } from './menu';
import { flipPlan, staggerIndex, STAGGER_CAP } from './motion';
import { isUserPinned } from './rules';
import styles from './ChatList.module.css';

export const SKELETON_ROWS = 6;
export const CHAT_MENU_ID = 'chatlist-row';
/** "Search all messages" opens the Ctrl+K search overlay (J22), which a later milestone builds; this is its ui.menu id. */
export const SEARCH_ALL_MENU_ID = 'search-all';

const EMPTY: Record<Exclude<ChatFilter, 'all'>, { icon: IconName; key: () => string }> = {
  needs_you: { icon: 'CheckmarkCircle', key: () => t('chatlist.empty.body.needs_you') },
  working: { icon: 'Clock', key: () => t('chatlist.empty.body.working') },
  done: { icon: 'CheckmarkCircle', key: () => t('chatlist.empty.body.done') },
};

function EmptyBlock({
  state,
  icon,
  scan,
  bad,
  body,
  action,
}: {
  state: string;
  icon: IconName;
  /** Show foo's scanning face instead of the icon (no results). */
  scan?: boolean;
  bad?: boolean;
  body: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <div className={styles.empty} role="status" data-testid={TID.chatlistEmpty} data-state={state}>
      {scan ? (
        <FacePose pose="scan" className={styles.emptyPose} />
      ) : (
        <span className={bad ? styles.emptyIconBad : styles.emptyIcon}>
          <Icon name={icon} size={24} />
        </span>
      )}
      <p className={styles.emptyBody}>{body}</p>
      {action && (
        <Button variant={state === 'search' ? 'link' : 'outline'} size="sm" data-testid={TID.chatlistEmptyAction} onClick={action.run}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

const SkeletonRow = memo(function SkeletonRow() {
  return (
    <div className={styles.skeletonRow} data-loading="">
      <Skeleton shape="circle" width="var(--avatar-list)" height="var(--avatar-list)" />
      <span className={styles.skeletonBars}>
        <Skeleton shape="bar" width="60%" />
        <Skeleton shape="bar" width="85%" />
      </span>
    </div>
  );
});

/** Longest a FLIP, arrival or stagger can run; the data-* it set are cleared after this. */
const SETTLE_MS = motion.spring + STAGGER_CAP * motion.stagger;
const NO_IDS: string[] = [];
/** `--ease-spring` overshoots 2.6 % of the distance; past this a "drop" would overshoot more than Quiet premium's 2px. */
const DROP_MAX_PX = 76;
/** The latest run that touched each row, so an older run's clean-up never cuts a newer animation short. */
const runOf = new WeakMap<HTMLElement, number>();
let runs = 0;

function rowTops(list: HTMLElement): Map<string, number> {
  const tops = new Map<string, number>();
  for (const el of list.querySelectorAll<HTMLElement>('[data-chat-id]')) tops.set(el.dataset.chatId ?? '', el.offsetTop);
  return tops;
}

/**
 * Animates list changes after React commits them: rows that moved start at their old top and glide to the new one;
 * new rows slide in; entering a search staggers every result. A filter switch or a search edit only staggers what
 * arrives; nothing runs on the first paint or when motion is off.
 */
function useListMotion(listRef: RefObject<HTMLDivElement | null>, ids: string[], filter: ChatFilter, query: string): void {
  const last = useRef<{ tops: Map<string, number>; pinned: Set<string>; filter: ChatFilter; query: string } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      // the empty state replaced the list: nothing to measure, and the next list starts from nothing
      last.current = { tops: new Map(), pinned: new Set(), filter, query };
      return;
    }
    const s = useStore.getState();
    const pinned = new Set(
      ids.filter((id) => {
        const r = s.chats.byId[id];
        return r !== undefined && isUserPinned(r);
      }),
    );
    const tops = rowTops(list);
    const prev = last.current;
    last.current = { tops, pinned, filter, query };
    if (!prev || reducedMotionNow()) return;
    const els = new Map<string, HTMLElement>();
    for (const el of list.querySelectorAll<HTMLElement>('[data-chat-id]')) els.set(el.dataset.chatId ?? '', el);
    const touched: HTMLElement[] = [];
    const sameView = prev.filter === filter && prev.query === query;
    const enteringSearch = prev.query === '' && query !== '';
    const plan = flipPlan(sameView ? prev.tops : new Map(), tops);
    const drops = new Set<string>();
    for (const { id, dy } of plan.moves) {
      const el = els.get(id);
      if (!el) continue;
      el.style.setProperty('--flip-y', `${dy}px`);
      el.dataset.flip = 'from';
      if (pinned.has(id) && !prev.pinned.has(id) && Math.abs(dy) <= DROP_MAX_PX) drops.add(id);
      touched.push(el);
    }
    if (touched.length > 0) {
      list.getBoundingClientRect(); // one reflow so the start offsets take before the transition runs
      for (const el of touched) {
        el.dataset.flip = drops.has(el.dataset.chatId ?? '') ? 'drop' : 'glide';
        el.style.removeProperty('--flip-y');
      }
    }
    const arriving = enteringSearch
      ? ids
      : query !== '' && prev.query !== ''
        ? ids.filter((id) => !prev.tops.has(id))
        : sameView
          ? plan.arrivals
          : NO_IDS;
    for (const id of arriving) {
      const el = els.get(id);
      if (!el) continue;
      el.style.setProperty('--i', String(query !== '' ? staggerIndex(ids.indexOf(id)) : 0));
      el.dataset.arrive = '';
      touched.push(el);
    }
    if (touched.length === 0) return;
    const run = ++runs;
    for (const el of touched) runOf.set(el, run);
    setTimeout(() => {
      for (const el of touched) {
        if (runOf.get(el) !== run) continue;
        delete el.dataset.flip;
        delete el.dataset.arrive;
        el.style.removeProperty('--flip-y');
        el.style.removeProperty('--i');
      }
    }, SETTLE_MS);
  }, [listRef, ids, filter, query]);
}

function useRow(id: string): Row | undefined {
  return useStore((s) => s.chats.byId[id]);
}

const RowById = memo(function RowById(props: Omit<Parameters<typeof ChatRow>[0], 'row'> & { id: string }) {
  const { id, ...rest } = props;
  const row = useRow(id);
  return row ? <ChatRow row={row} {...rest} /> : null;
});

export function ChatList() {
  const ids = useStore(useShallow(selectVisibleChatIds));
  const loaded = useStore(selectLoaded);
  const failed = useStore(selectLoadFailed);
  const filter = useStore(selectChatFilter);
  const query = useStore(selectChatQuery);
  const selectedId = useStore((s) => s.chats.selectedId);
  const menuOpen = useStore((s) => s.ui.menu === CHAT_MENU_ID);
  const listRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenuState] = useState<{ chatId: string; anchor: { x: number; y: number } | HTMLElement } | null>(null);
  const typed = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const menuRow = useStore((s) => (menu ? s.chats.byId[menu.chatId] : undefined));
  useListMotion(listRef, loaded ? ids : NO_IDS, filter, query);

  const activeId = focusId && ids.includes(focusId) ? focusId : selectedId && ids.includes(selectedId) ? selectedId : (ids[0] ?? null);
  const activeRef = useRef(activeId);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const rowEl = useCallback((id: string) => listRef.current?.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(id)}"]`) ?? null, []);
  const focusRow = useCallback(
    (id: string | null) => {
      if (!id) return false;
      setFocusId(id);
      const el = rowEl(id);
      if (!el) return false;
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
      return true;
    },
    [rowEl],
  );

  useEffect(() => registerFocusTarget('chatlist', () => focusRow(activeRef.current)), [focusRow]);

  const onOpen = useCallback((chatId: string) => {
    setFocusId(chatId);
    openChat(chatId);
  }, []);

  const onMenu = useCallback((chatId: string, at: { x: number; y: number } | HTMLElement) => {
    setFocusId(chatId);
    setMenuState({ chatId, anchor: at });
    setMenu(CHAT_MENU_ID);
  }, []);

  const closeMenu = useCallback(
    (chose: boolean) => {
      const id = menu?.chatId ?? null;
      setMenuState(null);
      setMenu(null);
      if (!chose && id) rowEl(id)?.focus();
    },
    [menu, rowEl],
  );

  const onRowKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, chatId: string) => {
      const s = useStore.getState();
      const list = selectVisibleChatIds(s);
      const i = list.indexOf(chatId);
      const go = (n: number) => {
        e.preventDefault();
        focusRow(list[Math.min(Math.max(n, 0), list.length - 1)] ?? null);
      };
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case 'ArrowDown':
          return go(i + 1);
        case 'ArrowUp':
          return go(i - 1);
        case 'Home':
          return go(0);
        case 'End':
          return go(list.length - 1);
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
          openChat(chatId);
          setFocusId(chatId);
          requestAnimationFrame(() => focusPane('composer'));
          return;
        }
        case 'ContextMenu':
          e.preventDefault();
          return onMenu(chatId, e.currentTarget);
        case 'F10':
          if (e.shiftKey) {
            e.preventDefault();
            onMenu(chatId, e.currentTarget);
          }
          return;
      }
      if (e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key)) {
        const now = Date.now();
        const prev = typed.current;
        const text = now - prev.at < 1000 && prev.text !== e.key ? prev.text + e.key : e.key;
        typed.current = { text, at: now };
        const agent = selectAgentName(s);
        const name = (id: string) => {
          const r = s.chats.byId[id];
          return r ? (r.kind === 'foo' && !r.private ? agent : r.title) : '';
        };
        const target = typeAheadTarget(list, name, text.length > 1 ? (list[i - 1] ?? null) : chatId, text);
        if (target) {
          e.preventDefault();
          focusRow(target);
        }
      }
    },
    [focusRow, onMenu],
  );

  let empty: ReactNode = null;
  if (failed && ids.length === 0) {
    empty = (
      <EmptyBlock
        state="load_failed"
        icon="ErrorCircle"
        bad
        body={t('chatlist.empty.body.load_failed')}
        action={{ label: t('chatlist.empty.action.load_failed'), run: () => void loadBootstrap() }}
      />
    );
  } else if (loaded && ids.length === 0 && query !== '') {
    empty = (
      <EmptyBlock
        state="search"
        icon="Search"
        scan
        body={t('chatlist.empty.body.search', { query })}
        action={{ label: t('chatlist.empty.action.search'), run: () => setMenu(SEARCH_ALL_MENU_ID) }}
      />
    );
  } else if (loaded && ids.length === 0 && filter !== 'all') {
    empty = <EmptyBlock state={filter} icon={EMPTY[filter].icon} body={EMPTY[filter].key()} />;
  }

  return (
    <div className={styles.scroll}>
      {empty ?? (
        <div
          ref={listRef}
          id={CHATLIST_DOM_ID}
          className={styles.list}
          role="listbox"
          aria-label={t('chatlist.list.label')}
          aria-busy={!loaded || undefined}
          data-testid={TID.chatlist}
          data-state={loaded ? 'ready' : 'loading'}
          onFocus={(e) => {
            const id = (e.target as HTMLElement).dataset.chatId;
            if (id && id !== focusId) setFocusId(id);
          }}
        >
          {loaded
            ? ids.map((id, index) => (
                <RowById
                  key={id}
                  id={id}
                  index={index}
                  focusable={id === activeId}
                  onOpen={onOpen}
                  onMenu={onMenu}
                  onKeyDown={onRowKeyDown}
                />
              ))
            : Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} />)}
        </div>
      )}
      {menuOpen && menu && menuRow && <ChatRowMenu row={menuRow} anchor={menu.anchor} onClose={closeMenu} />}
    </div>
  );
}

function ChatRowMenu({
  row,
  anchor,
  onClose,
}: {
  row: Row;
  anchor: { x: number; y: number } | HTMLElement;
  onClose: (chose: boolean) => void;
}) {
  const ctx = useStore(
    useShallow((s) => {
      const until = s.settings.value?.notifications.mutedChats[row.id];
      return {
        agentName: selectAgentName(s),
        muted: until !== undefined && (until === 'forever' || until > s.live.now),
        markedUnread: s.live.markedUnread[row.id] === true,
        now: s.live.now,
      };
    }),
  );
  const [entries] = useState(() => rowMenuEntries(row, ctx));
  return <Menu entries={entries} anchor={anchor instanceof HTMLElement ? { el: anchor } : anchor} label={row.title} onClose={onClose} />;
}
