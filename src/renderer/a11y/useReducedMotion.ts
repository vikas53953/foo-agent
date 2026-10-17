// Spec: 02 F7 X-150 (motion follows the OS "reduce motion" setting and settings.appearance.animations; `data-motion` on the
// root), 02-3 §F25.4 (reduced motion: no smooth scroll, no slides).
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void): () => void {
  const m = matchMedia(QUERY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

/** True when motion should be instant: the OS asks for it or animations are off. */
export function reducedMotionNow(): boolean {
  return matchMedia(QUERY).matches || document.documentElement.dataset.motion === 'off';
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedMotionNow);
}
