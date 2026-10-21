// Spec: 08-2 §5.5 items 1–2 (steers queue in order; the STEER block is part 10 of the next step turn), §7.2 part 10 +
// 08-4 §24.14 (header `New messages from {firstName} while you work (answer or fold in each one):`), 08-4 §26.5 item 3 (a
// withdrawn card adds the first line `A card was waiting; it has been withdrawn. Re-check the terms before asking again.`),
// 08-4 §25.3 (one steer effect per queued message), CR-0024 B1 (one turn's answer is posted once).
import { describe, expect, it } from 'vitest';
import { SteerQueue, steerBlock, effectsFor, Steer, type SteerEffect } from '../../../src/engine/jobs/steer';
import type { RunnerCore } from '../../../src/engine/jobs/JobRunner';
import type { StopFlow } from '../../../src/engine/jobs/stopFlow';
import type { JobRow } from '../../../src/shared/types';
import { t } from '../../../src/shared/copy/t';

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

describe('AT-420 settle posts one answer per turn (CR-0024 B1)', () => {
  const job = { id: 'j1', chatId: 'c1', ownerId: null, state: 'working', doVerbs: [] } as unknown as JobRow;
  function harness() {
    const posted: string[] = [];
    const core = {
      d: {
        log: () => {},
        prompts: { filter: (s: string) => s },
        settings: () => ({ user: { firstName: 'Vikas' } }),
      },
      query: async (_q: string, id: string) => ({ id, chatId: 'c1', text: `text of ${id}`, authorKind: 'user' }),
      tx: async (ops: { text?: string }[]) => {
        for (const op of ops) if (op.text) posted.push(op.text);
        return { ok: true };
      },
      textOp: (_job: unknown, text: string) => ({ text }),
      writeMirrors: async () => {},
      intake: () => {},
    } as unknown as RunnerCore;
    const steer = new Steer(core, {} as StopFlow);
    return { steer, posted };
  }
  async function settleWith(ids: string[], effects: SteerEffect[], say: string) {
    const { steer, posted } = harness();
    for (const id of ids) steer.queue.push(job.id, id);
    await steer.drain(job);
    await steer.settle(job, { steer: ids.map((messageId, i) => ({ messageId, effect: effects[i]! })) }, say);
    return posted;
  }

  it('two answered steers post the reply once, not twice', async () => {
    const say = "The news search is slow, so I'm reading a news site instead.";
    expect(await settleWith(['m1', 'm2'], ['answered', 'answered'], say)).toEqual([say]);
  });
  it('two folded steers post "Got it" once', async () => {
    expect(await settleWith(['m1', 'm2'], ['folded', 'folded'], '')).toEqual([t('thread.steer.folded')]);
  });
  it('an answered and a folded steer post the answer and one "Got it", in their order', async () => {
    expect(await settleWith(['m1', 'm2'], ['answered', 'folded'], 'Claude.')).toEqual(['Claude.', t('thread.steer.folded')]);
  });
});
