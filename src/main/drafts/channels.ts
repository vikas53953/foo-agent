// Spec: 08-3 §16.3 (X drafts: weighted length by `twitter-text` `parseTweet(text).weightedLength`, URLs 23, CJK 2; > 280 →
// "Too long for X by {n} characters."; `x.openCompose` → `https://x.com/intent/post?text=` + encodeURIComponent(text)),
// §16.4 Send (≤ 30 WhatsApp sends a day: counter = COUNT(activity WHERE event='sent_whatsapp' AND at ≥ local midnight);
// the limit line names the next local midnight, X-129, 08-0 §H.2). M8 T7: the channel helpers the Draft service uses.
import twitter from 'twitter-text';
import type { Db } from '../store/db';

/** 08-3 §16.3: an X post holds 280 weighted characters. */
export const X_MAX = 280;
/** 08-3 §16.4 Send: at most 30 WhatsApp sends a day `[foo decision: lower ban risk on an unofficial link]`. */
export const WA_DAILY_LIMIT = 30;

/** 280 minus the post's weighted length; below 0 it is too long by that many. */
export function xRemaining(text: string): number {
  return X_MAX - twitter.parseTweet(text).weightedLength;
}

/** X's compose page with the text filled in; foo never posts (AT-054). */
export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

/** The instant of local midnight at the start of `now`'s day (`days` = 1 for the next one) in the zone. */
export function localMidnight(now: number, timeZone: string, days = 0): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const guess = Date.UTC(part('year'), part('month') - 1, part('day') + days);
  // Shift by the zone's offset at that instant so the result is 00:00 local time (as jobCards.nextMonthStart does).
  const local = new Date(new Date(guess).toLocaleString('en-US', { timeZone })).getTime();
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return guess - (local - utc);
}

/** WhatsApp messages foo sent since local midnight (08-0 §H.2). */
export function waSentToday(db: Db, now: number, timeZone: string): number {
  return db
    .prepare("SELECT COUNT(*) FROM activity WHERE event = 'sent_whatsapp' AND at >= ?")
    .pluck()
    .get(localMidnight(now, timeZone)) as number;
}
