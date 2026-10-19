// Spec: 08-4 §28.4 (people / quantity: the four pattern families, number words in four scripts, a number next to a time, a
// date or ₹ ignored, the latest statement wins).
import { describe, expect, it } from 'vitest';
import { extractCounts, latestCount } from '../../../src/engine/gate/extractCounts';

describe('extractCounts (08-4 §28.4)', () => {
  it.each([
    ['Book a table for 4 at Toit', 4],
    ['table for 2 please', 2],
    ['party of 6', 6],
    ['tickets x 3', 3],
    ['tickets × 3', 3],
    ['we are 5 people', 5],
    ['8 guests on Saturday', 8],
    ['2 pax', 2],
    ['3 log aayenge', 3],
    ['4 bande', 4],
    ['5 जन', 5],
    ['6 लोग', 6],
    ['7 ਲੋਕ', 7],
    ['2 ਜਣੇ', 2],
    ['table for four', 4],
    ['twelve people', 12],
    ['table for chaar', 4],
    ['do log', 2],
    ['तीन लोग', 3],
    ['ਪੰਜ ਲੋਕ', 5],
  ])('%s → %i', (text, n) => {
    expect(extractCounts(text)).toBe(n);
  });

  it.each([
    ['Book for 8 pm', null],
    ['for 7:30', null],
    ['for 12 Oct', null],
    ['for ₹2', null],
    ['Book a table at Toit', null],
    ['a table for 4 at 8 pm', 4],
  ])('ignores a number next to a time, a date or ₹: %s', (text, n) => {
    expect(extractCounts(text)).toBe(n);
  });

  it('the last count in a text wins', () => {
    expect(extractCounts('table for 4, no wait, make it for 6')).toBe(6);
  });

  it('the latest statement with a count wins', () => {
    expect(latestCount(['table for 4 on Saturday', 'actually we are 3 people', 'and near the window'])).toBe(3);
    expect(latestCount(['Book a table'])).toBeNull();
  });
});
