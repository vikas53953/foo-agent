// Spec: 04 §13.5 (kit `TimedChecklist`: steps to tick, some with a timer; Animations Off/Basic apply), CR-0022 AT-346 (a
// timer runs in the renderer; ticks are kept in the surface's data model), 05-1 §0.7 (a ticking time is `aria-live="off"`),
// X-180. R1 T4. The timer reads main's clock (clockNow), so a test clock moves it too; it never sends anything. The timer
// state lives in the surface's data model beside the ticks, so a row the virtual list mounts again keeps it running.
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatDuration } from '../../shared/format';
import { TID } from '../../shared/testids';
import { clockNow } from '../store/apply';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import styles from './NumbersForms.module.css';

const TICK_MS = 250;

/** One step's timer: running (ends at `endsAt`) or paused with `leftMs` to go. */
export type StepTimer = { step: number; endsAt: number } | { step: number; leftMs: number };

export function timerLeft(timer: StepTimer, now: number): number {
  return 'endsAt' in timer ? Math.max(0, timer.endsAt - now) : timer.leftMs;
}

/**
 * Start (or resume) a step's timer: a paused one goes on from where it stopped; a finished one, or another step's, starts
 * again from the step's seconds (one timer runs at a time).
 */
export function startTimer(timer: StepTimer | null, step: number, seconds: number, now: number): StepTimer {
  const left = timer && timer.step === step && !('endsAt' in timer) && timer.leftMs > 0 ? timer.leftMs : seconds * 1000;
  return { step, endsAt: now + left };
}

/** A timer read back from the data model (free JSON), or null when it is not one. */
export function asTimer(v: unknown): StepTimer | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!ok(o.step) || !Number.isInteger(o.step) || o.step < 0) return null;
  if (ok(o.endsAt)) return { step: o.step, endsAt: o.endsAt };
  if (ok(o.leftMs) && o.leftMs >= 0) return { step: o.step, leftMs: o.leftMs };
  return null;
}

export const pauseTimer = (timer: StepTimer, now: number): StepTimer => ({ step: timer.step, leftMs: timerLeft(timer, now) });

export interface ChecklistStep {
  title: string;
  seconds?: number;
}

export function TimedChecklist({
  steps,
  ticks,
  onTick,
  timer,
  onTimer,
}: {
  steps: ChecklistStep[];
  /** Ticked steps by index (from the surface's data model). */
  ticks: readonly boolean[];
  onTick(i: number, on: boolean): void;
  /** The running or paused timer (from the surface's data model). */
  timer: StepTimer | null;
  onTimer(timer: StepTimer): void;
}) {
  const [now, setNow] = useState(clockNow);
  const endsAt = timer && 'endsAt' in timer ? timer.endsAt : null;
  // The clock ticks only while a timer runs, and stops when it reaches 0.
  useEffect(() => {
    if (endsAt === null || clockNow() >= endsAt) return;
    const id = setInterval(() => {
      const at = clockNow();
      setNow(at);
      if (at >= endsAt) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <ul className={styles.steps} data-testid={TID.kitTimedChecklist}>
      {steps.map((s, i) => {
        const on = ticks[i] === true;
        const mine = timer?.step === i ? timer : null;
        const left = mine ? timerLeft(mine, now) : (s.seconds ?? 0) * 1000;
        const ticking = mine !== null && 'endsAt' in mine && left > 0;
        return (
          <li key={i} className={styles.stepRow} data-step={i} data-ticked={on || undefined}>
            <label className={styles.check}>
              <input type="checkbox" checked={on} onChange={(e) => onTick(i, e.target.checked)} />
              <span className={cx(on && styles.done)} data-copy="ai">
                {s.title}
              </span>
            </label>
            {s.seconds !== undefined && !on && (
              <span className={styles.timer}>
                <span aria-live="off" data-left-ms={left}>
                  {t('kit.checklist.left', { time: formatDuration(left) })}
                </span>
                <Button
                  variant="subtle"
                  icon={ticking ? 'Pause' : 'Play'}
                  onClick={() => {
                    const at = clockNow();
                    setNow(at);
                    onTimer(ticking ? pauseTimer(mine, at) : startTimer(timer, i, s.seconds!, at));
                  }}
                >
                  {ticking ? t('kit.checklist.pause') : t('kit.checklist.start')}
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
