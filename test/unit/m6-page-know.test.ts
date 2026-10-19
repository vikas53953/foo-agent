// M6 T6: the right shell's "What I know" tiles reload on `memory:changed` (03-shell-2 §3.7.3.3; CR-0010 G-M6-08: no memory
// store slice, the panel subscribes itself) and stop listening when the panel goes away.
import { afterEach, describe, expect, it } from 'vitest';
import { setBridge } from '../../src/renderer/ipc/client';
import { watchKnow } from '../../src/renderer/shell/panelData';
import type { MemoryFactView } from '../../src/shared/types';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('What I know refreshes on memory:changed', () => {
  afterEach(() => setBridge(undefined));

  it('loads once, reloads on each memory:changed, and unsubscribes', async () => {
    let lists = 0;
    const handlers = new Set<(p: unknown) => void>();
    let version = 1;
    setBridge({
      invoke: (channel: string) => {
        if (channel === 'memory:list') lists++;
        return Promise.resolve({ ok: true, value: [{ id: `f_${version}` }] });
      },
      on: (event: string, h: (p: unknown) => void) => {
        if (event === 'memory:changed') handlers.add(h);
        return () => handlers.delete(h);
      },
    } as never);
    const seen: string[][] = [];
    const stop = watchKnow((facts: MemoryFactView[]) => seen.push(facts.map((f) => f.id)));
    await flush();
    version = 2;
    handlers.forEach((h) => h({ factIds: ['f_2'] }));
    await flush();
    expect(lists).toBe(2);
    expect(seen).toEqual([['f_1'], ['f_2']]);
    stop();
    expect(handlers.size).toBe(0);
  });
});
