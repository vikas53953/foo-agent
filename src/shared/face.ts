// Spec: 02-2 §F15.9.3 (the 18 moods in order, priority, one-time durations, the 10 s repeat guard §F15.9.3c), §F15.9.9
// (`Mood` lives here; face raster sizes), 08-1 §3.3.1 (`face:raster` sizes 16 | 20 | 24 | 32 | 48).
import type { Mood } from './types';

export type { Mood };

/** The 18 rows of §F15.9.3, in order. */
export const MOODS = [
  'resting',
  'waking',
  'noticed',
  'listening',
  'thinking',
  'working',
  'stuck',
  'needs_you',
  'waiting',
  'happy',
  'celebrating',
  'thumbs_up',
  'heart',
  'speaking',
  'sorry',
  'stopped',
  'offline',
  'asleep',
] as const satisfies readonly Mood[];

/** §F15.9.3 priority when several are true (one-time moods and Speaking play on top). */
export const MOOD_PRIORITY = [
  'offline',
  'needs_you',
  'stuck',
  'working',
  'waiting',
  'thinking',
  'listening',
  'asleep',
  'resting',
] as const satisfies readonly Mood[];

/** One-time moods and how long each plays (§F15.9.3 Duration column, §F15.9.2 tokens). */
export const ONE_TIME_MS = {
  waking: 600,
  noticed: 400,
  happy: 2000,
  celebrating: 1600,
  thumbs_up: 900,
  heart: 900,
  sorry: 3000,
  stopped: 1500,
} as const satisfies Partial<Record<Mood, number>>;
export type OneTimeMood = keyof typeof ONE_TIME_MS;

export const isOneTime = (m: Mood): m is OneTimeMood => m in ONE_TIME_MS;

/** §F15.9.3c: no one-time mood repeats within 10 s. */
export const REPEAT_GUARD_MS = 10_000;
/** §F15.9.9: `live.faceQueue[chatId]` holds at most 3 entries; a 4th drops the oldest. */
export const FACE_QUEUE_MAX = 3;
/** §F15.9.3 #4: Listening lasts while typing + 5 s. */
export const LISTEN_MS = 5000;

/** 08-1 §3.3.1: the sizes `<FaceRaster>` draws (48 for toasts with the ring, 16–32 for the tray without). */
export const RASTER_SIZES = [16, 20, 24, 32, 48] as const;
export type RasterSize = (typeof RASTER_SIZES)[number];
/** §F15.9.9: the sizes a living face is drawn at (the §F15.4 ladder, plus 16 for the tray raster). */
export type FaceSize = 16 | 20 | 24 | 26 | 32 | 40 | 48 | 72 | 96;
