// Spec: 03-shell-2 §3.9.6 (`ui.view: View`; navigate pushes onto `ui.back`, max 10, chat → chat replaces; back() pops,
// empty stack → lastChatId ?? foo's chat; dialogs never enter the back stack), 08-0 §G.10 `ui` slice (D-7),
// 03-shell-1 §3.1.3 (XS shows one pane), §3.3 (banner dismissals), §3.4.3–§3.4.4 (search text and chip are list state).
import type { BannerType, ChatFilter, DialogId, SearchFilter, View } from '../../shared/types';
import type { RootState } from './index';

export const BACK_MAX = 10;

/** At XS exactly one pane shows (03-shell-1 §3.1.3.3); the details page is a third (03-shell-2 §3.7.1). */
export type XsPane = 'list' | 'chat' | 'panel';

/** 06 §0.1 Overlays (M13, CR-0017): Search (06-3 §12, T5) and the attachment viewer (06-3 §13, T4); one at a time, Esc closes. */
export type Overlay =
  { kind: 'search'; q?: string; filter?: SearchFilter; helperId?: string } | { kind: 'viewer'; params: Record<string, string> };

export interface UiState {
  view: View;
  back: View[];
  dialog: DialogId | null;
  /** The chat a confirm dialog is about (C-1, C-5, C-6, C-7). */
  dialogTarget: string | null;
  /** Dialog requests waiting for the open one to close (§3.9.6 "a second dialog request waits"). */
  dialogQueue: DialogId[];
  /** 06 §0.1: a confirm (06-3 §14) opened on top of a Dialog; the Dialog under it is inert until it closes. */
  confirm: DialogId | null;
  overlay: Overlay | null;
  focusReturn: HTMLElement | null;
  scroll: Record<string, number>;
  selection: Set<string>;
  banner: BannerType | null;
  /** Banners hidden with Dismiss this session (notifications_blocked returns after 7 days: session-only in M1). */
  dismissed: BannerType[];
  findOpen: boolean;
  rightShellOpenOverlay: boolean;
  xsPane: XsPane;
  /** The open shell menu or popover (one at a time; Esc ladder step 1). */
  menu: string | null;
  chatFilter: ChatFilter;
  chatQuery: string;
}

export function initialUi(): UiState {
  return {
    view: { kind: 'chat', chatId: '' },
    back: [],
    dialog: null,
    dialogTarget: null,
    dialogQueue: [],
    confirm: null,
    overlay: null,
    focusReturn: null,
    scroll: {},
    selection: new Set(),
    banner: null,
    dismissed: [],
    findOpen: false,
    rightShellOpenOverlay: false,
    xsPane: 'chat',
    menu: null,
    chatFilter: 'all',
    chatQuery: '',
  };
}

/** navigate(view): pushes the current view (max 10, oldest dropped) unless both are chats; then sets it. */
export function navigateReducer(ui: UiState, view: View): void {
  if (view.kind === 'chat' && ui.view.kind === 'chat') {
    ui.view = view;
    return;
  }
  ui.back.push(ui.view);
  if (ui.back.length > BACK_MAX) ui.back.splice(0, ui.back.length - BACK_MAX);
  ui.view = view;
}

/** back(): pops; with an empty stack, goes to `fallback` (settings.window.lastChatId ?? foo's chat). */
export function backReducer(ui: UiState, fallback: View): void {
  ui.view = ui.back.pop() ?? fallback;
}

export function openDialogReducer(ui: UiState, id: DialogId): void {
  ui.menu = null;
  ui.overlay = null;
  if (ui.dialog === null) ui.dialog = id;
  else if (ui.dialog !== id && !ui.dialogQueue.includes(id)) ui.dialogQueue.push(id);
}

export function closeDialogReducer(ui: UiState): void {
  ui.dialog = ui.dialogQueue.shift() ?? null;
}

export const selectView = (s: RootState) => s.ui.view;
export const selectOpenChatId = (s: RootState): string | null => (s.ui.view.kind === 'chat' && s.ui.view.chatId ? s.ui.view.chatId : null);
export const selectDialog = (s: RootState) => s.ui.dialog;
export const selectConfirm = (s: RootState) => s.ui.confirm;
export const selectOverlay = (s: RootState) => s.ui.overlay;
export const selectMenu = (s: RootState) => s.ui.menu;
export const selectFindOpen = (s: RootState) => s.ui.findOpen;
export const selectRightShellOpenOverlay = (s: RootState) => s.ui.rightShellOpenOverlay;
export const selectXsPane = (s: RootState) => s.ui.xsPane;
export const selectChatFilter = (s: RootState) => s.ui.chatFilter;
export const selectChatQuery = (s: RootState) => s.ui.chatQuery;
export const selectDismissed = (s: RootState) => s.ui.dismissed;

/** 06 §0.1: opening an Overlay closes menus and any Dialog (only one interactive Dialog or Overlay at a time). */
export function openOverlayReducer(ui: UiState, overlay: Overlay): void {
  ui.menu = null;
  ui.dialog = null;
  ui.dialogQueue = [];
  ui.confirm = null;
  ui.overlay = overlay;
}

/** 06 §0.1: a confirm opens on top of the open Dialog (or alone when none is open). */
export function openConfirmReducer(ui: UiState, id: DialogId): void {
  ui.menu = null;
  if (ui.dialog === null) ui.dialog = id;
  else if (ui.dialog !== id) ui.confirm = id;
}
