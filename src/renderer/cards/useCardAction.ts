// Spec: 05-1 §0.5 Submitting (the tapped button shows a spinner and its "-ing" label, every other button is disabled,
// `aria-busy`), §0.3 (one tap = one action), X-124 (each button sends exactly one invoke; a second tap while the first is in
// flight sends nothing), §0.6 (Ctrl+Enter inside the card = its Primary; never on Approval / Payment / Draft).
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import type { Result } from '../../shared/errors';

/** Runs one card action at a time; `busy` names the action in flight. */
export function useCardAction<A extends string>(): {
  busy: A | null;
  run: (action: A, call: () => Promise<Result<unknown>> | undefined) => void;
} {
  const [busy, setBusy] = useState<A | null>(null);
  const inFlight = useRef(false);
  const run = useCallback((action: A, call: () => Promise<Result<unknown>> | undefined) => {
    if (inFlight.current) return;
    const p = call();
    if (!p) return;
    inFlight.current = true;
    setBusy(action);
    void p
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
        setBusy(null);
      });
  }, []);
  return { busy, run };
}

/** 05-1 §0.6: Ctrl+Enter anywhere inside the card activates its Primary. */
export const ctrlEnter = (primary: (() => void) | null) => (e: KeyboardEvent) => {
  if (primary && e.key === 'Enter' && e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    primary();
  }
};
