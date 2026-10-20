// Spec: 08-2 §5.3.4 (X-81: a request to book or pay for a flight → the fixed reply; a compare job never gains a book, buy or
// pay verb), 07-1 §7.0.8. The detector is a fixed lexicon: a booking verb whose object is a flight.
import { describe, expect, it } from 'vitest';
import { compareOnlyVerbs, isFlightBooking } from '../../src/engine/jobs/flights';

describe('08-2 §5.3.4 flight detector', () => {
  it.each([
    'book me a flight to Goa on Sat 12 Dec',
    'Book two flights to Delhi',
    'buy the cheapest air ticket to Pune',
    'reserve a return flight for us',
    'pay for my flight',
  ])('"%s" is a flight booking', (text) => expect(isFlightBooking(text)).toBe(true));

  it.each([
    'compare flights to Goa',
    'book a hotel near the airport after my flight',
    'is my flight on time',
    'book a table for 4',
    'get my flight details',
    'get me the flight times to Goa',
  ])('"%s" is not', (text) => expect(isFlightBooking(text)).toBe(false));

  it('a flight ask keeps only verbs that cannot book or pay', () => {
    expect(compareOnlyVerbs('book me a flight and send it to Asha', ['book', 'send'])).toEqual(['send']);
    expect(compareOnlyVerbs('book a table', ['book'])).toEqual(['book']);
  });
});
