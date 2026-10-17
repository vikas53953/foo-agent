// Spec: Article 21 and 02-2 §F19.3 (absolute times: "3:00 PM" today, "Sat 17 Oct, 3:00 PM" on another day), 03-shell-1
// §3.3.2.1 (banner times), §3.4.5 (row time; Narrator gets the full form).
import { formatDate, formatTime } from '../../shared/format';

const sameDay = (a: number, b: number, timeZone: string) =>
  formatDate(a, 'date', { timeZone, now: b }) === formatDate(b, 'date', { timeZone, now: b });

/** "3:00 PM" when `at` is today, else "Sat 17 Oct, 3:00 PM" (year added when not this year). */
export function absoluteTime(at: number, now: number, timeZone: string): string {
  return sameDay(at, now, timeZone) ? formatTime(at, { timeZone }) : formatDate(at, 'full', { timeZone, now });
}
