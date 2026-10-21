// Spec: 08-4 §26.1 slot cleaning (X-185, CR-0027 §(d)): curly quotes → ', dashes → -, ; → ,, other characters outside the slot rule
// → a space, spaces collapsed and trimmed, over 40 characters cut at the last word break that fits, trailing joiners
// dropped; a slot with nothing left or a banned word still → generic_working.
import { describe, expect, it } from 'vitest';
import { cleanSlot, phraseText, resolvePhrase, SLOT_RE } from '../../src/shared/phrases';

/** Details a real Claude CLI wrote, or would write, for plan steps. */
const REAL = [
  'the best budget phones under 15,000 rupees in India',
  'Delhi–Mumbai flights on Friday',
  '“Which phone has the best camera?”',
  'restaurants near CP — rooftop, veg-friendly',
  'Is there a table for 2 at 8 PM?!',
  'Redmi, Realme & Samsung (under ₹15k)',
  'price; battery; camera',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];

describe('slot cleaning (CR-0027 §(d))', () => {
  it('turns real AI details into slots that pass the rule', () => {
    expect(REAL.map(cleanSlot)).toEqual([
      'the best budget phones under 15,000',
      'Delhi-Mumbai flights on Friday',
      'Which phone has the best camera',
      'restaurants near CP - rooftop',
      'Is there a table for 2 at 8 PM',
      'Redmi, Realme & Samsung (under ₹15k)',
      'price, battery, camera',
      'a'.repeat(40),
    ]);
    for (const v of REAL) expect(SLOT_RE.test(cleanSlot(v)), v).toBe(true);
  });

  it('is idempotent and leaves a valid slot as it is', () => {
    for (const v of [...REAL, 'MakeMyTrip', "Raj's café", '₹8,000 a night', '3 budget phones']) {
      expect(cleanSlot(cleanSlot(v))).toBe(cleanSlot(v));
    }
    expect(cleanSlot('MakeMyTrip')).toBe('MakeMyTrip');
    expect(cleanSlot('₹8,000 a night')).toBe('₹8,000 a night');
  });

  it('a long detail ends on a whole word, never on a joiner', () => {
    expect(cleanSlot('flights from Delhi to Mumbai and Goa, plus hotels')).toBe('flights from Delhi to Mumbai and Goa');
    expect(cleanSlot('compare the Redmi Note 13 and Realme Narzo 70 / Samsung M15')).toBe('compare the Redmi Note 13 and Realme');
  });

  it('the rows read the AI words instead of "Work on it"', () => {
    const r = resolvePhrase('look_for', { what: REAL[0] });
    expect(r.key).toBe('look_for');
    expect(phraseText(r.key, 'next', r.slots)).toBe('Look for the best budget phones under 15,000');
    const c = resolvePhrase('compare', { what: REAL[1] }, { inPlan: true });
    expect(phraseText(c.key, 'running', c.slots)).toBe('Comparing Delhi-Mumbai flights on Friday');
  });

  it('Hindi and Punjabi details keep their vowel signs (X-185 adds \\p{M} to the rule)', () => {
    expect(cleanSlot('दिल्ली मुंबई')).toBe('दिल्ली मुंबई');
    expect(cleanSlot('ਅੰਮ੍ਰਿਤਸਰ ਦੀਆਂ ਟਰੇਨਾਂ?')).toBe('ਅੰਮ੍ਰਿਤਸਰ ਦੀਆਂ ਟਰੇਨਾਂ');
    const r = resolvePhrase('look_for', { what: 'दिल्ली मुंबई' });
    expect(r.key).toBe('look_for');
  });

  it('the cut counts code points, never splitting a letter outside the basic plane', () => {
    const v = `${'a'.repeat(39)}\u{1D400}b`;
    const c = cleanSlot(v);
    expect(Array.from(c)).toHaveLength(40);
    expect(SLOT_RE.test(c)).toBe(true);
    expect(cleanSlot(c)).toBe(c);
  });

  it('nothing left, or a banned word, still falls back', () => {
    expect(resolvePhrase('look_for', { what: '???' }).key).toBe('generic_working');
    expect(resolvePhrase('look_for', { what: '“”' }).key).toBe('generic_working');
    expect(resolvePhrase('look_for', { what: 'cheap models?' }, { isBanned: (s) => s.includes('models') }).key).toBe('generic_working');
  });
});
