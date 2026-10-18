// Spec: 08-3 §12.4.1 (sensitive facts, deterministic engine rule, AT-076, R-33: category ∈ {health, money, religion,
// politics, family} OR any of the five regex families, case-insensitive after NFKC, Latin and Devanagari/Gurmukhi; contact
// details count only for another person: `kind='person'`, a `people\` file, or a name in `contacts_index`; sensitive and
// guessed → dropped (`memory.dropped_sensitive`, no chip); sensitive and said → saved with `private` forced on; the AI's
// category never decides saving), 08-3 §12.1 (never saved). Fixture names are made up.
import { describe, expect, it } from 'vitest';
import { isSensitive, sensitiveRule } from '../../src/engine/memory/sensitive';

const fact = (text: string, extra: Partial<Parameters<typeof isSensitive>[0]> = {}) =>
  isSensitive({ text, category: 'other', kind: 'fact', ...extra });

describe('08-3 §12.4.1 (a) category rule', () => {
  it('health, money, religion, politics and family are sensitive whatever the text', () => {
    for (const category of ['health', 'money', 'religion', 'politics', 'family']) {
      expect(fact('Likes long walks', { category })).toBe(true);
    }
  });
  it('the other categories are not, by themselves', () => {
    for (const category of ['food', 'travel', 'people', 'places', 'work', 'style', 'home', 'other']) {
      expect(fact('Likes long walks', { category })).toBe(false);
    }
  });
});

describe('08-3 §12.4.1 (b) regex families', () => {
  it('health: Latin, Devanagari, Gurmukhi', () => {
    for (const t of [
      'Allergic to peanuts',
      'Has DIABETES',
      'Checks BP every morning',
      'Blood pressure is high',
      'Takes thyroid tablets',
      'Sees a doctor on Fridays',
      'Had surgery in May',
      'मूंगफली से एलर्जी है',
      'रोज़ दवा लेते हैं',
      'ਸਵੇਰੇ ਦਵਾਈ ਲੈਂਦੇ ਹਨ',
      'ਡਾਕਟਰ ਕੋਲ ਜਾਣਾ ਹੈ',
    ]) {
      expect(fact(t), t).toBe(true);
    }
  });
  it('money amounts: Latin, Devanagari, Gurmukhi', () => {
    for (const t of [
      'Salary is ₹ 90,000',
      'Rent ₹25000',
      'Pays Rs. 4000 a month',
      'Has a home loan',
      'Car EMI on the 5th',
      'Earns 12 lakh',
      'तनख्वाह महीने की पहली को आती है',
      '500 रुपये उधार दिए',
      'ਤਨਖ਼ਾਹ ਪਹਿਲੀ ਨੂੰ ਆਉਂਦੀ ਹੈ',
    ]) {
      expect(fact(t), t).toBe(true);
    }
  });
  it('religion: Latin, Devanagari, Gurmukhi', () => {
    for (const t of [
      'Goes to the temple on Tuesdays',
      'Keeps a vrat on Mondays',
      'Fasting during Navratri',
      'Reads namaz at 1 PM',
      'हर सुबह पूजा करते हैं',
      'मंदिर जाते हैं',
      'ਐਤਵਾਰ ਨੂੰ ਗੁਰਦੁਆਰਾ ਜਾਂਦੇ ਹਨ',
    ]) {
      expect(fact(t), t).toBe(true);
    }
  });
  it('politics: Latin, Devanagari, Gurmukhi', () => {
    for (const t of ['Voted in the last election', 'Supports a party', 'चुनाव में काम किया', 'वोट देने गए', 'ਵੋਟ ਪਾਈ']) {
      expect(fact(t), t).toBe(true);
    }
  });
  it('contact details are sensitive only for another person', () => {
    const phone = 'Phone +91 98765 43210';
    const home = 'Lives at 14 Hill Road, Bandra';
    const pin = '400050 Linking Road flat';
    expect(fact(phone)).toBe(false);
    expect(fact(home)).toBe(false);
    expect(fact(phone, { kind: 'person' })).toBe(true);
    expect(fact(home, { kind: 'person' })).toBe(true);
    expect(fact(pin, { kind: 'person' })).toBe(true);
    expect(fact('Number is 9876543210', { file: 'memory/people/asha-rao.md' })).toBe(true);
    expect(fact("Kabir's address is 12 MG Marg", { contacts: ['Kabir Mehta'] })).toBe(true);
    expect(fact("Kabir's address is 12 MG Marg", { contacts: ['Zoya Iqbal'] })).toBe(false);
  });
  it('plain facts are not sensitive', () => {
    for (const t of ['Prefers window seats', 'Vegetarian on Tuesdays', 'Likes filter coffee', 'चाय पसंद है']) {
      expect(fact(t), t).toBe(false);
    }
  });
  it('NFKC: full-width Latin and precomposed Gurmukhi (U+0A59) match', () => {
    expect(fact('ＡＬＬＥＲＧＩＣ to dust')).toBe(true);
    expect(fact('ਤਨ\u0A59ਾਹ ਆ ਗਈ')).toBe(true);
  });
});

describe('08-3 §12.4.1 saving rule: the AI label never decides saving', () => {
  it('guessed and sensitive → dropped (no chip), even when the AI labels it food/other', () => {
    expect(sensitiveRule({ text: 'Allergic to peanuts', category: 'food', kind: 'fact', provenance: 'guessed', private: false })).toEqual({
      save: false,
      log: 'memory.dropped_sensitive',
    });
    expect(sensitiveRule({ text: 'Salary is ₹ 90,000', category: 'other', kind: 'fact', provenance: 'guessed', private: false })).toEqual({
      save: false,
      log: 'memory.dropped_sensitive',
    });
  });
  it('said and sensitive → saved with private forced on', () => {
    expect(sensitiveRule({ text: 'Allergic to peanuts', category: 'food', kind: 'fact', provenance: 'said', private: false })).toEqual({
      save: true,
      sensitive: true,
      private: true,
    });
  });
  it('not sensitive → saved as asked', () => {
    expect(
      sensitiveRule({ text: 'Prefers window seats', category: 'travel', kind: 'preference', provenance: 'guessed', private: false }),
    ).toEqual({
      save: true,
      sensitive: false,
      private: false,
    });
    expect(sensitiveRule({ text: 'Likes filter coffee', category: 'food', kind: 'fact', provenance: 'said', private: true })).toEqual({
      save: true,
      sensitive: false,
      private: true,
    });
  });
});
