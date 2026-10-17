// ART-21a (time scan) and ART-21c (money scan) over every UI string (10-2 §D, Article 21, 02 F10 / 02-2 §F19).
import { describe, expect, it } from 'vitest';
import { uiStrings } from './scan';

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

describe('ART-21a / ART-21c scans', () => {
  it('detectors catch bad forms', () => {
    expect(timeFlags('See you at 20:00')).toContain('24-hour time');
    expect(timeFlags('tomorrow at 8:00 PM')).not.toEqual([]);
    expect(timeFlags('tomorrow, Sat 17 Oct, 8:00 PM')).toEqual([]);
    expect(moneyFlags('₹14600')).not.toEqual([]);
    expect(moneyFlags('₹1,234,567')).not.toEqual([]);
    expect(moneyFlags('₹5k')).not.toEqual([]);
    expect(moneyFlags('₹14,600 or ₹1,23,450 or ₹55 lakh')).toEqual([]);
  });
  it.each(uiStrings())('$key', ({ text }) => expect([...timeFlags(text), ...moneyFlags(text)]).toEqual([]));
});
