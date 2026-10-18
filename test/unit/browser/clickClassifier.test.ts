// Spec: 08-2 §8.2.1 (a browser.click is `read` unless the target is a commit control: a button/link/input whose accessible name
// or nearby text matches the commit regex (+ the Hindi forms of 5.3.1) inside a form, or whose form has payment/password
// fields; commit clicks are refused with USE_SUBMIT), §8.3.5 (`confirm()` dialogs are commit controls).
import { describe, expect, it } from 'vitest';
import { classify, isCommitText, type ElementFacts } from '../../../src/engine/tools/browser/clickClassifier';

const el = (o: Partial<ElementFacts>): ElementFacts => ({
  tag: 'button',
  type: '',
  role: 'button',
  name: '',
  nearbyText: '',
  inForm: true,
  formHasSensitive: false,
  ...o,
});

describe('08-2 §8.2.1 commit regex', () => {
  it.each(['Pay ₹1,240', 'Place order', 'Book table', 'Confirm', 'Reserve now', 'Purchase', 'Buy now', 'Send', 'Post', 'Submit', 'Delete', 'Cancel booking', 'Cancel reservation', 'Complete', 'Checkout now'])(
    'matches %s',
    (s) => expect(isCommitText(s)).toBe(true),
  );
  it.each(['बुक करें', 'ਬੁੱਕ ਕਰੋ', 'खरीदें', 'ਖਰੀਦੋ', 'भुगतान करें', 'ਭੁਗਤਾਨ', 'भेजें', 'ਭੇਜੋ', 'हटाओ', 'ਮਿਟਾਓ', 'book karo', 'bhej do', 'hata do'])(
    'matches the 5.3.1 Hindi / Punjabi form %s',
    (s) => expect(isCommitText(s)).toBe(true),
  );
  it.each(['Search', 'Next', 'Show more', 'Cancel', 'Menu', 'Filters'])('does not match %s', (s) => expect(isCommitText(s)).toBe(false));
});

describe('08-2 §8.2.1 classify', () => {
  it('a "Pay" button inside a form is a commit control', () => {
    expect(classify(el({ name: 'Pay' }))).toBe('commit');
  });
  it('the same button outside a form is a read click (the rule is "inside a form")', () => {
    expect(classify(el({ name: 'Pay', inForm: false }))).toBe('read');
  });
  it('commit words in the nearby text count', () => {
    expect(classify(el({ name: 'Go', nearbyText: 'Confirm your table for 4' }))).toBe('commit');
  });
  it('any control of a form with payment or password fields is a commit control', () => {
    expect(classify(el({ name: 'Next', formHasSensitive: true }))).toBe('commit');
    expect(classify(el({ tag: 'input', type: 'submit', role: 'button', name: 'Go', formHasSensitive: true }))).toBe('commit');
  });
  it('links and inputs count as controls; plain text does not', () => {
    expect(classify(el({ tag: 'a', role: 'link', name: 'Book now' }))).toBe('commit');
    expect(classify(el({ tag: 'input', type: 'submit', role: 'button', name: 'Submit' }))).toBe('commit');
    expect(classify(el({ tag: 'div', role: '', name: 'Book now' }))).toBe('read');
  });
  it('a search button in a search form is a read click', () => {
    expect(classify(el({ name: 'Search', nearbyText: 'Find restaurants near you' }))).toBe('read');
  });
});
