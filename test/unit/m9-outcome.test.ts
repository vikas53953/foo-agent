// Spec: 08-2 §10.4 (the outcome table after the one click), 08-4 §28.1 item 8, AT-114a ("Booking code TJ8821" is proof),
// G-M9-07 (the history page row). Words below are the sandbox restaurant's (test/sites/restaurant) and typical site lines.
import { describe, expect, it } from 'vitest';
import {
  classifyPage,
  findBookingInHistory,
  findConfirmationCode,
  isHistoryLink,
  watchOutcome,
  type PageFacts,
} from '../../src/engine/tools/browser/outcome';

const page = (text: string, hasOtpField = false): PageFacts => ({ text, hasOtpField });

describe('findConfirmationCode', () => {
  it('reads the code next to a confirmation word, verbatim', () => {
    expect(findConfirmationCode('Booking confirmed\nBooking code TJ8821\nYour bookings')).toBe('TJ8821');
    expect(findConfirmationCode('Booked. Reference TBL42.')).toBe('TBL42');
    expect(findConfirmationCode('Confirmation number: 482131')).toBe('482131');
  });
  it('never reads a word without a digit as a code', () => {
    expect(findConfirmationCode('Booking confirmed. We sent a code to your phone.')).toBeNull();
    expect(findConfirmationCode('Code Place Time People Status')).toBeNull();
  });
});

describe('classifyPage (08-2 §10.4)', () => {
  it('a code or success text → success', () => {
    expect(classifyPage(page('Booking confirmed\nBooking code TJ8821'))).toEqual({ kind: 'success', code: 'TJ8821' });
    expect(classifyPage(page('Thank you for your booking!'))).toEqual({ kind: 'success' });
  });
  it('the site saying no → decline', () => {
    expect(classifyPage(page('Sorry, that slot was just taken.'))).toEqual({ kind: 'decline' });
    expect(classifyPage(page('Your card was declined.'))).toEqual({ kind: 'decline' });
  });
  it('an OTP field or 3-D Secure page → otp; a UPI collect page → upi_wait', () => {
    expect(classifyPage(page('Verify it is you', true)).kind).toBe('otp');
    expect(classifyPage(page('3-D Secure: enter the OTP sent to your phone')).kind).toBe('otp');
    expect(classifyPage(page('Approve ₹540 in your UPI app on your phone.')).kind).toBe('upi_wait');
  });
  it('anything else → unknown (CHECKING), e.g. "we\'re processing your request"', () => {
    expect(classifyPage(page("Thanks, we're processing your request."))).toEqual({ kind: 'unknown' });
  });
});

describe('watchOutcome', () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: (ms: number) => ((t += ms), Promise.resolve()) };
  };
  it('polls every 2 s until the code appears', async () => {
    const c = clock();
    const pages = ["Thanks, we're processing your request.", "Thanks, we're processing your request.", 'Booking code TJ8821'];
    let i = 0;
    const r = await watchOutcome(() => Promise.resolve(page(pages[Math.min(i++, 2)]!)), c.sleep, c.now);
    expect(r).toEqual({ kind: 'success', code: 'TJ8821' });
    expect(c.now()).toBe(4_000);
  });
  it('nothing clear for 120 s → unknown', async () => {
    const c = clock();
    const r = await watchOutcome(() => Promise.resolve(page('Please wait')), c.sleep, c.now);
    expect(r).toEqual({ kind: 'unknown' });
    expect(c.now()).toBe(120_000);
  });
  it('an OTP page waits 5 min, then is a timeout (FAILED)', async () => {
    const c = clock();
    const r = await watchOutcome(() => Promise.resolve(page('Enter the OTP', true)), c.sleep, c.now);
    expect(r).toEqual({ kind: 'timeout', during: 'otp' });
    expect(c.now()).toBe(300_000);
  });
});

describe('history page (G-M9-07)', () => {
  it('finds the code on the row that names the place', () => {
    const text = 'Your bookings\nCode\tPlace\tTime\tPeople\tStatus\nTJ8821\tCoastline Kitchen\t8:00 PM\t4\tConfirmed';
    expect(findBookingInHistory(text, 'Coastline Kitchen')).toBe('TJ8821');
    expect(findBookingInHistory(text, 'Saffron Table')).toBeNull();
    expect(findBookingInHistory('No bookings yet.', 'Coastline Kitchen')).toBeNull();
  });
  it('knows a history link by its words', () => {
    expect(isHistoryLink('Your bookings')).toBe(true);
    expect(isHistoryLink('Order history')).toBe(true);
    expect(isHistoryLink('Search again')).toBe(false);
  });
});
