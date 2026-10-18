// Spec: 08-5 §5 rule 1 (events from src/shared/ipc.ts are applied by exactly one reducer per channel, here), rule 2 (rev),
// 08-1 §3.2 app:getBootstrap, §3.3 events, 03-shell-2 §3.9.6 (deep links arrive as `navigate`), 03-shell-1 §3.1.2 step 3
// (open lastChatId, else foo's chat). Main's clock leads: the renderer clock keeps main's offset (08-3 §22.2).
import type { Bootstrap } from '../../shared/types';
import type { EventChannel, EventPayload } from '../../shared/ipc';
import { invoke, onFooEvent, platform } from '../ipc/client';
import { loadChatsReducer, removeChatReducer, upsertChatReducer } from './chats';
import { upsertCardReducer } from './cards';
import { upsertConnectionReducer } from './connections';
import { loadHelpersReducer } from './helpers';
import { navigate, update, type RootState } from './index';
import { upsertJobReducer } from './jobs';
import { updateSpendReducer } from './spend';
import { applyDeltaReducer, loadMessagesReducer, resyncMessage, setBadgeReducer, upsertMessageReducer } from './messages';

export const FIRST_PAGE = 50;
export const NOW_TICK_MS = 30_000;

let clockOffset = 0;

/** The renderer's "now": the browser clock moved by main's offset at start (main runs the injected Clock). */
export function clockNow(): number {
  return Date.now() + clockOffset;
}

export function syncClock(mainNow: number | undefined): void {
  if (typeof mainNow === 'number') clockOffset = mainNow - Date.now();
}

type Reducers = { [E in EventChannel]: (s: RootState, p: EventPayload[E]) => void };

/** One reducer per event channel (08-5 §5 rule 1). */
export const REDUCERS: Reducers = {
  'chat:upsert': (s, row) => upsertChatReducer(s.chats, row),
  'chat:removed': (s, { chatId }) => removeChatReducer(s.chats, chatId),
  'chat:typing': (s, { chatId, on }) => {
    if (on) s.live.typingChatId = chatId;
    else if (s.live.typingChatId === chatId) delete s.live.typingChatId;
  },
  'message:upsert': (s, row) => upsertMessageReducer(s.messages, row),
  // 08-5 §5 rule 4 (X-117): a seq gap fetches the whole row with message:get.
  'message:delta': (s, d) => {
    if (!applyDeltaReducer(s.messages, d)) queueMicrotask(() => void resyncMessage(d.messageId));
  },
  'message:badge': (s, d) => setBadgeReducer(s.messages, d),
  'card:upsert': (s, row) => upsertCardReducer(s.cards, row),
  'job:upsert': (s, row) => upsertJobReducer(s.jobs, row),
  'ai:status': (s, ai) => {
    s.live.ai = ai;
    s.live.connection = ai.state === 'offline' ? 'offline' : ai.state === 'down' ? 'ai_down' : 'online';
  },
  'spend:update': (s, summary) => updateSpendReducer(s.spend, summary),
  'connection:upsert': (s, row) => upsertConnectionReducer(s.connections, row),
  'settings:changed': (s, value) => {
    s.settings.value = value;
  },
  'net:state': (s, { online }) => {
    s.live.connection = online ? (s.live.ai?.state === 'down' ? 'ai_down' : 'online') : 'offline';
  },
  // Detect rows feed the setup screen (M12); nothing in M3's shell shows them yet.
  'ai:detectRow': () => undefined,
  // `navigate` is handled by wireEvents (it is an action, not a row patch).
  navigate: () => undefined,
  // M11 (CR-0015): the About states and banner type 7 (T5) and the C-18 / quit dialogs (T4) read these; no-op until then.
  'update:status': () => undefined,
  'app:closeAsk': () => undefined,
};

export function applyEvent<E extends EventChannel>(event: E, payload: EventPayload[E]): void {
  update((s) => REDUCERS[event](s, payload));
}

/** Fills every slice from app:getBootstrap and opens the start chat. */
export function applyBootstrap(b: Bootstrap): void {
  update((s) => {
    s.settings.value = b.settings;
    loadChatsReducer(s.chats, b.chats);
    s.live.ai = b.ai;
    s.live.connection = b.ai.state === 'offline' ? 'offline' : b.ai.state === 'down' ? 'ai_down' : 'online';
    s.spend.summary = b.spend;
    s.connections.rows = b.connections;
    if (b.openChatId) loadMessagesReducer(s.messages, b.openChatId, b.firstMessages, FIRST_PAGE);
    s.live.loaded = true;
    s.live.loadFailed = false;
    s.live.now = clockNow();
  });
  if (b.openChatId) openFromEvent({ kind: 'chat', chatId: b.openChatId });
}

/** Loads the bootstrap; on failure the list shows its load_failed state with "Try again". */
export async function loadBootstrap(): Promise<void> {
  try {
    const r = await invoke('app:getBootstrap', {});
    if (!r.ok) throw new Error(r.error.kind);
    applyBootstrap(r.value);
    void loadHelpers();
  } catch (e) {
    console.error('bootstrap', e);
    update((s) => {
      s.live.loadFailed = true;
      s.live.loaded = true;
    });
  }
}

/** helper:list → the helpers slice (names and job lines for the header and right shell). A failure leaves it empty. */
export async function loadHelpers(): Promise<void> {
  try {
    const r = await invoke('helper:list', {});
    if (r.ok) update((s) => loadHelpersReducer(s.helpers, r.value));
  } catch (e) {
    console.warn('helper:list', e);
  }
}

const inFlight = new Map<string, Promise<void>>();
const opened = new Set<string>();

/** chat:open (08-1 §3.2): the newest 50 messages, their cards and the chat's jobs, once per chat unless `force`. */
export function loadChat(chatId: string, force = false): Promise<void> {
  if (!force && opened.has(chatId)) return Promise.resolve();
  const running = inFlight.get(chatId);
  if (running) return running;
  const p = (async () => {
    try {
      const r = await invoke('chat:open', { chatId });
      if (!r.ok) throw new Error(r.error.kind);
      opened.add(chatId);
      update((s) => {
        loadMessagesReducer(s.messages, chatId, r.value.messages, FIRST_PAGE);
        if (r.value.waMessages) s.messages.wa[chatId] = r.value.waMessages;
        s.messages.drafts[chatId] = r.value.draft;
        for (const c of r.value.cards) upsertCardReducer(s.cards, c);
        for (const j of r.value.jobs) upsertJobReducer(s.jobs, j);
      });
    } finally {
      inFlight.delete(chatId);
    }
  })();
  inFlight.set(chatId, p);
  return p;
}

function openFromEvent(view: Parameters<typeof navigate>[0]): void {
  navigate(view);
  if (view.kind === 'chat') loadChat(view.chatId).catch((e: unknown) => console.warn('chat:open', view.chatId, e));
}

/** Subscribes every event channel once. Returns the unsubscribe function. */
export function wireEvents(): () => void {
  const offs = (Object.keys(REDUCERS) as EventChannel[])
    .filter((e) => e !== 'navigate')
    .map((e) => onFooEvent(e, (p) => applyEvent(e, p as never)));
  offs.push(onFooEvent('navigate', ({ view }) => openFromEvent(view)));
  return () => offs.forEach((off) => off());
}

/** Keeps live.now and live.windowFocused current. Returns the stop function. */
export function startClock(): () => void {
  syncClock(platform().now);
  const tick = () =>
    update((s) => {
      s.live.now = clockNow();
    });
  tick();
  const timer = setInterval(tick, NOW_TICK_MS);
  const onFocus = () =>
    update((s) => {
      s.live.windowFocused = true;
      s.live.now = clockNow();
    });
  const onBlur = () =>
    update((s) => {
      s.live.windowFocused = false;
    });
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  return () => {
    clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
  };
}
