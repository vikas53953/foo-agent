// Spec: 05-3 §5.22 Table card (max 6 columns, 10 rows visible; "Copy table" copies tab-separated text), 08-5 §4.1
// TablePayload (money in paise; date and time columns in the F19 forms, 02-2 §F19). Pure.
import { formatDate, formatInr, formatTime } from '../../shared/format';
import type { TablePayload } from '../../shared/types';

export const TABLE_CARD_ROWS = 10;
export const TABLE_CARD_COLS = 6;

type Column = TablePayload['columns'][number];

/** One cell as shown: money (paise) through formatInr, dates and times in the F19 forms, text as written. */
export function cellText(v: string | number | null | undefined, col: Column, o: { timeZone: string; now: number }): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (col.unit === 'inr') return formatInr(v);
    if (col.unit === 'date') return formatDate(v, 'date', o);
    if (col.unit === 'time') return formatTime(v, o);
    return v.toLocaleString('en-IN');
  }
  return v;
}

export function tableTsv(p: TablePayload, o: { timeZone: string; now: number }): string {
  const cols = p.columns.slice(0, TABLE_CARD_COLS);
  return [cols.map((c) => c.label), ...p.rows.map((r) => cols.map((c) => cellText(r[c.key], c, o)))].map((r) => r.join('\t')).join('\n');
}
