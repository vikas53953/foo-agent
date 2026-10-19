// Spec: 03-shell-2 §3.9.6 (one Zustand store, one file per slice: ui, live, chats, messages, cards, jobs, connections,
// spend, settings; selectors `selectX` beside their slice; components never subscribe to the whole store), 08-5 §5
// (immer; rev rule), 08-0 §G.10. Actions that more than one surface needs live here; event reducers are in apply.ts.
import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ChatFilter, DialogId, View } from '../../shared/types';
import { initialCards, type CardsState } from './cards';
import { initialChats, type ChatsState } from './chats';
import { initialConnections, type ConnectionsState } from './connections';
import { initialHelpers, type HelpersState } from './helpers';
import { initialJobs, type JobsState } from './jobs';
import { initialLive, type LiveState } from './live';
import { initialMessages, type MessagesState } from './messages';
import { initialSettings, type SettingsState } from './settings';
import { initialSpend, type SpendState } from './spend';
import { backReducer, closeDialogReducer, initialUi, navigateReducer, openDialogReducer, type UiState, type XsPane } from './ui';

enableMapSet();

export interface RootState {
  ui: UiState;
  live: LiveState;
  chats: ChatsState;
  messages: MessagesState;
  cards: CardsState;
  jobs: JobsState;
  connections: ConnectionsState;
  spend: SpendState;
  settings: SettingsState;
  /** Helper names, jobs and faces for the chat header and right shell (store/helpers.ts). */
  helpers: HelpersState;
}

export function initialState(now = Date.now()): RootState {
  return {
    ui: initialUi(),
    live: initialLive(now),
    chats: initialChats(),
    messages: initialMessages(),
    cards: initialCards(),
    jobs: initialJobs(),
    connections: initialConnections(),
    spend: initialSpend(),
    settings: initialSettings(),
    helpers: initialHelpers(),
  };
}

export const useStore = create<RootState>()(immer(() => initialState()));

/** Writes through immer: `update((s) => { s.ui.menu = null; })`. */
export function update(fn: (draft: RootState) => void): void {
  useStore.setState((draft) => fn(draft as unknown as RootState));
}

/** For tests and the visual harness. */
export function resetStore(now?: number): void {
  useStore.setState(initialState(now), true);
}

// ---------------------------------------------------------------- navigation (03-shell-2 §3.9.6)

function fallbackView(s: RootState): View {
  const last = s.settings.value?.window.lastChatId;
  const fooId = s.chats.order.find((id) => s.chats.byId[id]?.kind === 'foo' && !s.chats.byId[id]?.private);
  const chatId = last && s.chats.byId[last] ? last : (fooId ?? s.chats.order[0] ?? '');
  return { kind: 'chat', chatId };
}

/** Moves to a view. Opening a chat selects it and, at XS, shows the chat pane. */
export function navigate(view: View): void {
  update((s) => {
    navigateReducer(s.ui, view);
    s.ui.menu = null;
    if (view.kind === 'chat') {
      s.chats.selectedId = view.chatId;
      s.ui.xsPane = 'chat';
      s.ui.findOpen = false;
      s.ui.selection = new Set();
    }
  });
}

/** One step back; with nothing to go back to, foo's chat (or the last chat). */
export function back(): void {
  update((s) => {
    backReducer(s.ui, fallbackView(s));
    if (s.ui.view.kind === 'chat') s.chats.selectedId = s.ui.view.chatId;
  });
}

export function openDialog(id: DialogId): void {
  update((s) => openDialogReducer(s.ui, id));
}

export function closeDialog(): void {
  update((s) => closeDialogReducer(s.ui));
}

export function setMenu(id: string | null): void {
  update((s) => {
    s.ui.menu = id;
  });
}

export function setXsPane(pane: XsPane): void {
  update((s) => {
    s.ui.xsPane = pane;
  });
}

export function setChatFilter(filter: ChatFilter): void {
  update((s) => {
    s.ui.chatFilter = filter;
  });
}

export function setChatQuery(q: string): void {
  update((s) => {
    s.ui.chatQuery = q;
  });
}

export function setFindOpen(open: boolean): void {
  update((s) => {
    s.ui.findOpen = open;
  });
}

export function setRightShellOpenOverlay(open: boolean): void {
  update((s) => {
    s.ui.rightShellOpenOverlay = open;
  });
}

export function setFocusReturn(el: HTMLElement | null): void {
  update((s) => {
    s.ui.focusReturn = el;
  });
}

/** Clears the message selection (selection bar Cancel, Esc ladder). */
export function clearSelection(): void {
  update((s) => {
    s.ui.selection = new Set();
  });
}

/** Remembers a chat's scroll position for this session (03-shell-2 §3.6.4). */
export function saveScroll(chatId: string, top: number): void {
  update((s) => {
    s.ui.scroll[chatId] = top;
  });
}

// M5 (T5): the composer's placeholder after a Choice card's "Something else…" (05-1 §5.3.2).
export function setComposerHint(hint: { chatId: string; text: string } | null): void {
  update((s) => {
    s.ui.composerHint = hint;
  });
}
