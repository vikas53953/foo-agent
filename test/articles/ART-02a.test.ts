// ART-02a (10-2 §D, Article 2): no banned technical word in any UI string. Same regex as 10-acceptance-2 ART-02a.
// ART-02d (X-79): no "toast(s)" on screen.
import { describe, expect, it } from 'vitest';
import { BANNED } from '../../scripts/check-copy';
import { uiStrings } from './scan';

describe('ART-02a banned words', () => {
  it.each(uiStrings())('$key', ({ text }) => {
    expect(text.match(BANNED)).toBeNull();
    expect(text.match(/\btoasts?\b/i)).toBeNull();
  });
});
