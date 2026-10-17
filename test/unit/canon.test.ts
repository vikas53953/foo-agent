// RFC 8785 vectors (08-0 §E.7, X-113).
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/shared/canon';

describe('canonicalJson', () => {
  it('sorts keys and drops whitespace', () => expect(canonicalJson({ b: 1, a: [true, null, 'x'] })).toBe('{"a":[true,null,"x"],"b":1}'));
  it('sorts by UTF-16 code units (RFC 8785 §3.2.3)', () => {
    const obj = {
      '€': 'Euro Sign',
      '\r': 'Carriage Return',
      דּ: 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      '😀': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      ö: 'Latin Small Letter O With Diaeresis',
    };
    const out = canonicalJson(obj);
    const at = ['\r', '1', '\u0080', '\u00f6', '\u20ac', '\ud83d\ude00', '\ufb33'].map((k) => out.indexOf(`${JSON.stringify(k)}:`));
    expect(at.every((pos, n) => pos >= 0 && (n === 0 || pos > at[n - 1]!))).toBe(true);
  });
  it('numbers in ES shortest form (RFC 8785 §3.2.2.3)', () => {
    // eslint-disable-next-line no-loss-of-precision -- RFC 8785 test vector
    expect(canonicalJson([333333333.33333329, 1e30, 4.5, 0.002, 1e-27, -0])).toBe('[333333333.3333333,1e+30,4.5,0.002,1e-27,0]');
  });
  it('rejects non-finite numbers', () => expect(() => canonicalJson(NaN)).toThrow());
});
