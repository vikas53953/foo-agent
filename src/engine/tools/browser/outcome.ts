// Spec: 08-2 §10.4 (classify the outcome after the one click, ≤ 120 s, polling the page every 2 s: success page or
// confirmation code → COMPLETED; bank OTP / 3-D Secure page → stays RUNNING, the code lane, ≤ 5 min; UPI waiting page ≤ 5 min;
// explicit decline text → FAILED; OTP / UPI timeout → FAILED; anything else → CHECKING), 08-4 §28.1 item 8 (book: success
// text or confirmation code → COMPLETED with proof; explicit refusal text → FAILED; anything else → CHECKING through the site's
// history page only, never Gmail), §26.11 / AT-114a (a 6-character booking code next to the word "code" is proof), G-M9-07
// (an unconfirmed booking: the site's history page every 60 s for 10 min). The decisions are made here, from the page's text;
// submit.ts and the runner do the clicking and the waiting.

export type OutcomeKind = 'success' | 'otp' | 'upi_wait' | 'decline' | 'unknown';

export interface PageOutcome {
  kind: OutcomeKind;
  /** The confirmation code the page shows (success only). */
  code?: string;
}

/** What the classifier reads from the page: its visible text and whether a one-time-code field is on it. */
export interface PageFacts {
  text: string;
  hasOtpField: boolean;
}

/**
 * A code next to a confirmation word ("Booking code TJ8821", "Confirmation number: 48213", "Reservation ID AB-1234"). The code
 * must carry a digit, so "Booking confirmed" or "code sent" never read as one.
 */
const CODE_NEAR_WORD =
  /\b(?:booking|confirmation|reservation|reference|order|ref)\s*(?:code|number|no\.?|id|#)?\s*(?:is\s*)?[:#]?\s*([A-Z0-9][A-Z0-9-]{3,13})\b/giu;
const BARE_CODE = /\bcode\s*(?:is\s*)?[:#]?\s*([A-Z0-9][A-Z0-9-]{3,13})\b/giu;

const hasDigit = (s: string) => /\d/.test(s);
const hasLetterOrLong = (s: string) => /[A-Z]/i.test(s) || s.replace(/-/g, '').length >= 5;

/** The first confirmation-shaped code in `text`, or null. Codes are kept as the page writes them (AT-114a: verbatim). */
export function findConfirmationCode(text: string): string | null {
  for (const re of [CODE_NEAR_WORD, BARE_CODE]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const code = m[1]!;
      if (hasDigit(code) && hasLetterOrLong(code)) return code;
    }
  }
  return null;
}

/** Success words a site prints when the booking or order went through. */
const SUCCESS =
  /\b(?:booking|reservation|order|table|payment)\s+(?:is\s+|has\s+been\s+)?(?:confirmed|successful|complete[d]?|placed)\b|\byou(?:'|’)?re\s+booked\b|\bthank you for (?:your )?(?:booking|order|reservation)\b/iu;
/** Explicit refusal text (the site said no; nothing went through). */
const DECLINE =
  /\b(?:declined|was\s+(?:just\s+)?taken|no longer available|not available any ?more|sold out|payment failed|transaction failed|could not (?:be )?(?:booked|completed|processed)|couldn(?:'|’)t (?:book|complete)|card was rejected)\b/iu;
/** The bank's one-time code page or 3-D Secure page. */
const OTP = /\b(?:enter|type)\s+(?:the\s+)?(?:otp|one[- ]time (?:password|code)|verification code)\b|\b3-?d\s*secure\b|\bsecure ?code\b/iu;
/** A UPI collect request waiting on the user's phone. */
const UPI_WAIT = /\bapprove\b.{0,60}\b(?:upi|in your upi app)\b|\bwaiting for (?:upi|payment) (?:approval|confirmation)\b/iu;

/** One look at the page (08-2 §10.4's table, in that order: a code or success first, then the waits, then a decline). */
export function classifyPage(p: PageFacts): PageOutcome {
  const code = findConfirmationCode(p.text);
  if (code) return { kind: 'success', code };
  if (SUCCESS.test(p.text)) return { kind: 'success' };
  if (p.hasOtpField || OTP.test(p.text)) return { kind: 'otp' };
  if (UPI_WAIT.test(p.text)) return { kind: 'upi_wait' };
  if (DECLINE.test(p.text)) return { kind: 'decline' };
  return { kind: 'unknown' };
}

/** 08-2 §10.4 numbers. */
export const OUTCOME_MAX_MS = 120_000;
export const OUTCOME_POLL_MS = 2_000;
export const WAIT_MAX_MS = 5 * 60_000;
/** G-M9-07: the history page every 60 s for 10 min. */
export const HISTORY_POLL_MS = 60_000;
export const HISTORY_MAX_MS = 10 * 60_000;

export interface OutcomeTiming {
  maxMs: number;
  pollMs: number;
  waitMaxMs: number;
}

export type FinalOutcome =
  { kind: 'success'; code?: string } | { kind: 'decline' } | { kind: 'timeout'; during: 'otp' | 'upi_wait' } | { kind: 'unknown' };

/**
 * Polls `look` until the page says success or decline. A code or UPI page extends the wait to 5 min (the user answers on their
 * phone or through the code lane); when that runs out it is FAILED (timeout). Anything else after 120 s is unknown → CHECKING.
 */
export async function watchOutcome(
  look: () => Promise<PageFacts | null>,
  sleep: (ms: number) => Promise<void>,
  now: () => number,
  timing: OutcomeTiming = { maxMs: OUTCOME_MAX_MS, pollMs: OUTCOME_POLL_MS, waitMaxMs: WAIT_MAX_MS },
  signal?: AbortSignal,
): Promise<FinalOutcome> {
  const start = now();
  let waitingSince: number | null = null;
  let waitingFor: 'otp' | 'upi_wait' | null = null;
  for (;;) {
    const facts = await look();
    const o = facts ? classifyPage(facts) : { kind: 'unknown' as const };
    if (o.kind === 'success') return o.code ? { kind: 'success', code: o.code } : { kind: 'success' };
    if (o.kind === 'decline') return { kind: 'decline' };
    if (o.kind === 'otp' || o.kind === 'upi_wait') {
      if (waitingFor !== o.kind) {
        waitingFor = o.kind;
        waitingSince = now();
      }
    } else {
      waitingFor = null;
      waitingSince = null;
    }
    const t = now();
    if (waitingFor && waitingSince !== null) {
      if (t - waitingSince >= timing.waitMaxMs) return { kind: 'timeout', during: waitingFor };
    } else if (t - start >= timing.maxMs) return { kind: 'unknown' };
    if (signal?.aborted) return { kind: 'unknown' };
    await sleep(timing.pollMs);
  }
}

/** Link words of a site's own booking or order history page (08-2 §10.5 "the merchant page's order/booking history"). */
const HISTORY_LINK = /\b(?:(?:your|my)\s+(?:bookings|reservations|orders|trips)|(?:booking|order|reservation)\s+history)\b/iu;

export function isHistoryLink(name: string): boolean {
  return HISTORY_LINK.test(name);
}

/**
 * G-M9-07 on the site's history page: the row that names the approved place, and the code on that row (a table row of
 * "TJ8821 · Coastline Kitchen · 8:00 PM · 4 · Confirmed"). Null when no row names the place or the row carries no code.
 */
export function findBookingInHistory(text: string, place: string): string | null {
  const want = place.trim().toLowerCase();
  if (!want) return null;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.toLowerCase().includes(want)) continue;
    const near = findConfirmationCode(line);
    if (near) return near;
    const m = /\b([A-Z]{1,4}\d{3,8}|\d{5,10})\b/u.exec(line);
    if (m) return m[1]!;
  }
  return null;
}
