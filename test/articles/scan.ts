import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(p) ? [p] : [];
  });
}

export const read = (p: string) => readFileSync(p, 'utf8');

/** Every user-visible string foo ships (M0: the copy file). Later milestones add tray, toasts, installer strings. */
export function uiStrings(): { key: string; text: string }[] {
  const copy = JSON.parse(read('src/shared/copy/en-IN.json')) as Record<string, string>;
  return Object.entries(copy).map(([key, text]) => ({ key, text }));
}

// ART-21a time scan and ART-21c money scan (10-2 §D, Article 21, 02 F10 / 02-2 §F19). Shared by the copy scan
// (test/articles/ART-21.test.ts) and the rendered-thread scan (test/e2e/m2-messages.spec.ts).
const DATE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const RELATIVE = /\b(today|tomorrow|tonight|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

export function timeFlags(text: string): string[] {
  const flags: string[] = [];
  if (/\b([01]?\d|2[0-3]):[0-5]\d\b(?!\s?[AP]M)/.test(text)) flags.push('24-hour time');
  if (/\b\d{1,2}:\d{2}\s?[AP]M\b/.test(text) && !DATE.test(text)) flags.push('clock time without weekday, day and month');
  if (RELATIVE.test(text) && !DATE.test(text)) flags.push('relative word without an absolute date');
  return flags;
}

export function moneyFlags(text: string): string[] {
  const flags: string[] = [];
  for (const m of text.matchAll(/₹\s?([\d,]+)(\.\d+)?/g)) {
    const digits = m[1]!;
    if (!/^(\d+|\d{1,2}(,\d{2})*,\d{3})$/.test(digits) || (!digits.includes(',') && digits.length > 3))
      flags.push(`not Indian grouping: ${m[0]}`);
  }
  if (/₹\s?\d+(\.\d+)?\s?[kK]\b/.test(text)) flags.push('k amount');
  if (/\b(lakh|crore)\b/i.test(text) && !/₹\d+(\.\d)? (lakh|crore)\b/.test(text)) flags.push('lakh/crore without a full figure');
  if (/\b(Rs\.?|INR|lacs?|lakhs)\b|\/-/.test(text)) flags.push('banned money form');
  return flags;
}

/** One rendered string; `meta` = inside a bubble's meta (`data-meta`), which ART-21a exempts ("except bubble meta"). */
export interface RenderedString {
  text: string;
  meta: boolean;
}

/** ART-21a over rendered strings: every flagged string that is not bubble meta. */
export function renderedTimeFlags(strings: RenderedString[]): { text: string; flags: string[] }[] {
  return strings
    .filter((s) => !s.meta)
    .flatMap((s) => {
      const flags = timeFlags(s.text);
      return flags.length ? [{ text: s.text, flags }] : [];
    });
}
