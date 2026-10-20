// Spec: 02 §F7.1 "Chat" (CR-0021, X-179: one-shot details such as the new-message rise, ticks drawing in, the picked
// reaction's bounce and the error shake play once per message), 04 §1.5 (rows that load from history, scroll-back or chat
// open, appear without motion). The virtual list unmounts rows that leave the view and mounts them again on the way back,
// so "played" is kept per key for the session, outside the rows.
import { useEffect, useState } from 'react';

/** When each key started playing (performance.now()). */
const played = new Map<string, number>();

/**
 * Whether a one-shot detail should play now. `on` is the condition the detail marks (the row is new, the tick is read, the
 * bubble failed); `fresh` says the condition already holding when the element mounted counts (a new row), otherwise only a
 * change while mounted does (the tick turning read in view). A key plays at most once per session.
 */
export function shouldPlay(seen: { has(key: string): boolean }, key: string, on: boolean, fresh: boolean, onAtMount: boolean): boolean {
  return on && !seen.has(key) && (fresh || !onAtMount);
}

/** How long ago `key` started playing; Infinity when it never did. */
export function sinceStart(key: string): number {
  const at = played.get(key);
  return at === undefined ? Infinity : performance.now() - at;
}

/**
 * True for the life of this mount once the detail starts, so the CSS animation is not cut off by a later render. With
 * `carryMs`, an element that mounts again while its detail is still playing (a row re-keyed when main stores it) carries on
 * playing; the caller offsets it by `sinceStart(key)`.
 */
export function useOneShot(key: string, on: boolean, fresh = false, carryMs = 0): boolean {
  const [onAtMount] = useState(on);
  const [latched, setLatched] = useState(false);
  const carry = on && fresh && sinceStart(key) < carryMs;
  const play = !latched && (carry || shouldPlay(played, key, on, fresh, onAtMount));
  // Adjusted while rendering when the detail starts (React's "storing information from previous renders" pattern).
  if (play) setLatched(true);
  useEffect(() => {
    if (on && !played.has(key)) played.set(key, performance.now());
  }, [on, key]);
  return latched || play;
}
