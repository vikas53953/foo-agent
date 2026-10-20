// Spec: 02 §F7.1 "Chat list" [X-179, CR-0021]: the FLIP offsets a list change starts rows from (old top − new top), new
// rows arriving, and the 30ms result stagger capped so a long list is never slow.
import { describe, expect, it } from 'vitest';
import { flipPlan, STAGGER_CAP, staggerIndex } from '../../src/renderer/chatlist/motion';

const tops = (pairs: [string, number][]) => new Map(pairs);

describe('flipPlan', () => {
  it('the first measure animates nothing', () => {
    expect(
      flipPlan(
        new Map(),
        tops([
          ['a', 0],
          ['b', 72],
        ]),
      ),
    ).toEqual({ moves: [], arrivals: [] });
  });

  it('a new chat at the top arrives and pushes the others down one 72px row', () => {
    const plan = flipPlan(
      tops([
        ['a', 0],
        ['b', 72],
      ]),
      tops([
        ['n', 0],
        ['a', 72],
        ['b', 144],
      ]),
    );
    expect(plan.arrivals).toEqual(['n']);
    expect(plan.moves).toEqual([
      { id: 'a', dy: -72 },
      { id: 'b', dy: -72 },
    ]);
  });

  it('a chat pinned from the bottom starts 144px below its new top; rows it passes start 72px above', () => {
    const plan = flipPlan(
      tops([
        ['a', 0],
        ['b', 72],
        ['c', 144],
      ]),
      tops([
        ['c', 0],
        ['a', 72],
        ['b', 144],
      ]),
    );
    expect(plan.moves).toEqual([
      { id: 'c', dy: 144 },
      { id: 'a', dy: -72 },
      { id: 'b', dy: -72 },
    ]);
    expect(plan.arrivals).toEqual([]);
  });

  it('rows that did not move, or left, are not touched', () => {
    expect(
      flipPlan(
        tops([
          ['a', 0],
          ['b', 72],
          ['c', 144],
        ]),
        tops([
          ['a', 0],
          ['b', 72],
        ]),
      ),
    ).toEqual({ moves: [], arrivals: [] });
  });
});

describe('staggerIndex', () => {
  it('counts rows 0, 1, 2… and stops at the cap', () => {
    expect([0, 1, 2, STAGGER_CAP, STAGGER_CAP + 5].map(staggerIndex)).toEqual([0, 1, 2, STAGGER_CAP, STAGGER_CAP]);
    expect(STAGGER_CAP).toBe(10);
  });
});
