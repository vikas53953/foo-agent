// Spec: 08-0 §G.10 `live` slice (D-11: faceQueue, cardSeenAt, connection, typingChatId, replyInFlight, speaking,
// lastKeystrokeAt, windowFocused; selectChatMood), 08-5 §3.1 (AiStatus), 03-shell-1 §3.3.2 (offline and AI banners),
// §3.4.9 ("Mark as unread" dot). `now` is the renderer's clock, offset to main's injected clock at start.
import type { AiStatus, Mood } from '../../shared/types';
import { effectivePill } from '../chatlist/rules';
import type { RootState } from './index';

export interface LiveState {
  faceQueue: Record<string, { mood: Mood; until: number }[]>;
  celebratedOn?: string;
  cardSeenAt: Record<string, number>;
  connection: 'online' | 'offline' | 'ai_down';
  typingChatId?: string;
  replyInFlight: Record<string, boolean>;
  speaking: Record<string, boolean>;
  lastKeystrokeAt: number | null;
  windowFocused: boolean;
  /** The AI status main last sent (Bootstrap.ai, then ai:status). */
  ai: AiStatus | null;
  /** Windows lets foo show toasts (notifications:status). */
  notificationsAllowed: boolean;
  /** An update finished downloading (09 §9.20; nothing sets it before the updater milestone). */
  updateReady: boolean;
  /** Ticks every 30 s and on focus (row times, the 24 h "Done" fade). */
  now: number;
  /** "Mark as unread" with no count (03-shell-1 §3.4.9; there is no invoke for it in M1, so it lasts for the session). */
  markedUnread: Record<string, true>;
  /** Bootstrap is in; the list shows skeleton rows before. */
  loaded: boolean;
  loadFailed: boolean;
}

export function initialLive(now: number): LiveState {
  return {
    faceQueue: {},
    cardSeenAt: {},
    connection: 'online',
    replyInFlight: {},
    speaking: {},
    lastKeystrokeAt: null,
    windowFocused: true,
    ai: null,
    notificationsAllowed: true,
    updateReady: false,
    now,
    markedUnread: {},
    loaded: false,
    loadFailed: false,
  };
}

export const selectNow = (s: RootState) => s.live.now;
export const selectAi = (s: RootState) => s.live.ai;
export const selectConnection = (s: RootState) => s.live.connection;
export const selectTypingChatId = (s: RootState) => s.live.typingChatId;
export const selectWindowFocused = (s: RootState) => s.live.windowFocused;
export const selectMarkedUnread = (chatId: string) => (s: RootState) => s.live.markedUnread[chatId] === true;
export const selectLoaded = (s: RootState) => s.live.loaded;
export const selectLoadFailed = (s: RootState) => s.live.loadFailed;

/** The face mood for a chat (02-2 §F15.9.3), from its real state: queued one-shot first, then the pill. */
export const selectChatMood =
  (chatId: string) =>
  (s: RootState): Mood => {
    const queued = s.live.faceQueue[chatId]?.find((q) => q.until > s.live.now);
    if (queued) return queued.mood;
    if (s.live.typingChatId === chatId) return 'thinking';
    const row = s.chats.byId[chatId];
    if (!row) return 'resting';
    switch (effectivePill(row, s.live.now)) {
      case 'needs_you':
        return 'needs_you';
      case 'working':
        return 'working';
      case 'paused':
        return 'waiting';
      default:
        return 'resting';
    }
  };
