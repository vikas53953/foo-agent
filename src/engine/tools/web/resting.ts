// Spec: 08-2 §8.3.12 f (failure of any cloud tool → silent local fallback; 3 failures in a row mark that provider "resting"
// for 1 h), 08-4 §27.3 item 2.
import type { Clock } from '../../../shared/clock';
import type { WebProvider } from './types';

export const FAILS_TO_REST = 3;
export const REST_MS = 60 * 60 * 1000;

export class RestingClock {
  private readonly streak = new Map<WebProvider, number>();
  private readonly until = new Map<WebProvider, number>();

  constructor(private readonly clock: Clock) {}

  isResting(p: WebProvider): boolean {
    const until = this.until.get(p);
    if (until === undefined) return false;
    if (this.clock.now() < until) return true;
    this.until.delete(p);
    this.streak.set(p, 0);
    return false;
  }

  ok(p: WebProvider): void {
    this.streak.set(p, 0);
  }

  fail(p: WebProvider): void {
    const n = (this.streak.get(p) ?? 0) + 1;
    this.streak.set(p, n);
    if (n >= FAILS_TO_REST) this.until.set(p, this.clock.now() + REST_MS);
  }
}
