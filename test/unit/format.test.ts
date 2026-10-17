// 02-2 §F19.2, §F19.3; X-10 test clock Fri 16 Oct 2026, 9:00 AM IST.
import { describe, expect, it } from 'vitest';
import { formatDate, formatInr, formatInrWords, formatTime, parseInr } from '../../src/shared/format';

const IST = { timeZone: 'Asia/Kolkata' };
const CLOCK = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST

describe('formatInr (exact)', () => {
  it.each([
    [1_460_000, '₹14,600'],
    [12_345_000, '₹1,23,450'],
    [117_950, '₹1,179.50'],
    [100, '₹1'],
    [5, '₹0.05'],
    [0, '₹0'],
    [10_000_000_000, '₹10,00,00,000'],
  ])('%i paise → %s', (p, s) => expect(formatInr(p)).toBe(s));
  it('rejects fractional paise', () => expect(() => formatInr(1.5)).toThrow());
});

describe('formatInrWords (rough thresholds)', () => {
  it.each([
    [5_500_000_00, '₹55 lakh'],
    [12_000_000_00, '₹1.2 crore'],
    [20_000_000_00, '₹2 crore'],
    [1_460_000, '₹14,600'],
  ])('%i → %s', (p, s) => expect(formatInrWords(p)).toBe(s));
});

describe('parseInr', () => {
  it.each([
    ['₹14,600', 1_460_000],
    ['14600', 1_460_000],
    ['₹ 1,23,450', 12_345_000],
    ['1,179.50', 117_950],
    ['1,179.5', 117_950],
    ['1,000', 100_000],
  ])('%s → %i', (s, p) => expect(parseInr(s)).toBe(p));
  it.each(['Rs 500', 'INR 500', '500/-', '5k', '1.2L', '2 Cr', '5 lac', '123,456', '1.234', '', 'abc', '₹', '1,23,45'])('rejects %s', (s) =>
    expect(parseInr(s)).toBeNull(),
  );
  it('round-trips', () => {
    for (const p of [0, 1, 99, 100, 117_950, 12_345_000]) expect(parseInr(formatInr(p))).toBe(p);
  });
});

describe('times and dates (Article 21)', () => {
  it('time only', () => expect(formatTime(CLOCK, IST)).toBe('9:00 AM'));
  it('24-hour when the region says so', () => expect(formatTime(Date.UTC(2026, 9, 16, 14, 30), { ...IST, hour12: false })).toBe('20:00'));
  it('full, this year', () =>
    expect(formatDate(Date.UTC(2026, 11, 12, 14, 30), 'full', { ...IST, now: CLOCK })).toBe('Sat 12 Dec, 8:00 PM'));
  it('full, other year', () =>
    expect(formatDate(Date.UTC(2027, 11, 11, 14, 30), 'full', { ...IST, now: CLOCK })).toBe('Sat 11 Dec 2027, 8:00 PM'));
  it('full with seconds', () =>
    expect(formatDate(Date.UTC(2026, 9, 16, 17, 12, 7), 'full_seconds', { ...IST, now: CLOCK })).toBe('Fri 16 Oct 2026, 10:42:07 PM'));
  it('date only', () => expect(formatDate(CLOCK, 'date', { ...IST, now: CLOCK })).toBe('Fri 16 Oct'));
  it('month', () => expect(formatDate(CLOCK, 'month', { ...IST, now: CLOCK })).toBe('October 2026'));
  it('no leading zeros, minutes 2 digits', () => expect(formatTime(Date.UTC(2026, 9, 5, 3, 35), IST)).toBe('9:05 AM'));
  it('midnight and noon', () => {
    expect(formatTime(Date.UTC(2026, 9, 15, 18, 30), IST)).toBe('12:00 AM');
    expect(formatTime(Date.UTC(2026, 9, 16, 6, 30), IST)).toBe('12:00 PM');
  });
});
