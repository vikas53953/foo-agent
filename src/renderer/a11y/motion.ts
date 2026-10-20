// Spec: 02 §F7 X-150 (Animations "Full" / "Basic" / "Off" applied as `<html data-motion>`; Windows "Animation effects" off
// forces "Off" and turning it back on restores the stored value, live, FE-31), FE-24 (reduced motion is applied in one
// place: components key on `:root[data-motion='off']`, never on their own media query), CR-0021 pick 3.
import type { PlatformInfo } from '../../shared/ipc';

type AnimationLevel = PlatformInfo['animations'];

const QUERY = '(prefers-reduced-motion: reduce)';
let level: AnimationLevel = 'full';

function apply(): void {
  document.documentElement.dataset.motion = matchMedia(QUERY).matches ? 'off' : level;
}

/** Sets `data-motion` from the stored level and keeps it in step with the Windows setting. Call once per window. */
export function watchMotion(initial: AnimationLevel | undefined): void {
  level = initial ?? 'full';
  apply();
  matchMedia(QUERY).addEventListener('change', apply);
}

/** The Appearance page's Animations row: applies a new stored level at once (06-2 §6.2). */
export function setMotionLevel(next: AnimationLevel): void {
  level = next;
  apply();
}
