// Spec: 08-2 §5.5 items 1–2 (steers queue in order; the STEER block is part 10 of the next step turn), §7.2 part 10 +
// 08-4 §24.14 (header `New messages from {firstName} while you work (answer or fold in each one):`), 08-4 §26.5 item 3 (a
// withdrawn card adds the first line `A card was waiting; it has been withdrawn. Re-check the terms before asking again.`),
// 08-4 §25.3 (one steer effect per queued message).
import { describe, expect, it } from 'vitest';
import { SteerQueue, steerBlock, effectsFor } from '../../../src/engine/jobs/steer';

describe('08-2 §5.5 the steer queue', () => {
  it('keeps messages in order; drain hands them over once; a failed turn puts them back first', () => {
    const q = new SteerQueue();
    q.push('j1', 'm1');
    q.push('j1', 'm2');
    q.push('j2', 'm9');
    expect(q.pending('j1')).toEqual(['m1', 'm2']);
    expect(q.take('j1')).toEqual(['m1', 'm2']);
    expect(q.pending('j1')).toEqual([]);
    q.push('j1', 'm3');
    q.putBack('j1', ['m1', 'm2']);
    expect(q.pending('j1')).toEqual(['m1', 'm2', 'm3']);
    q.forget('j1');
    expect(q.pending('j1')).toEqual([]);
    expect(q.pending('j2')).toEqual(['m9']);
  });

  it('the same message is never queued twice', () => {
    const q = new SteerQueue();
    q.push('j1', 'm1');
    q.push('j1', 'm1');
    expect(q.pending('j1')).toEqual(['m1']);
  });
});

describe('part 10 STEER block', () => {
  it('exact header, then each message with its id', () => {
    expect(steerBlock('Vikas', [{ id: 'm1', text: 'actually make it cheaper' }], false)).toBe(
      ['New messages from Vikas while you work (answer or fold in each one):', '- [m1] actually make it cheaper'].join('\n'),
    );
  });
  it('a withdrawn card adds its line first (08-4 §26.5 item 3)', () => {
    expect(steerBlock('the user', [{ id: 'm1', text: 'x' }], true).split('\n')[0]).toBe(
      'A card was waiting; it has been withdrawn. Re-check the terms before asking again.',
    );
  });
});

describe('effectsFor (08-4 §25.3)', () => {
  it('takes the AI effect per message; a message the AI left out counts as folded', () => {
    expect(
      effectsFor(
        ['m1', 'm2'],
        [
          { messageId: 'm2', effect: 'answered' },
          { messageId: 'zz', effect: 'restart' },
        ],
      ),
    ).toEqual({
      effects: [
        { messageId: 'm1', effect: 'folded' },
        { messageId: 'm2', effect: 'answered' },
      ],
      missing: ['m1'],
    });
  });
});
