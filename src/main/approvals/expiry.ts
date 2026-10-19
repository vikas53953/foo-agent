// Spec: 08-2 §9.1 (approval timers run in main, so they keep running while the window is closed; absolute `expires_at`),
// §9.7 `ApprovalGate.expireTick` (1 s timer), 05-2 §5.5.4 (EXPIRED copy and [ Ask me again ]). The tick reads the injected
// clock through the gate, so a test clock set past `expires_at` expires the card within one tick.
import type { ApprovalGate } from './ApprovalGate';

export const EXPIRY_TICK_MS = 1_000;

/** Starts the 1 s expiry tick; returns its stop function. The timer never keeps the process alive on its own. */
export function startExpiryTick(gate: Pick<ApprovalGate, 'expireTick'>, every = EXPIRY_TICK_MS): () => void {
  const timer = setInterval(() => {
    try {
      gate.expireTick();
    } catch (e) {
      console.error('approvals.expireTick', e);
    }
  }, every);
  timer.unref?.();
  return () => clearInterval(timer);
}
