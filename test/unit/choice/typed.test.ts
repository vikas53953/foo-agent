// Spec: 08-4 §26.6 (typed answers to Choice cards: normalise, then digit / option n / ordinals in English, Hinglish,
// Devanagari and Gurmukhi → label or detail equality → the token rule → reaction 1️⃣–4️⃣ → skip words (only when Skip
// shows) → multi-select split → a tie is not an answer), 05-1 §5.3.4 (all answers give the identical summary; two cards → the
// newest), 10-1 AT-016 (setup half, G-M5-11), AT-035, AT-035a, CR-0009 G-M5-09 (the toast's best-fit answer).
import { describe, expect, it } from 'vitest';
import { pickCard, reactionAnswer, toastAnswer, typedAnswer, type AnswerableCard } from '../../../src/engine/cards/typedAnswer';

const flights: AnswerableCard = {
  purpose: 'job',
  options: [
    { id: 'o1', label: '10:15 AM · IndiGo · ₹5,240', detail: 'No early start, you said you hate those' },
    { id: 'o2', label: '7:10 AM · Air India · ₹4,890', detail: 'Cheapest, leaves early' },
    { id: 'o3', label: '1:35 PM · Akasa Air · ₹5,610' },
  ],
};
const ans = (optionId: string) => ({ kind: 'answer', answer: { optionId } });

describe('08-4 §26.6 rule 1: digit, option n, ordinals', () => {
  it.each([
    ['2', 'o2'],
    [' 2 ', 'o2'],
    ['"2"', 'o2'],
    ['2.', 'o2'],
    ['3!', 'o3'],
    ['option 1', 'o1'],
    ['Option 3', 'o3'],
    ['second', 'o2'],
    ['the second one', 'o2'],
    ['The Third', 'o3'],
    ['first one', 'o1'],
    ['doosra wala', 'o2'],
    ['pehla', 'o1'],
    ['teesra vaala', 'o3'],
    ['दूसरा', 'o2'],
    ['पहला', 'o1'],
    ['ਦੂਜਾ', 'o2'],
    ['ਤੀਜਾ wala', 'o3'],
  ])('"%s" → %s', (text, id) => expect(typedAnswer(text, flights)).toEqual(ans(id)));

  it('a number past the last option is not an answer', () => {
    expect(typedAnswer('4', flights)).toEqual({ kind: 'none' });
    expect(typedAnswer('fourth', flights)).toEqual({ kind: 'none' });
    expect(typedAnswer('chautha', flights)).toEqual({ kind: 'none' });
  });
  it('5 and 0 are never options', () => {
    expect(typedAnswer('5', flights)).toEqual({ kind: 'none' });
    expect(typedAnswer('0', flights)).toEqual({ kind: 'none' });
  });
});

describe('08-4 §26.6 rule 2: the text equals a label or a detail', () => {
  it('label, case and punctuation ignored', () => expect(typedAnswer('10:15 am · indigo · ₹5,240', flights)).toEqual(ans('o1')));
  it('detail', () => expect(typedAnswer('cheapest leaves early', flights)).toEqual(ans('o2')));
});

describe('08-4 §26.6 rule 3: every token in exactly one option', () => {
  it.each([
    ['the 7:10 one', 'o2'],
    ['IndiGo', 'o1'],
    ['indigo please', 'o1'],
    ['akasa wala', 'o3'],
    ['air india ka', 'o2'],
    ['cheapest', 'o2'],
  ])('"%s" → %s', (text, id) => expect(typedAnswer(text, flights)).toEqual(ans(id)));

  it('a token in no option is not an answer', () => expect(typedAnswer('vistara', flights)).toEqual({ kind: 'none' }));
  it('one-grapheme tokens are dropped (only stop-words and single letters left → no answer)', () =>
    expect(typedAnswer('the a', flights)).toEqual({ kind: 'none' }));
  it('a sentence that is a steer, not an answer, falls through', () =>
    expect(typedAnswer('only look at morning flights with free meals', flights)).toEqual({ kind: 'none' }));
});

describe('AT-035a · 08-4 §26.6 rule 7: a tie is not an answer', () => {
  it('two options hold "air" → "Did you mean {a} or {b}?" with the first two labels', () =>
    expect(typedAnswer('air', flights)).toEqual({ kind: 'tie', a: flights.options[1]!.label, b: flights.options[2]!.label }));
  it('AT-035a: two open cards that the same text answers → the newest card; the other stays open', () => {
    const older = { ...flights, id: 'k1', createdAt: 1 };
    const newer = { ...flights, id: 'k2', createdAt: 2 };
    expect(pickCard('2', [older, newer])).toEqual({ card: newer, result: ans('o2') });
    expect(pickCard('2', [newer, older])).toEqual({ card: newer, result: ans('o2') });
  });
  it('AT-035a: the older card answers when only it matches', () => {
    const older = { ...flights, id: 'k1', createdAt: 1 };
    const newer = {
      id: 'k2',
      createdAt: 2,
      purpose: 'job' as const,
      options: [
        { id: 'o1', label: 'Window' },
        { id: 'o2', label: 'Aisle' },
      ],
    };
    expect(pickCard('indigo', [older, newer])).toEqual({ card: older, result: ans('o1') });
  });
  it('AT-035a: a tie on the newest card is the answer for that message (no older card takes it)', () => {
    const older = {
      id: 'k1',
      createdAt: 1,
      purpose: 'job' as const,
      options: [
        { id: 'o1', label: 'Air' },
        { id: 'o2', label: 'Rail' },
      ],
    };
    const newer = { ...flights, id: 'k2', createdAt: 2 };
    expect(pickCard('air', [older, newer])?.result.kind).toBe('tie');
  });
  it('no card matches → null (the message falls through to steer or intake)', () =>
    expect(pickCard('what about Sunday?', [{ ...flights, id: 'k1', createdAt: 1 }])).toBeNull());
});

describe('08-4 §26.6 rule 4: reactions 1️⃣–4️⃣ answer Choice cards', () => {
  it.each([
    ['1️⃣', 'o1'],
    ['2️⃣', 'o2'],
    ['3️⃣', 'o3'],
  ])('%s → %s', (emoji, id) => expect(reactionAnswer(emoji, flights)).toEqual(ans(id)));
  it('4️⃣ on a 3-option card, 👍 and ✅ are not answers', () => {
    expect(reactionAnswer('4️⃣', flights)).toEqual({ kind: 'none' });
    expect(reactionAnswer('👍', flights)).toEqual({ kind: 'none' });
    expect(reactionAnswer('✅', flights)).toEqual({ kind: 'none' });
  });
});

describe('08-4 §26.6 rule 5: skip words, only when the card shows Skip', () => {
  it.each(['skip', 'Skip it', 'rehne do', 'छोड़ो', 'ਛੱਡੋ'])('"%s" → skip', (text) =>
    expect(typedAnswer(text, flights)).toEqual({ kind: 'answer', answer: { skip: true } }),
  );
  it('file_in and photo_notice cards show no Skip, so "skip" is not an answer', () => {
    expect(typedAnswer('skip', { ...flights, purpose: 'file_in' })).toEqual({ kind: 'none' });
    expect(typedAnswer('skip', { ...flights, purpose: 'photo_notice' })).toEqual({ kind: 'none' });
  });
});

describe('08-4 §26.6 rule 6: multi-select split', () => {
  const subs: AnswerableCard = {
    purpose: 'job',
    multi: true,
    options: [
      { id: 'o1', label: 'Netflix' },
      { id: 'o2', label: 'Spotify' },
      { id: 'o3', label: 'Hotstar' },
      { id: 'o4', label: 'Cult.fit' },
    ],
  };
  it.each([
    ['1, 2', ['o1', 'o2']],
    ['netflix and spotify', ['o1', 'o2']],
    ['Netflix aur Hotstar', ['o1', 'o3']],
    ['1 और 4', ['o1', 'o4']],
    ['spotify, cult.fit and 1', ['o2', 'o4', 'o1']],
    ['2', ['o2']],
  ])('"%s" → %j', (text, ids) => expect(typedAnswer(text, subs)).toEqual({ kind: 'answer', answer: { optionIds: ids } }));
  it('any part unresolved → not an answer', () => expect(typedAnswer('netflix and prime', subs)).toEqual({ kind: 'none' }));
  it('a repeated part counts once', () =>
    expect(typedAnswer('1, netflix', subs)).toEqual({ kind: 'answer', answer: { optionIds: ['o1'] } }));
});

describe('AT-035 · typed "2" or 2️⃣ answer exactly as a tap on option 2', () => {
  it('AT-035: "2", "the second one", "doosra wala" and 2️⃣ all give { optionId: "o2" }, as the tap does', () => {
    const tap = { optionId: 'o2' };
    for (const text of ['2', 'the second one', 'doosra wala']) expect(typedAnswer(text, flights)).toEqual({ kind: 'answer', answer: tap });
    expect(reactionAnswer('2️⃣', flights)).toEqual({ kind: 'answer', answer: tap });
  });
});

describe('AT-016 · Choice cards with purpose setup (G-M5-11)', () => {
  const setup: AnswerableCard = {
    purpose: 'setup',
    options: [
      { id: 'o1', label: 'Morning', detail: '8:00 AM' },
      { id: 'o2', label: 'Evening', detail: '7:00 PM' },
    ],
  };
  it('AT-016: a typed answer on a setup interview card resolves it exactly as a tap would', () => {
    expect(typedAnswer('evening', setup)).toEqual(ans('o2'));
    expect(typedAnswer('2', setup)).toEqual(ans('o2'));
    expect(typedAnswer('8:00 AM', setup)).toEqual(ans('o1'));
  });
});

describe('stepper cards (08-1 §4.5: one card per question)', () => {
  it('a stepper card is one question, so typing answers it like any card', () =>
    expect(typedAnswer('1', { ...flights, stepper: { index: 2, total: 3 } } as AnswerableCard)).toEqual(ans('o1')));
});

describe('G-M5-09 · the toast best-fit answer (fake notifier)', () => {
  it('the first toast button answers option 1 with resolved_by toast', () =>
    expect(toastAnswer(flights)).toEqual({ answer: { optionId: 'o1' }, resolvedBy: 'toast' }));
  it('a card with no Best fit (file_in) gets no answer button', () => expect(toastAnswer({ ...flights, purpose: 'file_in' })).toBeNull());
});
