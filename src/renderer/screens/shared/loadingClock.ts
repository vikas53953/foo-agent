// Spec: 06 §0.5 Loading (data from disk not ready within 150ms → static skeleton rows; after 2s still loading, one line
// "Still loading…"), 02-3 §F20.1 (`--delay-loading` 150, `--delay-still-loading` 2000). Kept apart from PageStates.tsx so
// the timing is testable without a page.
import { motion } from '../../../shared/tokens';

/** `wait`: nothing drawn yet; `skeleton`: skeleton rows; `still`: skeleton + "Still loading…". */
export type LoadingPhase = 'wait' | 'skeleton' | 'still';

/** Calls `onPhase('skeleton')` after `--delay-loading` and `onPhase('still')` after `--delay-still-loading`; returns stop. */
export function startLoadingClock(
  onPhase: (p: LoadingPhase) => void,
  delays: { skeleton: number; still: number } = { skeleton: motion['delay-loading'], still: motion['delay-still-loading'] },
): () => void {
  const a = setTimeout(() => onPhase('skeleton'), delays.skeleton);
  const b = setTimeout(() => onPhase('still'), delays.still);
  return () => {
    clearTimeout(a);
    clearTimeout(b);
  };
}
