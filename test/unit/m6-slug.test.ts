// Spec: 08-3 §12.2 (slug: NFKC, lower-case, spaces → `-`, keep `\p{L}\p{N}-`, ≤ 40, Devanagari/Gurmukhi kept as written,
// `people\माँ.md` is legal, then `safeName()`; topics travel, food, shopping, work, home, family, style, brief, other, anything
// else → other), §12.4 (preference topic = the category when it is a legal topic, else `other`), 08-0 §E.7 `safeName()`.
import { describe, expect, it } from 'vitest';
import { PREFERENCE_TOPICS, slug, topicOf } from '../../src/engine/memory/slug';

describe('08-3 §12.2 people slug', () => {
  it('lower-cases, turns spaces into -, drops other characters', () => {
    expect(slug('Asha Rao')).toBe('asha-rao');
    expect(slug("Ravi's boss (work)")).toBe('ravis-boss-work');
    expect(slug('Dr. Meena K.')).toBe('dr-meena-k');
  });

  it('applies NFKC first (full-width letters, ligatures)', () => {
    expect(slug('Ｋｉｒａｎ')).toBe('kiran');
    expect(slug('ﬁona')).toBe('fiona');
  });

  it('keeps Devanagari and Gurmukhi as written (`माँ` is legal)', () => {
    expect(slug('माँ')).toBe('माँ');
    expect(slug('बड़े भैया')).toBe('बड़े-भैया');
    expect(slug('ਬੀਬੀ ਜੀ')).toBe('ਬੀਬੀ-ਜੀ');
  });

  it('is at most 40 characters', () => {
    const s = slug('a'.repeat(30) + ' ' + 'b'.repeat(30));
    expect([...s].length).toBeLessThanOrEqual(40);
    expect(s).toBe('a'.repeat(30) + '-' + 'b'.repeat(9));
  });

  it('ends with safeName(): reserved Windows names get a `_` prefix, empty becomes `file`', () => {
    expect(slug('Con')).toBe('_con');
    expect(slug('!!!')).toBe('file');
  });
});

describe('08-3 §12.2 preference topics', () => {
  it('has exactly the nine topics', () => {
    expect([...PREFERENCE_TOPICS]).toEqual(['travel', 'food', 'shopping', 'work', 'home', 'family', 'style', 'brief', 'other']);
  });
  it('a legal topic is kept; anything else is other', () => {
    expect(topicOf('travel')).toBe('travel');
    expect(topicOf('food')).toBe('food');
    expect(topicOf('health')).toBe('other');
    expect(topicOf('money')).toBe('other');
    expect(topicOf('Travel')).toBe('other');
  });
});
