// Spec: 02 §F7.1 "Chat" (CR-0021, X-179: a retry spinner turns into ✓), 04 §7 (Not sent → Try again), §19.4 (a cut-off
// reply's Try again runs the turn once more; the cut-off bubble stays). The user's line stays while the retry runs and for
// `dur-confirm` after the message went, then leaves; a cut-off reply keeps its ✓ (it can be tried again only once). A
// retry that fails shows "Try again" again.
import { useEffect, useState } from 'react';
import { motion } from '../../shared/tokens';

export type RetryPhase = 'idle' | 'busy' | 'done';

/** Cut-off replies already tried again, so a row mounted again on scroll-back still shows ✓. */
const triedOnce = new Set<string>();

export function useRetry(
  key: string,
  run: () => Promise<boolean> | null,
  o: { keepDone?: boolean } = {},
): { phase: RetryPhase; retry: () => void } {
  const [phase, setPhase] = useState<RetryPhase>(() => (o.keepDone && triedOnce.has(key) ? 'done' : 'idle'));
  const keepDone = !!o.keepDone;
  useEffect(() => {
    if (phase !== 'done' || keepDone) return;
    const id = setTimeout(() => setPhase('idle'), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [phase, keepDone]);
  const retry = () => {
    const p = run();
    if (!p) return;
    setPhase('busy');
    void p.then(
      (ok) => {
        if (ok && keepDone) triedOnce.add(key);
        setPhase(ok ? 'done' : 'idle');
      },
      () => setPhase('idle'),
    );
  };
  return { phase, retry };
}
