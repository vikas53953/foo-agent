// Spec: 08-4 §26.7 (choice-card engine fields: ids o1…o4, Best fit o1, livePrices via parseInr, effectiveReversible only for
// an AI-reversible read-only ask with no prices and no dates or times; both aiReversible and reversible stored; purpose 'job').
import { describe, expect, it } from 'vitest';
import { choiceFields, holdsDateOrTime, holdsInr } from '../../../src/engine/cards/choiceFields';

const ro = { intent: 'read_only' as const };

describe('08-4 §26.7 choice engine fields', () => {
  it('ids o1…o4 in order, Best fit on o1 only, purpose job', () => {
    const p = choiceFields({ question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Blue', detail: 'darker' }, { label: 'Green' }] }, ro);
    expect(p.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(p.options.map((o) => o.bestFit ?? false)).toEqual([true, false, false]);
    expect(p.options[1]).toEqual({ id: 'o2', label: 'Blue', detail: 'darker' });
    expect(p.purpose).toBe('job');
    expect(p.multi).toBe(false);
  });

  it('reversible only when the AI said so, the job is read_only, and no price, date or time appears', () => {
    const spec = { question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Blue' }], reversible: true };
    expect(choiceFields(spec, ro)).toMatchObject({ aiReversible: true, reversible: true, livePrices: false });
    expect(choiceFields(spec, { intent: 'do' })).toMatchObject({ aiReversible: true, reversible: false });
    expect(choiceFields({ ...spec, reversible: false }, ro)).toMatchObject({ aiReversible: false, reversible: false });
    expect(choiceFields({ ...spec, reversible: undefined }, ro)).toMatchObject({ aiReversible: false, reversible: false });
    expect(choiceFields(spec, null)).toMatchObject({ reversible: false });
  });

  it('a price makes livePrices true and the card not reversible', () => {
    const p = choiceFields(
      { question: 'Which flight?', options: [{ label: 'IndiGo · ₹5,240' }, { label: 'Air India', detail: '₹4,890' }], reversible: true },
      ro,
    );
    expect(p).toMatchObject({ livePrices: true, reversible: false, aiReversible: true });
  });

  it('a date or time in an option makes it not reversible', () => {
    const p = choiceFields({ question: 'When?', options: [{ label: 'Morning slot', detail: '10:15' }, { label: 'Later' }], reversible: true }, ro);
    expect(p).toMatchObject({ livePrices: false, reversible: false });
  });

  it.each(['₹5,240', 'IndiGo · ₹5,240', '₹ 1,23,450.50 total', '₹4890'])('"%s" holds an amount', (s) => expect(holdsInr(s)).toBe(true));
  it.each(['5,240', 'Rs 500', 'no price', '₹'])('"%s" holds none', (s) => expect(holdsInr(s)).toBe(false));
  it.each(['10:15 AM', '7 pm', '18 Dec', 'Dec 18', 'Fri', 'Sunday', '18/12', 'tomorrow'])('"%s" holds a date or time', (s) =>
    expect(holdsDateOrTime(s)).toBe(true));
  it.each(['Netflix', 'Window seat', 'Cult.fit', 'free cancellation'])('"%s" holds none', (s) => expect(holdsDateOrTime(s)).toBe(false));
});
