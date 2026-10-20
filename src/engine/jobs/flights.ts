// Spec: 08-2 §5.3.4 (flights, X-81: a request to book or pay for a flight never creates a Payment or booking Approval card;
// foo replies `thread.flight_scope.body` with [ `thread.flight_scope.button.compare` ] and link
// `thread.flight_scope.button.not_now` and offers compare-and-open), 07-1 §7.0.8 (compare, then open the chosen page in Edge
// and hand over; no passenger details, booking or paying in v1), 08-0 §H, AT-157. The detector is a fixed lexicon matched
// before the AI, like 08-2 §5.3.1's verbs: a booking verb whose object is a flight ("book me a flight", "buy two air
// tickets"), not a flight named elsewhere in the sentence ("book a hotel near the airport after my flight").
import { t } from '../../shared/copy/t';

const FILLER = String.raw`(?:\s+(?:me|us|him|her|them|a|an|the|my|our|one|two|three|four|cheap|cheapest|return|one-way|round-trip|\d+))*`;
const FLIGHT_BOOKING = new RegExp(
  String.raw`\b(?:book|reserve|buy|purchase|pay for)\b${FILLER}\s+(?:flights?|plane tickets?|air tickets?|air fare)\b`,
  'iu',
);
const VERBS = new Set(['book', 'buy', 'pay']);

/** "book me a flight to Goa on Sat 12 Dec" → true. */
export const isFlightBooking = (text: string): boolean => FLIGHT_BOOKING.test(text);

/** A compare job for a flight never gains a book, buy or pay verb (no card can follow from it). */
export const compareOnlyVerbs = <V extends string>(text: string, verbs: readonly V[]): V[] =>
  isFlightBooking(text) ? verbs.filter((v) => !VERBS.has(v)) : [...verbs];

/** The fixed reply: one Choice card whose question is the body, [ Compare flights ] and "Not now" (05-1 §5.3 offer shape). */
export function flightScopePayload(messageId: string) {
  return {
    purpose: 'job' as const,
    question: t('thread.flight_scope.body'),
    options: [
      { id: 'o1' as const, label: t('thread.flight_scope.button.compare') },
      { id: 'o2' as const, label: t('thread.flight_scope.button.not_now') },
    ],
    aiReversible: false,
    reversible: false,
    livePrices: false,
    flightScope: { messageId },
  };
}
