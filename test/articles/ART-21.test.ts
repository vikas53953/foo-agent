// ART-21a (time scan) and ART-21c (money scan) over every UI string (10-2 §D, Article 21, 02 F10 / 02-2 §F19).
import { describe, expect, it } from 'vitest';
import { moneyFlags, renderedTimeFlags, timeFlags, uiStrings } from './scan';

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
  // 10-2 ART-21a "except bubble meta": the time inside a bubble's meta (data-meta) is not scanned; every other rendered
  // string is (the M2 thread scan in test/e2e/m2-messages.spec.ts collects the strings this way).
  it('bubble meta is exempt from the clock-time rule; the same time anywhere else is flagged', () => {
    const strings = [
      { text: '8:06 AM', meta: true },
      { text: 'Cake from Theobroma is booked for Sun 18 Oct, 11:00 AM.', meta: false },
      { text: 'See you at 8:06 AM', meta: false },
    ];
    expect(renderedTimeFlags(strings)).toEqual([{ text: 'See you at 8:06 AM', flags: ['clock time without weekday, day and month'] }]);
  });
  // A `{date}` slot is always filled by formatDate() (02-2 §F19.3), so it is scanned as the absolute date it becomes
  // ("Today, {date}" → "Today, Fri 16 Oct", 03-shell-2 §3.6.5).
  it.each(uiStrings())('$key', ({ text }) => {
    const filled = text.replace(/\{date\}/g, 'Fri 16 Oct');
    expect([...timeFlags(filled), ...moneyFlags(filled)]).toEqual([]);
  });
});
