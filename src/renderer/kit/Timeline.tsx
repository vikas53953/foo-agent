// Spec: 04 §13.5 (kit Timeline in foo's look), CR-0022 §(c) (items ≤ 20 {date, title, amount?}), AT-344 (items in date
// order; amounts in money format), 02-2 §F19.1 / §F19.2 (money: exact ₹ form with en-IN grouping, U+2212 minus), X-180.
// R1 T3. The AI's dates are free text ("12 Oct", "2026-10-12"): when every one of them reads as a date the items are put in
// date order (ties keep the AI's order); when any does not, the AI's order stands.
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { TID } from '../../shared/testids';
import styles from './Timeline.module.css';

export interface TimelineItem {
  date: string;
  title: string;
  amount?: number | undefined;
}

/** A year for dates written without one ("12 Oct"), so they compare inside one year; any leap year will do. */
const NO_YEAR = 2024;

/** A date the AI wrote as epoch ms, or NaN when it does not read as one. */
export function dateValue(s: string): number {
  const iso = Date.parse(s);
  if (!Number.isNaN(iso) && /\d{4}/.test(s)) return iso;
  return Date.parse(`${s} ${NO_YEAR}`);
}

/** AT-344: date order when every date reads as one, else the AI's order. */
export function inDateOrder(items: readonly TimelineItem[]): TimelineItem[] {
  const keyed = items.map((item, i) => ({ item, i, at: dateValue(item.date) }));
  if (keyed.some((k) => Number.isNaN(k.at))) return [...items];
  return keyed.sort((a, b) => a.at - b.at || a.i - b.i).map((k) => k.item);
}

/** F19.2 exact form of a rupee amount ("₹1,23,450", "−₹500"). */
export function money(rupees: number): string {
  return formatInr(Math.round(rupees * 100)).replace('-', '−');
}

export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  const ordered = inDateOrder(items);
  return (
    <ol className={styles.timeline} data-testid={TID.kitTimeline} aria-label={t('kit.timeline.accessible_name', { n: ordered.length })}>
      {ordered.map((item, i) => (
        <li key={i} className={styles.item}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.date} data-copy="ai">
            {item.date}
          </span>
          <span className={styles.title} data-copy="ai">
            {item.title}
          </span>
          {item.amount !== undefined && <span className={styles.amount}>{money(item.amount)}</span>}
        </li>
      ))}
    </ol>
  );
}
