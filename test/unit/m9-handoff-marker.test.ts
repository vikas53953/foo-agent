// Spec: 05-3 §5.18.1 (handoff marker: centred line; helper names are Link buttons that open that helper's chat; copy for
// foo → helper, helper back, helper → helper), §5.18.3 (names are Tab stops; `thread-marker-link` with `data-index`),
// 04 §19.3 (a dot in the helper's colour before the name), CR-0013 G-M9-04 (rendered from seeded rows).
import { describe, expect, it } from 'vitest';
import { handoffParts } from '../../src/renderer/messages/handoffParts';

const trips = { id: 'h_t', name: 'Trips', chatId: 'c_t', colorToken: '--h-terracotta' };
const money = { id: 'h_m', name: 'Money', chatId: 'c_m', colorToken: '--h-teal' };

describe('handoff marker parts (05-3 §5.18.1)', () => {
  it('foo → helper: the helper name is link 0', () => {
    expect(handoffParts('foo asked Trips to find flights to Delhi on Fri 23 Oct', [trips, money])).toEqual([
      { text: 'foo asked ' },
      { helper: trips, index: 0 },
      { text: ' to find flights to Delhi on Fri 23 Oct' },
    ]);
  });

  it('helper → helper: both names are links, in reading order', () => {
    expect(handoffParts('Trips told Money about ₹14,600 for Taj Holiday Village', [money, trips])).toEqual([
      { helper: trips, index: 0 },
      { text: ' told ' },
      { helper: money, index: 1 },
      { text: ' about ₹14,600 for Taj Holiday Village' },
    ]);
  });

  it('a name only counts as a whole word with its capital ("money" in the task is text)', () => {
    expect(handoffParts('foo asked Money to save money for Moneyball', [money])).toEqual([
      { text: 'foo asked ' },
      { helper: money, index: 0 },
      { text: ' to save money for Moneyball' },
    ]);
  });

  it('no known helper in the line: plain text', () => {
    expect(handoffParts('You made a new helper: Cooking', [trips])).toEqual([{ text: 'You made a new helper: Cooking' }]);
  });
});
