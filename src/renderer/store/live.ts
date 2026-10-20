// Spec: 08-0 §G.10 `live` slice (D-11: faceQueue, cardSeenAt, connection, typingChatId, replyInFlight, speaking,
// lastKeystrokeAt, windowFocused; selectChatMood), 08-5 §3.1 (AiStatus), 03-shell-1 §3.3.2 (offline and AI banners),
// §3.4.9 ("Mark as unread" dot). `now` is the renderer's clock, offset to main's injected clock at start.
// The face: 02-2 §F15.9.3 (moods from real state only, priority order, one-time moods on top, #11 once a day), §F15.9.3c
// (10 s repeat guard), §F15.9.9 (`selectChatMood`, `playOnce`, `faceQueue` max 3). Quiet hours read
// `settings.notifications.quiet` directly until M7 exposes `quietHours.isQuiet` (M11 ticket map, LF stub).
import { FACE_QUEUE_MAX, LISTEN_MS, MOOD_PRIORITY, ONE_TIME_MS, REPEAT_GUARD_MS, type OneTimeMood } from '../../shared/face';
import type { AiStatus, CardRow, JobRow, MessageRow, Mood } from '../../shared/types';
import { effectivePill } from '../chatlist/rules';
import { quietUntil } from '../shell/statusLine';
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

/** What a chat's face can know (§F15.9.3a: job runner, card store, connection monitor, composer, clock; never AI text). */
export interface MoodInput {
  connection: LiveState['connection'];
  /** This chat's jobs, or null when none are loaded yet (the chat row's pill stands in for them). */
  jobs: JobRow[] | null;
  pill: ReturnType<typeof effectivePill>;
  cards: Record<string, CardRow | undefined>;
  cardSeenAt: Record<string, number>;
  replyInFlight: boolean;
  /** The open chat's composer had a keystroke at this time. */
  keystrokeAt: number | null;
  quiet: boolean;
  now: number;
}

const LIVE_JOB: JobRow['state'][] = ['queued', 'working', 'needs_you', 'waiting'];

/** The state-held mood (§F15.9.3 priority: Offline → Needs you → Stuck → Working → Waiting on you → Thinking → Listening → Asleep → Resting). */
export function chatMood(i: MoodInput): Mood {
  const on = new Set<Mood>();
  if (i.connection !== 'online') on.add('offline');
  if (i.jobs) {
    for (const j of i.jobs) {
      if (j.state === 'working') on.add('working');
      if (j.state !== 'needs_you') continue;
      const card = j.needsYouCardId ? i.cards[j.needsYouCardId] : undefined;
      const seen = j.needsYouCardId != null && i.cardSeenAt[j.needsYouCardId] != null;
      if (!seen) on.add('needs_you');
      else if (card?.type === 'stuck' || j.slow) on.add('stuck');
      else on.add('waiting');
    }
  } else if (i.pill === 'needs_you') on.add('needs_you');
  else if (i.pill === 'working') on.add('working');
  if (i.replyInFlight) on.add('thinking');
  if (i.keystrokeAt != null && i.now - i.keystrokeAt < LISTEN_MS) on.add('listening');
  const busy = i.jobs
    ? i.jobs.some((j) => LIVE_JOB.includes(j.state))
    : i.pill === 'needs_you' || i.pill === 'working' || i.pill === 'paused';
  if (i.quiet && !busy) on.add('asleep');
  return MOOD_PRIORITY.find((m) => on.has(m)) ?? 'resting';
}

const NO_JOBS: JobRow[] = [];

function moodInput(s: RootState, chatId: string): MoodInput {
  const row = s.chats.byId[chatId];
  const ids = s.jobs.byChat[chatId];
  const settings = s.settings.value;
  const quiet = settings ? quietUntil(settings.notifications.quiet, s.live.now, settings.locale.timeZone) != null : false;
  return {
    connection: s.live.connection,
    jobs: ids ? ids.map((id) => s.jobs.byId[id]).filter((j): j is JobRow => j != null) : row ? null : NO_JOBS,
    pill: row ? effectivePill(row, s.live.now) : null,
    cards: s.cards.byId,
    cardSeenAt: s.live.cardSeenAt,
    replyInFlight: s.live.replyInFlight[chatId] === true || s.live.typingChatId === chatId,
    keystrokeAt: s.chats.selectedId === chatId ? s.live.lastKeystrokeAt : null,
    quiet,
    now: s.live.now,
  };
}

/** The face mood for a chat (02-2 §F15.9.9): the head of its one-time queue, then Speaking, then what is true. */
export const selectChatMood =
  (chatId: string) =>
  (s: RootState): Mood => {
    const queued = s.live.faceQueue[chatId]?.find((q) => q.until > s.live.now);
    if (queued) return queued.mood;
    if (s.live.speaking[chatId]) return 'speaking';
    return chatMood(moodInput(s, chatId));
  };

const lastPlayed = new Map<string, number>();

/** For tests: forget the 10 s repeat guard. */
export function resetFaceGuard(): void {
  lastPlayed.clear();
}

/**
 * §F15.9.9 `playOnce`: queues a one-time mood for a chat (max 3, a 4th drops the oldest). §F15.9.3c: the same mood does not
 * repeat within 10 s. Each entry plays after the one before it.
 */
export function playOnceReducer(live: LiveState, chatId: string, mood: OneTimeMood, now: number): boolean {
  const key = `${chatId}|${mood}`;
  const last = lastPlayed.get(key);
  if (last != null && now - last < REPEAT_GUARD_MS) return false;
  lastPlayed.set(key, now);
  const q = (live.faceQueue[chatId] ?? []).filter((e) => e.until > now);
  const start = q.length ? q[q.length - 1]!.until : now;
  q.push({ mood, until: start + ONE_TIME_MS[mood] });
  while (q.length > FACE_QUEUE_MAX) q.shift();
  live.faceQueue[chatId] = q;
  return true;
}

/** The local calendar day, 'YYYY-MM-DD' (`live.celebratedOn`, §F15.9.3 #11). */
export function localDay(now: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const APPROVED_KINDS: CardRow['type'][] = ['approval', 'payment', 'draft'];

/**
 * The job store's calls into `playOnce` (§F15.9.9): DONE with proof → Happy, or Celebrating for the day's first DONE after
 * an approved book / buy / pay / send / post card (#11; never in groups or quiet hours); FAILED → Sorry; CANCELLED → Stopped.
 */
export function noteJobForFace(s: RootState, prev: JobRow['state'] | undefined, row: JobRow, now: number): void {
  if (!prev || prev === row.state) return;
  const chat = s.chats.byId[row.chatId];
  if (chat?.kind === 'group') return;
  if (row.state === 'failed') playOnceReducer(s.live, row.chatId, 'sorry', now);
  else if (row.state === 'cancelled') playOnceReducer(s.live, row.chatId, 'stopped', now);
  else if (row.state === 'done' && row.proof != null) {
    const settings = s.settings.value;
    const tz = settings?.locale.timeZone ?? 'Asia/Kolkata';
    const quiet = settings ? quietUntil(settings.notifications.quiet, now, tz) != null : false;
    const today = localDay(now, tz);
    const approved = Object.values(s.cards.byId).some(
      (c) => c.jobId === row.id && APPROVED_KINDS.includes(c.type) && c.state.toLowerCase() === 'completed',
    );
    if (approved && !quiet && s.live.celebratedOn !== today) {
      if (playOnceReducer(s.live, row.chatId, 'celebrating', now)) s.live.celebratedOn = today;
    } else playOnceReducer(s.live, row.chatId, 'happy', now);
  }
}

/** The message store's and reaction handler's calls (§F15.9.9): 👀 → Noticed; foo's or a helper's 👍 / ❤️ → Thumbs up / Heart. */
export function noteMessageForFace(s: RootState, prev: MessageRow['reactions'] | undefined, row: MessageRow, now: number): void {
  if (!prev || row.authorKind !== 'user' || s.chats.byId[row.chatId]?.kind === 'group') return;
  const had = new Set(prev.filter((r) => r.by !== 'me').map((r) => r.emoji));
  for (const r of row.reactions) {
    if (r.by === 'me' || had.has(r.emoji)) continue;
    if (r.emoji === '👍') playOnceReducer(s.live, row.chatId, 'thumbs_up', now);
    else if (r.emoji === '❤️') playOnceReducer(s.live, row.chatId, 'heart', now);
  }
}

/** When the next face change is due (a queued mood ends, Listening runs out), so the clock ticks then. */
export function nextFaceDue(s: RootState): number | null {
  let due: number | null = null;
  const now = s.live.now;
  const take = (t: number) => {
    if (t > now && (due == null || t < due)) due = t;
  };
  for (const q of Object.values(s.live.faceQueue)) for (const e of q) take(e.until);
  if (s.live.lastKeystrokeAt != null) take(s.live.lastKeystrokeAt + LISTEN_MS);
  return due;
}
