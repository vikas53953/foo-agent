// Spec: 02-foundations-2 §F19.2 (money), §F19.3 (dates and times), Article 21; 08-1 §0.4–§0.5 (integer paise, epoch ms + IANA zone).
// Money is integer paise. Times are UTC epoch ms, shown in an IANA time zone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Indian digit grouping: 1,23,45,678. */
function groupIndian(whole: bigint): string {
  const s = whole.toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** F19.2 exact form: "₹14,600", "₹1,23,450", "₹1,179.50" (paise only when non-zero). */
export function formatInr(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError('paise must be an integer');
  const neg = paise < 0;
  const abs = BigInt(Math.abs(paise));
  const rupees = abs / 100n;
  const p = abs % 100n;
  const body = `₹${groupIndian(rupees)}${p === 0n ? '' : `.${p.toString().padStart(2, '0')}`}`;
  return neg ? `-${body}` : body;
}

/** F19.2 rough form for thresholds ≥ ₹1 lakh: "₹55 lakh", "₹1.2 crore". Below ₹1 lakh it is the exact form. */
export function formatInrWords(paise: number): string {
  const rupees = paise / 100;
  const words = (n: number, unit: string) => `₹${(Math.round(n * 10) / 10).toString()} ${unit}`;
  if (Math.abs(rupees) >= 1e7) return words(rupees / 1e7, 'crore');
  if (Math.abs(rupees) >= 1e5) return words(rupees / 1e5, 'lakh');
  return formatInr(paise);
}

/**
 * Parses an amount the user typed into paise. Accepts "₹14,600", "14600", "1,179.50", "₹ 1,23,450.5".
 * Rejects the forms F19.2 lists under "Never" (Rs, INR, /-, L, Cr, k, lac) and anything ambiguous. Returns null when it cannot parse.
 */
export function parseInr(input: string): number | null {
  const s = input.trim().replace(/^₹\s*/, '');
  const m = /^(\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const value = BigInt(m[1]!.replace(/,/g, '')) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

type Parts = { y: number; mo: number; d: number; wd: number; h: number; mi: number; s: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(epochMs: number, timeZone: string): Parts {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(epochMs));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    y: +get('year'),
    mo: +get('month') - 1,
    d: +get('day'),
    wd: (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).indexOf(get('weekday') as (typeof WEEKDAYS)[number]),
    h: +get('hour'),
    mi: +get('minute'),
    s: +get('second'),
  };
}

export type TimeOptions = { timeZone: string; hour12?: boolean };

/** F19.3 `h:mm a` ("9:41 AM"), or "20:00" when the Windows region uses 24-hour time (F19.3.2). */
export function formatTime(epochMs: number, opts: TimeOptions, withSeconds = false): string {
  const p = partsIn(epochMs, opts.timeZone);
  const mm = String(p.mi).padStart(2, '0');
  const ss = withSeconds ? `:${String(p.s).padStart(2, '0')}` : '';
  if (opts.hour12 === false) return `${String(p.h).padStart(2, '0')}:${mm}${ss}`;
  const h = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h}:${mm}${ss} ${p.h < 12 ? 'AM' : 'PM'}`;
}

export type DateForm = 'full' | 'full_seconds' | 'date' | 'month';

/**
 * F19.3 forms. `full`: "Sat 12 Dec, 8:00 PM" ("Sat 12 Dec 2027, 8:00 PM" when not the current year);
 * `full_seconds`: "Fri 16 Oct 2026, 10:42:07 PM" (always with year); `date`: "Fri 16 Oct" (year added when not current);
 * `month`: "October 2026". Weekday is always computed from the real date (F19.3.5).
 */
export function formatDate(epochMs: number, form: DateForm, opts: TimeOptions & { now: number }): string {
  const p = partsIn(epochMs, opts.timeZone);
  if (form === 'month') return `${MONTHS_LONG[p.mo]} ${p.y}`;
  const otherYear = partsIn(opts.now, opts.timeZone).y !== p.y;
  const day = `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.mo]}`;
  if (form === 'date') return otherYear ? `${day} ${p.y}` : day;
  if (form === 'full_seconds') return `${day} ${p.y}, ${formatTime(epochMs, opts, true)}`;
  return `${otherYear ? `${day} ${p.y}` : day}, ${formatTime(epochMs, opts)}`;
}

const DAY_MS = 86_400_000;

/** Calendar-day number of an instant in a zone (days since the epoch, local midnight to midnight). */
function dayNumber(epochMs: number, timeZone: string): number {
  const p = partsIn(epochMs, timeZone);
  return Math.round(Date.UTC(p.y, p.mo, p.d) / DAY_MS);
}

/**
 * 03-shell-1 §3.4.5 row time: today "9:41 AM"; 1–6 days ago the weekday "Thu"; older this year "12 Dec"; other year
 * "12 Dec 2025". Never "Yesterday" (Article 21). Narrator gets `formatDate(…, 'full')` instead.
 */
export function formatRowTime(epochMs: number, opts: TimeOptions & { now: number }): string {
  const days = dayNumber(opts.now, opts.timeZone) - dayNumber(epochMs, opts.timeZone);
  if (days <= 0) return formatTime(epochMs, opts);
  const p = partsIn(epochMs, opts.timeZone);
  if (days <= 6) return WEEKDAYS[p.wd]!;
  const sameYear = partsIn(opts.now, opts.timeZone).y === p.y;
  return sameYear ? `${p.d} ${MONTHS[p.mo]}` : `${p.d} ${MONTHS[p.mo]} ${p.y}`;
}

/** Weekday of an instant ("Thu"), for the folded row's "Done {Thu}" (03-shell-1 §3.4.7). */
export function formatWeekday(epochMs: number, timeZone: string): string {
  return WEEKDAYS[partsIn(epochMs, timeZone).wd]!;
}

/** Voice length "m:ss" (03-shell-1 §3.4.6 "Voice message ({m:ss})"). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "YYYY-MM" of an instant in a zone (08-5 §3.2 `SpendSummary.month`). */
export function monthKey(epochMs: number, timeZone: string): string {
  const p = partsIn(epochMs, timeZone);
  return `${p.y}-${String(p.mo + 1).padStart(2, '0')}`;
}
