// Spec: 08-0 §B (row types), §G.10 (ui/live slices), 08-5 §5 (data slices), 08-1 §3 (IPC), 08-0 §E.3 (ui primitives).
// M1 builder B stand-ins for modules builder A owns. EVERY export here has the exact spec name and shape; at merge the lead
// deletes this file and points the imports at A's real modules (the map is in implementation-notes.md "M1 (builder B)").
// Nothing in this file is a design decision of its own.
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { bp } from '../shared/tokens';
import './_m1b-stubs.css';

// ───────────────────────── 08-0 §B types → src/shared/types.ts ─────────────────────────

export type ChatKind = 'foo' | 'helper' | 'group' | 'wa_mirror';
export type FaceRef = string;
export type BannerType =
  | 'offline'
  | 'ai_not_answering'
  | 'ai_signed_out'
  | 'ai_cap'
  | 'plan_limit'
  | 'notifications_blocked'
  | 'update_ready';
export type SettingsPage =
  | 'account'
  | 'appearance'
  | 'notifications'
  | 'permissions'
  | 'money'
  | 'privacy'
  | 'routines-settings'
  | 'connections'
  | 'chat'
  | 'shortcuts'
  | 'about';
export type ScreenId = string;
export type DialogId = `c-${string}` | 'new-helper' | 'new-group';
export type View =
  | { kind: 'chat'; chatId: string }
  | { kind: 'settings'; page: SettingsPage; row?: string }
  | { kind: 'screen'; id: ScreenId; params?: Record<string, string> };
export type WaitingReason =
  | 'ai_offline'
  | 'ai_down'
  | 'ai_signed_out'
  | 'ai_limit'
  | 'spend_cap'
  | 'net_offline'
  | 'asleep'
  | 'app_quit'
  | 'windows_shutdown'
  | 'opens_at';
export type JobState = 'queued' | 'working' | 'needs_you' | 'waiting' | 'done' | 'done_unverified' | 'failed' | 'cancelled';
export type ProviderId =
  | 'claude-cli'
  | 'codex-cli'
  | 'gemini-cli'
  | 'openai-key'
  | 'anthropic-key'
  | 'google-key'
  | 'ollama'
  | 'fake';

/** 08-1 §4.3 `chats` camelCased + 08-0 §B.1 derived fields. */
export interface ChatRow {
  id: string;
  kind: ChatKind;
  helperId: string | null;
  title: string;
  avatarRef: FaceRef | null;
  colorToken: string | null;
  waJid: string | null;
  pinned: boolean;
  archived: boolean;
  unreadCount: number;
  pill: 'needs_you' | 'working' | 'done' | 'paused' | null;
  lastActivityAt: number;
  createdAt: number;
  private: boolean;
  rev: number;
  lastLine: string;
  lastTime: number;
  hasDraft: boolean;
  face: FaceRef;
  memberIds?: string[];
  helper?: { id: string; color: string };
}

/** 08-1 §4.3 `messages` camelCased (textForAi dropped) + reactions. */
export interface MessageRow {
  id: string;
  chatId: string;
  seq: number;
  authorKind: 'user' | 'foo' | 'helper' | 'system';
  authorId: string | null;
  kind: 'text' | 'voice' | 'card' | 'marker';
  markerKind: 'start_of_chat' | 'handoff' | 'memory_chip' | 'helper_notice' | 'system_line' | null;
  text: string;
  status: 'queued' | 'sent' | 'streaming' | 'complete' | 'failed';
  cardId: string | null;
  jobId: string | null;
  createdAt: number;
  rev: number;
  reactions: { emoji: string; by: 'me' | string }[];
}

/** 08-1 §4.3 `cards` (the fields the shell reads). */
export interface CardRow {
  id: string;
  chatId: string;
  type: string;
  state: string;
  title: string;
  rev: number;
}

/** 08-1 §4.3 `jobs` camelCased (aiSessionId dropped) + 08-0 §B.1 derived fields (the fields the shell reads). */
export interface JobRow {
  id: string;
  chatId: string;
  originChatId: string;
  ownerKind: 'foo' | 'helper';
  ownerId: string | null;
  title: string;
  state: JobState;
  waitingReason: WaitingReason | null;
  needsYouCardId: string | null;
  currentStepIdx: number | null;
  stepCount: number;
  route: 'api' | 'browser' | 'screen' | null;
  usesBrowser: boolean;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  rev: number;
  stepsDone: number;
  nowLine: string;
  slow: boolean;
}

export interface HelperRow {
  id: string;
  name: string;
  jobText: string;
  faceRef: FaceRef;
  colorToken: string;
}

export interface RoutineRow {
  id: string;
  ownerChatId: string;
  title: string;
  state: 'on' | 'paused' | 'paused_away' | 'paused_cap' | 'deleted';
  nextRunAt: number | null;
  rev: number;
}

/** 08-5 §3.6 (fields the panel reads). */
export interface MemoryFactView {
  id: string;
  scope: 'global' | 'chat' | 'helper';
  chatId: string | null;
  text: string;
  provenance: 'said' | 'guessed';
  reason: string | null;
  private: boolean;
  learnedAt: number;
  lastUsedAt: number | null;
  file: string;
}

/** 08-5 §3.2. */
export interface SpendSummary {
  month: string;
  aiSpentPaise: number | null;
  aiCapPaise: number;
  aiBilling: 'plan' | 'key' | 'local';
  planUsedPct?: number;
  purchasesPaise: number;
  purchaseCapPaise: number;
  purchaseCount: number;
}

/** 08-5 §3.1. */
export interface AiStatus {
  primary: ProviderId | null;
  displayName: string;
  billing: 'plan' | 'key' | 'local';
  state: 'ok' | 'offline' | 'down' | 'signed_out' | 'limit' | 'key_invalid' | 'unverified';
  resetAt?: number;
  usingBackup: boolean;
  planUsedPct?: number | null;
}
export interface SetupState {
  complete: boolean;
  step: 0 | 1 | 2 | 3 | 4 | 5;
}

/** 08-5 §3.1 PublicSettings (the keys the shell reads, 08-0 §A). */
export interface PublicSettings {
  identity: { agentName: string };
  user: { firstName?: string };
  locale: { timeZone: string };
  window: { rightShellOpen: boolean; lastChatId?: string; sidebarWidth: number };
  notifications: {
    quiet: { on: boolean; from: string; to: string; days: number[] };
    mutedChats: Record<string, number | 'forever'>;
  };
}

// ─────────────── store → src/renderer/store/index.ts (+ ui.ts, live.ts, chats.ts, messages.ts, jobs.ts …) ───────────────

export interface StoreState {
  ui: {
    view: View;
    back: View[];
    dialog: DialogId | null;
    focusReturn: HTMLElement | null;
    scroll: Record<string, number>;
    selection: Set<string>;
    banner: BannerType | null;
    findOpen: boolean;
    rightShellOpenOverlay: boolean;
  };
  live: {
    connection: 'online' | 'offline' | 'ai_down';
    typingChatId?: string;
    windowFocused: boolean;
  };
  chats: { byId: Record<string, ChatRow>; order: string[]; selectedId: string | null };
  messages: {
    byChat: Record<string, { ids: string[]; byId: Record<string, MessageRow>; oldestSeq: number | null; hasMore: boolean; lastSeq: number }>;
  };
  cards: { byId: Record<string, CardRow> };
  jobs: { byId: Record<string, JobRow>; byChat: Record<string, string[]> };
  spend: { summary: SpendSummary };
  settings: { value: PublicSettings };
  /** Not a spec slice: Bootstrap.setup / Bootstrap.ai / helpers, wherever A keeps them. */
  app: { setup: SetupState; ai: AiStatus; helpers: Record<string, HelperRow>; takenOverJobIds: string[]; xsPane: 'list' | 'chat' };
}

const emptySpend: SpendSummary = {
  month: '',
  aiSpentPaise: 0,
  aiCapPaise: 100_000,
  aiBilling: 'key',
  purchasesPaise: 0,
  purchaseCapPaise: 2_500_000,
  purchaseCount: 0,
};

export function initialState(): StoreState {
  return {
    ui: {
      view: { kind: 'chat', chatId: '' },
      back: [],
      dialog: null,
      focusReturn: null,
      scroll: {},
      selection: new Set(),
      banner: null,
      findOpen: false,
      rightShellOpenOverlay: false,
    },
    live: { connection: 'online', windowFocused: true },
    chats: { byId: {}, order: [], selectedId: null },
    messages: { byChat: {} },
    cards: { byId: {} },
    jobs: { byId: {}, byChat: {} },
    spend: { summary: emptySpend },
    settings: {
      value: {
        identity: { agentName: 'foo' },
        user: {},
        locale: { timeZone: 'Asia/Kolkata' },
        window: { rightShellOpen: true, sidebarWidth: 340 },
        notifications: { quiet: { on: false, from: '2200', to: '0700', days: [0, 1, 2, 3, 4, 5, 6] }, mutedChats: {} },
      },
    },
    app: {
      setup: { complete: true, step: 5 },
      ai: { primary: 'claude-cli', displayName: 'Claude', billing: 'plan', state: 'ok', usingBackup: false },
      helpers: {},
      takenOverJobIds: [],
      xsPane: 'chat',
    },
  };
}

let state: StoreState = initialState();
const listeners = new Set<() => void>();

export function getState(): StoreState {
  return state;
}
export function setState(fn: (s: StoreState) => StoreState): void {
  state = fn(state);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Zustand-style hook: components always pass a selector (08-5 §5 rule 1). */
export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// selectors (A: beside their slice)
export const selectView = (s: StoreState) => s.ui.view;
export const selectOpenChatId = (s: StoreState) => (s.ui.view.kind === 'chat' ? s.ui.view.chatId : null);
export const selectChat = (id: string | null) => (s: StoreState) => (id ? s.chats.byId[id] : undefined);
export const selectChatMessages = (id: string | null) => (s: StoreState) => (id ? s.messages.byChat[id] : undefined);
export const selectJobsById = (s: StoreState) => s.jobs.byId;
export const selectCardsById = (s: StoreState) => s.cards.byId;
export const selectChatsById = (s: StoreState) => s.chats.byId;
export const selectSpend = (s: StoreState) => s.spend.summary;
export const selectSettings = (s: StoreState) => s.settings.value;
export const selectFindOpen = (s: StoreState) => s.ui.findOpen;
export const selectSelection = (s: StoreState) => s.ui.selection;
export const selectDialog = (s: StoreState) => s.ui.dialog;
export const selectRightShellOpenOverlay = (s: StoreState) => s.ui.rightShellOpenOverlay;
export const selectConnection = (s: StoreState) => s.live.connection;
export const selectTypingChatId = (s: StoreState) => s.live.typingChatId;
export const selectSetup = (s: StoreState) => s.app.setup;
export const selectAiStatus = (s: StoreState) => s.app.ai;
export const selectHelpers = (s: StoreState) => s.app.helpers;
export const selectTakenOverJobIds = (s: StoreState) => s.app.takenOverJobIds;
export const selectXsPane = (s: StoreState) => s.app.xsPane;

// actions (A: `ui` slice per 03-shell-2 §3.9.6)
export function navigate(view: View): void {
  setState((s) => {
    if (s.ui.view.kind === 'chat' && view.kind === 'chat') return { ...s, ui: { ...s.ui, view } };
    return { ...s, ui: { ...s.ui, view, back: [...s.ui.back, s.ui.view].slice(-10) } };
  });
}
export function back(): void {
  setState((s) => {
    const prev = s.ui.back[s.ui.back.length - 1];
    const fallback: View = { kind: 'chat', chatId: s.settings.value.window.lastChatId ?? '' };
    return { ...s, ui: { ...s.ui, view: prev ?? fallback, back: s.ui.back.slice(0, -1) } };
  });
}
export const setFindOpen = (on: boolean) => setState((s) => ({ ...s, ui: { ...s.ui, findOpen: on } }));
export const setDialog = (id: DialogId | null) => setState((s) => ({ ...s, ui: { ...s.ui, dialog: id } }));
export const clearSelection = () => setState((s) => ({ ...s, ui: { ...s.ui, selection: new Set() } }));
export const saveScroll = (chatId: string, top: number) =>
  setState((s) => ({ ...s, ui: { ...s.ui, scroll: { ...s.ui.scroll, [chatId]: top } } }));
export const setRightShellOpenOverlay = (on: boolean) =>
  setState((s) => ({ ...s, ui: { ...s.ui, rightShellOpenOverlay: on } }));
/** L only: persists `settings.window.rightShellOpen` (08-0 §A) through `settings:set`. */
export function setRightShellOpenPersisted(on: boolean): void {
  setState((s) => ({
    ...s,
    settings: { value: { ...s.settings.value, window: { ...s.settings.value.window, rightShellOpen: on } } },
  }));
  void invoke('settings:set', { path: 'window.rightShellOpen', value: on }).catch(() => undefined);
}
/** XS only: list view vs chat view (03-shell-1 §3.1.3.3). */
export const setXsPane = (pane: 'list' | 'chat') => setState((s) => ({ ...s, app: { ...s.app, xsPane: pane } }));
/** messages slice: the first open (chat:open) and older pages (message:list), 08-5 §5 rule 5. */
export function putMessages(chatId: string, rows: MessageRow[], opts: { prepend: boolean; hasMore: boolean }): void {
  setState((s) => {
    const cur = s.messages.byChat[chatId];
    const byId = { ...(opts.prepend && cur ? cur.byId : {}) };
    for (const r of rows) byId[r.id] = r;
    const ids = opts.prepend && cur ? [...rows.map((r) => r.id), ...cur.ids] : rows.map((r) => r.id);
    const seqs = ids.map((id) => byId[id]!.seq);
    return {
      ...s,
      messages: {
        byChat: {
          ...s.messages.byChat,
          [chatId]: {
            ids,
            byId,
            oldestSeq: seqs.length ? Math.min(...seqs) : null,
            lastSeq: seqs.length ? Math.max(...seqs) : 0,
            hasMore: opts.hasMore,
          },
        },
      },
    };
  });
}
export function putJobs(rows: JobRow[]): void {
  setState((s) => {
    const byId = { ...s.jobs.byId };
    for (const r of rows) if (!byId[r.id] || r.rev > byId[r.id]!.rev) byId[r.id] = r;
    const byChat: Record<string, string[]> = {};
    for (const j of Object.values(byId)) (byChat[j.chatId] ??= []).push(j.id);
    return { ...s, jobs: { byId, byChat } };
  });
}
export function putCards(rows: CardRow[]): void {
  setState((s) => {
    const byId = { ...s.cards.byId };
    for (const r of rows) if (!byId[r.id] || r.rev > byId[r.id]!.rev) byId[r.id] = r;
    return { ...s, cards: { byId } };
  });
}
/** Builder A's test ids that F6 and the Esc ladder look for; at merge these become `TID.bannerStrip` etc. */
export const A_TID = {
  bannerStrip: 'banner-strip',
  bannerAction: 'banner-action',
  sidebar: 'sidebar',
  chatlistRow: 'chatlist-row',
  composerField: 'composer-field',
} as const;
/** Left-shell search field (03-shell-1 §3.4.3) for the Esc ladder rung "clear the search field". */
export const chatSearch = { hasText: () => false, clear: () => undefined as void };

// ───────────────────────── cards/registry.ts (02-2 §F13.3, X-119) ─────────────────────────

/** Estimated card heights for the virtual list; any type missing: 160. */
export const CARD_ESTIMATE: Record<string, number> = {
  brief: 320,
  checklist: 200,
  choice: 240,
  tiles: 360,
  approval: 260,
  payment: 300,
  bill: 220,
  draft: 300,
  secret: 200,
  signin: 180,
  connect: 180,
  plan: 240,
  routine: 160,
  routine_offer: 160,
  stuck: 220,
  error: 140,
  spend_cap: 160,
  table: 280,
  file: 88,
  link_preview: 120,
  job_link: 64,
  place: 200,
  face_explainer: 200,
  catch_up: 240,
  setup: 320,
};

// ───────────────────────── IPC → src/renderer/ipc/client.ts ─────────────────────────

export class IpcTimeoutError extends Error {}

/** The 08-1 §3.2 channels this builder calls (In → Out); A's `Invokes` map in src/shared/ipc.ts is the real one. */
export interface M1bInvokes {
  'chat:open': {
    req: { chatId: string };
    res: { messages: MessageRow[]; cards: CardRow[]; jobs: JobRow[]; draft: unknown };
  };
  'message:list': { req: { chatId: string; beforeSeq?: number; limit: number }; res: MessageRow[] };
  'chat:pin': { req: { chatId: string; on: boolean }; res: ChatRow };
  'chat:mute': { req: { chatId: string; until: number | 'forever' | null }; res: void };
  'job:watch': { req: { jobId: string; on: boolean }; res: void };
  'job:stop': { req: { jobId: string }; res: unknown };
  'memory:list': { req: { filter: { chip: 'all' }; q?: string }; res: MemoryFactView[] };
  'routine:list': { req: Record<string, never>; res: RoutineRow[] };
  'settings:set': { req: { path: string; value: unknown }; res: unknown };
}
type Channel = keyof M1bInvokes;

interface BridgeLike {
  invoke?: (c: string, p: unknown) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>;
  on?: (e: string, cb: (p: unknown) => void) => () => void;
}
const bridge = (): BridgeLike | undefined => (globalThis as { foo?: BridgeLike }).foo;

/** Test seam for the local harness: replaces the bridge's invoke. */
export const ipcOverride: { invoke?: (c: string, p: unknown) => Promise<unknown> } = {};

export async function invoke<C extends Channel>(channel: C, req: M1bInvokes[C]['req']): Promise<M1bInvokes[C]['res']> {
  if (ipcOverride.invoke) return (await ipcOverride.invoke(channel, req)) as M1bInvokes[C]['res'];
  const b = bridge();
  if (!b?.invoke) throw new Error(`no bridge for ${channel}`);
  const r = await b.invoke(channel, req);
  if (!r.ok) throw r.error;
  return r.value as M1bInvokes[C]['res'];
}

export function useFooEvent<P>(event: string, handler: (p: P) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => bridge()?.on?.(event, (p) => ref.current(p as P)), [event]);
}

// ───────────────────────── a11y → src/renderer/a11y/announce.ts, useReducedMotion.ts ─────────────────────────

export function announce(text: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const el = document.querySelector<HTMLElement>(`[data-announcer="${politeness}"]`);
  if (el) el.textContent = text;
}
export function useReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(q).matches || document.documentElement.dataset.motion === 'off',
  );
}

// ───────────────────────── renderer clock (08-3 §22.2: time comes from a Clock; in FOO_TEST runs, the fake clock) ─────────────────────────

/** Test seam: the harness and E2E runs point this at the fake clock. */
export const rendererClock = { now: () => Date.now() };
/** The current time, re-read every `everyMs` (default one minute) so relative copy stays right. */
export function useNow(everyMs = 60_000): number {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, everyMs);
      return () => clearInterval(id);
    },
    () => Math.floor(rendererClock.now() / everyMs) * everyMs,
  );
}

// ───────────────────────── a11y/useRovingTabIndex.ts (02-3 §F25.3) ─────────────────────────

/** One item tabIndex 0, the rest −1; ↑/↓ move; Home/End jump. Items carry `data-roving-index`; the container takes onKeyDown. */
export function useRovingTabIndex(count: number) {
  const [current, setCurrent] = useState(0);
  const active = Math.min(current, Math.max(0, count - 1));
  const onKeyDown = (e: { key: string; preventDefault(): void; target: EventTarget | null; currentTarget: EventTarget | null }) => {
    if (!(e.target as HTMLElement | null)?.hasAttribute?.('data-roving-index')) return;
    const next =
      e.key === 'ArrowDown' ? active + 1 : e.key === 'ArrowUp' ? active - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(count - 1, next));
    setCurrent(i);
    (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(`[data-roving-index="${i}"]`)?.focus();
  };
  const itemProps = (i: number) => ({ 'data-roving-index': i, tabIndex: i === active ? 0 : -1, onFocus: () => setCurrent(i) });
  return { active, onKeyDown, itemProps };
}

// ───────────────────────── breakpoints → A's shell grid (03-shell-1 §3.1.3) ─────────────────────────

export type Breakpoint = 'L' | 'M' | 'S' | 'XS';
export const breakpointFor = (w: number): Breakpoint => (w >= bp.l ? 'L' : w >= bp.m ? 'M' : w >= bp.s ? 'S' : 'XS');
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(
    (cb) => {
      addEventListener('resize', cb);
      return () => removeEventListener('resize', cb);
    },
    () => breakpointFor(innerWidth),
  );
}

// ───────────────────────── ui primitives → src/renderer/ui/*.tsx (08-0 §E.3, 02-3 §F32.4) ─────────────────────────

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  'data-testid'?: string;
  'data-state'?: string;
  'data-index'?: number;
  'data-row-id'?: string;
};

/** ui/Icon: Fluent System Icons by name (Regular, or Filled with `filled`). Stub draws a simple glyph. */
const PATHS: Record<string, string> = {
  ArrowLeft: 'M10 4 4 10l6 6M4 10h12',
  Search: 'M8.5 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm4 9.5L17 17',
  PanelRight: 'M3 4h14v12H3zM12 4v12',
  MoreHorizontal: 'M5 10h.01M10 10h.01M15 10h.01',
  Window: 'M3 4h14v12H3zM3 7h14',
  EyeOff: 'M3 3l14 14M10 6c4 0 7 4 7 4c0 0-1 1.5-2.7 2.7M7 7.3C4.6 8.6 3 10 3 10c0 0 3 4 7 4c1 0 2-.2 2.8-.6',
  ChevronUp: 'M5 12l5-5 5 5',
  ChevronDown: 'M5 8l5 5 5-5',
  Dismiss: 'M5 5l10 10M15 5 5 15',
  Clock: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 3v4l3 2',
  Warning: 'M10 3 2 17h16L10 3Zm0 5v4m0 2.5v.5',
  CheckmarkCircle: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-3 7 2 2 4-4',
  ErrorCircle: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4v4m0 2.5v.5',
  Stop: 'M5 5h10v10H5z',
  ArrowMaximize: 'M11 3h6v6M17 3l-6 6M9 17H3v-6M3 17l6-6',
  ArrowRepeatAll: 'M4 8a5 5 0 0 1 9-3l2 2M16 12a5 5 0 0 1-9 3l-2-2M15 3v4h-4M5 17v-4h4',
};
export function Icon(props: { name: string; size?: 16 | 20 | 24; filled?: boolean; className?: string }): ReactNode {
  const size = props.size ?? 20;
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 20 20',
      'aria-hidden': true,
      className: props.className,
      fill: props.filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { flex: 'none' },
    },
    createElement('path', { d: PATHS[props.name] ?? 'M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z' }),
  );
}

/** ui/IconButton: `size` xs|sm|md|lg (md = --icon-btn 36), hit area 40×40, label = aria-label, tooltip via title stub. */
export function IconButton(
  props: Btn & { icon: string; label: string; tooltip?: string; size?: 'xs' | 'sm' | 'md' | 'lg'; filled?: boolean; iconSize?: 16 | 20 },
): ReactNode {
  const { icon, label, tooltip, size = 'md', filled, iconSize, className, ...rest } = props;
  return createElement(
    'button',
    {
      type: 'button',
      ...rest,
      'aria-label': label,
      title: tooltip ?? label,
      className: ['m1b-iconbtn', `m1b-iconbtn-${size}`, className].filter(Boolean).join(' '),
    },
    createElement(Icon, { name: icon, size: iconSize ?? (size === 'xs' ? 16 : 20), filled }),
  );
}

/** ui/Button: variant primary|secondary|link|destructive, size md (40) | sm (32). */
export function Button(
  props: Btn & { variant?: 'primary' | 'secondary' | 'link' | 'destructive'; size?: 'md' | 'sm'; icon?: string; children?: ReactNode },
): ReactNode {
  const { variant = 'secondary', size = 'md', icon, children, className, ...rest } = props;
  return createElement(
    'button',
    { type: 'button', ...rest, className: ['m1b-btn', `m1b-btn-${variant}`, `m1b-btn-${size}`, className].filter(Boolean).join(' ') },
    icon ? createElement(Icon, { name: icon, size: 16 }) : null,
    children,
  );
}

/** ui/TextField: `size` sm (36 = --field-h) | md (40); `shape` field | search (--r-full, Search 16 icon, no border). */
export function TextField(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    ref?: Ref<HTMLInputElement>;
    size?: 'sm' | 'md';
    shape?: 'field' | 'search';
    'data-testid'?: string;
  },
): ReactNode {
  const { size = 'md', shape = 'field', className, ...rest } = props;
  return createElement(
    'label',
    { className: ['m1b-field', `m1b-field-${size}`, `m1b-field-${shape}`, className].filter(Boolean).join(' ') },
    shape === 'search' ? createElement(Icon, { name: 'Search', size: 16 }) : null,
    createElement('input', { ...rest, className: 'm1b-field-input' }),
  );
}

/** ui/Avatar: a FaceRef at a size (02-2 §F15.9.9). Stub: letter disc. */
export function Avatar(props: { faceRef: FaceRef; name: string; size: 26 | 40 | 48; color?: string | null }): ReactNode {
  const letter = props.faceRef.startsWith('letter:') ? props.faceRef.slice(7) : (props.name[0] ?? '').toUpperCase();
  return createElement(
    'span',
    {
      'aria-hidden': true,
      className: `m1b-avatar m1b-avatar-${props.size}`,
      style: props.color ? { background: `var(${props.color})` } : undefined,
    },
    letter,
  );
}

/** ui/Spinner: F7 ring, `size` 16|20|24; reduced motion shows the static "◔" (02-3 §F25.4). */
export function Spinner(props: { size: 16 | 20 | 24; label?: string }): ReactNode {
  return createElement('span', {
    className: `m1b-spinner m1b-spinner-${props.size}`,
    role: props.label ? 'progressbar' : undefined,
    'aria-label': props.label,
    'aria-hidden': props.label ? undefined : true,
  });
}

/** ui/Skeleton: a --bg-sunken block. */
export function Skeleton(props: { className?: string }): ReactNode {
  return createElement('span', { className: ['m1b-skeleton', props.className].filter(Boolean).join(' '), 'aria-hidden': true });
}

/** ui/Segmented (06 §0.4): radiogroup of options; 32 visual / 40 hit. */
export function Segmented<V extends string>(props: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  'data-testid'?: string;
}): ReactNode {
  const onKey = useCallback(
    (e: { key: string; preventDefault(): void }) => {
      const i = props.options.findIndex((o) => o.value === props.value);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      props.onChange(props.options[(i + d + props.options.length) % props.options.length]!.value);
    },
    [props],
  );
  return createElement(
    'div',
    { role: 'radiogroup', 'aria-label': props.label, className: 'm1b-segmented', 'data-testid': props['data-testid'], 'data-state': props.value, onKeyDown: onKey },
    props.options.map((o) =>
      createElement(
        'button',
        {
          key: o.value,
          type: 'button',
          role: 'radio',
          'aria-checked': o.value === props.value,
          tabIndex: o.value === props.value ? 0 : -1,
          className: 'm1b-segmented-option',
          onClick: () => props.onChange(o.value),
        },
        o.label,
      ),
    ),
  );
}

/** ui/Meter: `role="meter"` bar, 4px (--meter-h), tone accent|warn|bad. */
export function Meter(props: { value: number; max: number; tone: 'accent' | 'warn' | 'bad' }): ReactNode {
  const pct = props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0;
  return createElement(
    'span',
    { className: 'm1b-meter', 'aria-hidden': true, 'data-state': props.tone },
    createElement('span', { className: 'm1b-meter-fill', style: { width: `${pct}%` } }),
  );
}

/** ui/Menu (style 03-shell-1 §3.4.2; items min-height 40). Stub: a popup list of menuitems; Esc closes and stops the event. */
export interface MenuItem {
  key: string;
  label: string;
  testid?: string;
  separatorBefore?: boolean;
  onSelect?: () => void;
  submenu?: MenuItem[];
}
export function Menu(props: { open: boolean; label: string; items: MenuItem[]; onClose: () => void; anchorRight?: boolean }): ReactNode {
  // A stable callback ref: focuses the first item once, when the menu mounts.
  const ref = useCallback((el: HTMLDivElement | null) => el?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), []);
  if (!props.open) return null;
  const flat = props.items.flatMap((i) => (i.submenu ? [i, ...i.submenu.map((s) => ({ ...s, key: `${i.key}.${s.key}`, sub: true }))] : [i]));
  return createElement(
    'div',
    {
      ref,
      role: 'menu',
      'aria-label': props.label,
      className: 'm1b-menu',
      onKeyDown: (e: KeyboardEvent & { stopPropagation(): void; preventDefault(): void; key: string; currentTarget: EventTarget }) => {
        const items = Array.from((e.currentTarget as unknown as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'));
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'Escape') {
          e.stopPropagation();
          props.onClose();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
      },
    },
    flat.map((i) => [
      i.separatorBefore ? createElement('div', { key: `${i.key}-sep`, role: 'separator', className: 'm1b-menu-sep' }) : null,
      createElement(
        'button',
        {
          key: i.key,
          type: 'button',
          role: 'menuitem',
          tabIndex: -1,
          'data-testid': i.testid,
          'aria-haspopup': i.submenu ? 'menu' : undefined,
          className: (i as { sub?: boolean }).sub ? 'm1b-menu-item m1b-menu-sub' : 'm1b-menu-item',
          onClick: () => {
            if (i.submenu) return;
            i.onSelect?.();
            props.onClose();
          },
        },
        i.label,
      ),
    ]),
  );
}
