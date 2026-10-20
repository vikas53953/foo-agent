// Spec: 02 §F7.1 "Chat" (CR-0021, X-179: a retry spinner turns into ✓), 04 §7 (Not sent → Try again), §19.4 (a cut-off
// reply's Try again runs the turn once more; the cut-off bubble stays). The user's line stays while the retry runs and for
// `dur-confirm` after the message went, then leaves; a cut-off reply keeps its ✓ (it can be tried again only once). A
// retry that fails shows "Try again" again. The phase lives outside the row: a message the composer inserted is re-keyed
// when main stores it, and the remounted row picks up the spinner or ✓ where the old one left it.
import { useEffect, useSyncExternalStore } from 'react';
import { motion } from '../../shared/tokens';

export type RetryPhase = 'idle' | 'busy' | 'done';

const phases = new Map<string, RetryPhase>();
const listeners = new Set<() => void>();

function setPhase(key: string, phase: RetryPhase): void {
  if (phase === 'idle') phases.delete(key);
  else phases.set(key, phase);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRetry(
  key: string,
  run: () => Promise<boolean> | null,
  o: { keepDone?: boolean } = {},
): { phase: RetryPhase; retry: () => void } {
  const phase = useSyncExternalStore(subscribe, () => phases.get(key) ?? 'idle');
  const keepDone = !!o.keepDone;
  useEffect(() => {
    if (phase !== 'done' || keepDone) return;
    const id = setTimeout(() => setPhase(key, 'idle'), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [phase, keepDone, key]);
  const retry = () => {
    const p = run();
    if (!p) return;
    setPhase(key, 'busy');
    void p.then(
      (ok) => setPhase(key, ok ? 'done' : 'idle'),
      () => setPhase(key, 'idle'),
    );
  };
  return { phase, retry };
}
