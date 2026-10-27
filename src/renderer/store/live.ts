// Spec: 08-0 §G.10 `live` slice (D-11: faceQueue, cardSeenAt, connection, typingChatId, replyInFlight, speaking,
// lastKeystrokeAt, windowFocused; selectChatMood), 08-5 §3.1 (AiStatus), 03-shell-1 §3.3.2 (offline and AI banners),
// §3.4.9 ("Mark as unread" dot). `now` is the renderer's clock, offset to main's injected clock at start.
// The face: 02-2 §F15.9.3 (moods from real state only, priority order, one-time moods on top, #11 once a day), §F15.9.3c
// (10 s repeat guard), §F15.9.9 (`selectChatMood`, `playOnce`, `faceQueue` max 3). Quiet hours read
// `settings.notifications.quiet` through `quietHours()` (only while `notify` is on, CR-0063) until M7 exposes
// `quietHours.isQuiet` (M11 ticket map, LF stub).
import { FACE_QUEUE_MAX, isOneTime, LISTEN_MS, MOOD_PRIORITY, ONE_TIME_MS, REPEAT_GUARD_MS, type OneTimeMood } from '../../shared/face';
import type { FeatureId } from '../../shared/features';
import type { Settings } from '../../shared/settings';
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
  /** The face's own tick (a one-time mood or Listening ending), so it re-renders the faces only, not every row time. */
  faceTick: number;
  /** "Mark as unread" with no count (03-shell-1 §3.4.9; there is no invoke for it in M1, so it lasts for the session). */
  markedUnread: Record<string, true>;
  /** Bootstrap is in; the list shows skeleton rows before. */
  loaded: boolean;
  loadFailed: boolean;
  /** CR-0054: the switched-on features (Bootstrap.features); null = every feature (no list sent). */
  features: FeatureId[] | null;
  /** CR-0060: the app version for Settings → About. */
  appVersion: string | null;
  /** CR-0061 (X-44): an unsigned tester build. */
  testerBuild: boolean;
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
    faceTick: 0,
    markedUnread: {},
    loaded: false,
    loadFailed: false,
    features: null,
    appVersion: null,
    testerBuild: false,
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
/** CR-0054: true when this build switched the feature on (every feature until the bootstrap says otherwise). */
export const selectFeatureOn = (id: FeatureId) => (s: RootState) => s.live.features === null || s.live.features.includes(id);

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

let quietMemo: { quiet: unknown; tz: string; now: number; on: boolean } | null = null;

/**
 * CR-0063 (X-220 item 1): quiet hours belong to `notify` (CR-0054). While it is off nothing is held for them and they cannot
 * be changed, so foo is never asleep and no "Quiet until" shows; null then.
 */
export function quietHours(s: RootState): Settings['notifications']['quiet'] | null {
  const settings = s.settings.value;
  return settings && selectFeatureOn('notify')(s) ? settings.notifications.quiet : null;
}

/** Quiet hours are on now (`settings.notifications.quiet`, the renderer clock). Computed once per clock tick, not per row. */
export function isQuietNow(s: RootState): boolean {
  const settings = s.settings.value;
  const quiet = quietHours(s);
  if (!settings || !quiet) return false;
  const tz = settings.locale.timeZone;
  const now = s.live.now;
  if (quietMemo && quietMemo.quiet === quiet && quietMemo.tz === tz && quietMemo.now === now) return quietMemo.on;
  const on = quietUntil(quiet, now, tz) != null;
  quietMemo = { quiet, tz, now, on };
  return on;
}

/** The face's clock: the later of the app's tick and the face's own. */
const faceNow = (s: RootState) => Math.max(s.live.now, s.live.faceTick);

function moodInput(s: RootState, chatId: string): MoodInput {
  const row = s.chats.byId[chatId];
  const ids = s.jobs.byChat[chatId];
  const quiet = isQuietNow(s);
  return {
    connection: s.live.connection,
    jobs: ids ? ids.map((id) => s.jobs.byId[id]).filter((j): j is JobRow => j != null) : row ? null : NO_JOBS,
    pill: row ? effectivePill(row, s.live.now) : null,
    cards: s.cards.byId,
    cardSeenAt: s.live.cardSeenAt,
    replyInFlight: s.live.replyInFlight[chatId] === true || s.live.typingChatId === chatId,
    keystrokeAt: s.chats.selectedId === chatId ? s.live.lastKeystrokeAt : null,
    quiet,
    now: faceNow(s),
  };
}

/** The face mood for a chat (02-2 §F15.9.9): the head of its one-time queue, then Speaking, then what is true. */
export const selectChatMood =
  (chatId: string) =>
  (s: RootState): Mood => {
    const queued = s.live.faceQueue[chatId]?.find((q) => q.until > faceNow(s));
    if (queued) return queued.mood;
    if (s.live.speaking[chatId]) return 'speaking';
    return chatMood(moodInput(s, chatId));
  };

/**
 * When the one-time `mood` now playing began (the latest, if several chats play it), so a face that mounts part-way through
 * it (the header on opening a chat, a row scrolled in) joins it there instead of starting over and being cut off.
 */
export const selectOnceStart =
  (mood: Mood) =>
  (s: RootState): number | undefined => {
    if (!isOneTime(mood)) return undefined;
    let start: number | undefined;
    for (const q of Object.values(s.live.faceQueue)) {
      const head = q.find((e) => e.until > faceNow(s));
      if (head?.mood !== mood) continue;
      const t = head.until - ONE_TIME_MS[mood];
      if (start == null || t > start) start = t;
    }
    return start;
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
    const hours = quietHours(s);
    const quiet = hours ? quietUntil(hours, now, tz) != null : false;
    const today = localDay(now, tz);
    const approved = Object.values(s.cards.byId).some(
      (c) => c.jobId === row.id && APPROVED_KINDS.includes(c.type) && c.state.toLowerCase() === 'completed',
    );
    if (approved && !quiet && s.live.celebratedOn !== today) {
      if (playOnceReducer(s.live, row.chatId, 'celebrating', now)) s.live.celebratedOn = today;
    } else playOnceReducer(s.live, row.chatId, 'happy', now);
  }
}

/**
 * §F15.9.3 #2 Waking up: on shell first paint, when the offline line clears and when quiet hours end, every foo and helper
 * chat (never a group, §F15.9.3d) plays the eyes opening once. Only a living face has eyes to open: a letter, glyph or
 * picture face shows nothing for it (§F15.9.4), so those chats are skipped and their rows do not re-render twice.
 */
export function wakeReducer(s: RootState, now: number): void {
  for (const id of s.chats.order) {
    const c = s.chats.byId[id];
    if (c && (c.kind === 'foo' || c.kind === 'helper') && c.face.startsWith('living:')) playOnceReducer(s.live, id, 'waking', now);
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
  const now = faceNow(s);
  const take = (t: number) => {
    if (t > now && (due == null || t < due)) due = t;
  };
  for (const q of Object.values(s.live.faceQueue)) for (const e of q) take(e.until);
  if (s.live.lastKeystrokeAt != null) take(s.live.lastKeystrokeAt + LISTEN_MS);
  return due;
}
