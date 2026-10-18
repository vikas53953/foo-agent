// Spec: 04-2 §22.4 (the text is checked after NFKC with zero-width characters removed), Art. 8. M2 review S5: invisible
// characters (soft hyphen, invisible operators, BOM, other default-ignorable code points) must not split a key past the
// patterns; the catch still masks the span the user sees.
import { describe, expect, it } from 'vitest';
import { checkSecret, findSecrets, normalise, redactSecrets } from '../../src/shared/redactor';

const KEY = 'sk-proj-abcdefghij1234567890ABCDEFGHIJ';
const INVISIBLE = ['­', '​', '‌', '‍', '⁠', '⁡', '⁢', '⁣', '⁤', '﻿', '᠎', '͏'];

describe('invisible characters cannot split a secret (review S5)', () => {
  it('the reviewer’s cases: soft hyphen and U+2063 inside an sk-proj- key', () => {
    expect(checkSecret('sk-proj-abcd­efghij1234567890ABCDEFGHIJ')?.kind).toBe('ai_key');
    expect(checkSecret('sk-proj-abcd⁣efghij1234567890ABCDEFGHIJ')?.kind).toBe('ai_key');
  });

  it.each(INVISIBLE.map((c) => [c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), c]))(
    'U+%s between every few characters is still caught and the whole visible span is masked',
    (_, c) => {
      const split = KEY.replace(/(.{4})/g, `$1${c}`);
      const text = `use ${split} now`;
      const hit = findSecrets(text)[0];
      expect(hit?.kind).toBe('ai_key');
      expect(text.slice(hit!.start, hit!.end).replaceAll(c, '')).toBe(KEY);
      expect(redactSecrets(text).text).not.toContain('abcd');
    },
  );

  it('normalise drops them and keeps the map to the original offsets', () => {
    const n = normalise('a­b⁤c');
    expect(n.text).toBe('abc');
    expect(n.map).toEqual([0, 2, 4, 5]);
  });

  it('ordinary text with invisible characters is not a secret', () => {
    expect(checkSecret('see­you to​morrow at 5')).toBeNull();
    expect(checkSecret('नम‍स्ते, call me at 98765 43210')).toBeNull();
  });
});
