// Spec: 04 §10.3 (40 waveform bars 4–24 high; the user's transcript is written within 3 s, with none after a minute it
// failed and the player still plays), §18 (speed chip 1× → 1.5× → 2× → 1×). Pure.
import type { MessageRow } from '../../shared/types';

export const BARS = 40;
export const SPEEDS = [1, 1.5, 2] as const;

// GAP: GAPS.md 2026-10-17 "voice loudness is not stored"
/**
 * 40 bar heights (4–24) for the waveform. The loudness is not stored on the message row (GAPS.md), so the
 * shape is derived from the message id: stable for a note, never a claim about its sound.
 */
export function waveform(seed: string, bars = BARS): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: bars }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2246822519) >>> 0;
    return 4 + (h % 21);
  });
}

export const nextSpeed = (s: number) => SPEEDS[(SPEEDS.indexOf(s as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!;

/** §10.3: the user's transcript is written within 3 s; with none after a minute it failed (the player still plays). */
export const TRANSCRIPT_WAIT_MS = 60_000;
export function voiceTextState(
  m: Pick<MessageRow, 'transcript' | 'text' | 'createdAt'>,
  side: 'me' | 'them',
  now: number,
): 'ready' | 'working' | 'failed' {
  if (side === 'them' || m.transcript) return 'ready';
  return now - m.createdAt < TRANSCRIPT_WAIT_MS ? 'working' : 'failed';
}
