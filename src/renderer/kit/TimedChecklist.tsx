// Spec: 04 §13.5 (kit `TimedChecklist`: steps to tick, some with a timer; Animations Off/Basic apply), CR-0022 AT-346 (a
// timer runs in the renderer; ticks are kept in the surface's data model), 05-1 §0.7 (a ticking time is `aria-live="off"`),
// X-180. R1 T4. The timer reads main's clock (clockNow), so a test clock moves it too; it never sends anything.
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

/** Start (or resume) a step's timer; starting another step's timer drops the old one (one timer runs at a time). */
export function startTimer(timer: StepTimer | null, step: number, seconds: number, now: number): StepTimer {
  const left = timer && timer.step === step && !('endsAt' in timer) ? timer.leftMs : seconds * 1000;
  return { step, endsAt: now + left };
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
}: {
  steps: ChecklistStep[];
  /** Ticked steps by index (from the surface's data model). */
  ticks: readonly boolean[];
  onTick(i: number, on: boolean): void;
}) {
  const [timer, setTimer] = useState<StepTimer | null>(null);
  const [now, setNow] = useState(clockNow);
  const running = timer !== null && 'endsAt' in timer;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(clockNow()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);
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
                {left > 0 && (
                  <Button
                    variant="subtle"
                    icon={ticking ? 'Pause' : 'Play'}
                    onClick={() => {
                      const at = clockNow();
                      setNow(at);
                      setTimer(ticking ? pauseTimer(mine, at) : startTimer(timer, i, s.seconds!, at));
                    }}
                  >
                    {ticking ? t('kit.checklist.pause') : t('kit.checklist.start')}
                  </Button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
