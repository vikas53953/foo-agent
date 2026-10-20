// Spec: 04 §13.5 (kit WeekCalendar in foo's look; it uses the user's calendar only through M8 connectors, so the AI fills
// it from what it read there), CR-0022 §(c) (days ≤ 7, slots ≤ 70 {day, start, end, busy}), AT-345 (busy and free slots
// for 7 days; Narrator reads each slot), X-180. R1 T3.
// A column per day on one shared hour scale (the earliest start to the latest end of the week); a slot sits at its time.
// Narrator reads every slot as "{day} {start}–{end}, Busy | Free"; the eye reads the start time and the fill (busy: accent
// fill, free: dashed edge), with a key under the week.
import type { CSSProperties } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { cx } from '../ui/cx';
import styles from './WeekCalendar.module.css';

export interface CalendarSlot {
  day: number;
  start: string;
  end: string;
  busy: boolean;
}

/** "09:30" → 570; null when it is not a 24-hour time. */
export function minutes(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export interface WeekLayout {
  /** The scale's first and last whole hour, in minutes. */
  from: number;
  to: number;
  /** Each day's slots in time order, placed in percent of the scale. */
  days: { label: string; slots: (CalendarSlot & { top: number; height: number })[] }[];
}

/** null when a slot names a day the week does not have, or a time that is not one, or ends before it starts. */
export function weekLayout(days: readonly string[], slots: readonly CalendarSlot[]): WeekLayout | null {
  const timed = slots.map((s) => ({ s, a: minutes(s.start), b: minutes(s.end) }));
  if (timed.some((x) => x.a === null || x.b === null || x.b <= x.a || x.s.day >= days.length)) return null;
  const from = timed.length ? Math.floor(Math.min(...timed.map((x) => x.a!)) / 60) * 60 : 9 * 60;
  const to = timed.length ? Math.ceil(Math.max(...timed.map((x) => x.b!)) / 60) * 60 : 17 * 60;
  const pct = (m: number) => ((m - from) / (to - from)) * 100;
  return {
    from,
    to,
    days: days.map((label, d) => ({
      label,
      slots: timed
        .filter((x) => x.s.day === d)
        .sort((x, y) => x.a! - y.a!)
        .map((x) => ({ ...x.s, top: pct(x.a!), height: pct(x.b!) - pct(x.a!) })),
    })),
  };
}

export function WeekCalendar({ layout }: { layout: WeekLayout }) {
  const hours = (layout.to - layout.from) / 60;
  const state = (busy: boolean) => (busy ? t('kit.calendar.busy') : t('kit.calendar.free'));
  return (
    <div className={styles.calendar} data-testid={TID.kitWeekCalendar}>
      <div className={styles.week} style={{ '--hours': hours } as CSSProperties}>
        {layout.days.map((day, d) => (
          <div key={d} className={styles.day}>
            <span className={styles.label} data-copy="ai">
              {day.label}
            </span>
            <ul className={styles.track} aria-label={day.label}>
              {day.slots.map((s, i) => (
                <li
                  key={i}
                  className={cx(styles.slot, s.busy ? styles.busy : styles.free)}
                  style={{ top: `${s.top}%`, height: `${s.height}%` }}
                  aria-label={`${day.label} ${s.start}–${s.end}, ${state(s.busy)}`}
                  data-busy={s.busy}
                >
                  <span className={styles.time} aria-hidden="true">
                    {s.start}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={styles.key} aria-hidden="true">
        <span className={cx(styles.swatch, styles.busy)} />
        {t('kit.calendar.busy')}
        <span className={cx(styles.swatch, styles.free)} />
        {t('kit.calendar.free')}
      </p>
    </div>
  );
}
