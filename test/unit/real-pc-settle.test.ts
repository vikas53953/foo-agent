// 07 journeys, 10 acceptance (real-AI end-to-end check): the driver may judge or close foo only once foo's reply is finished.
// Real-AI run 16 (main 0665cf6): waitReply settled on an AI page still "Building your page…" (no new words for 6 s), the
// journey closed foo, and after the restart the reply read "That reply got cut off" (04 §19.4, right for a quit mid-reply).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import cassette from '../fixtures/real-ai/run16-b09-ai-page-building.json';

type Item = { kind: string; state: string | null; text: string; pageState?: string | null };
const { stillWorking, settled } = createRequire(import.meta.url)('../real-pc/settle.js') as {
  stillWorking: (items: Item[]) => boolean;
  settled: (o: { n: number; before: number; items: Item[]; quietFor: number; quietMs: number }) => boolean;
};

const reply = (items: Item[]) => items.slice(items.map((x) => x.kind).lastIndexOf('bubble-me') + 1);

describe('real-PC driver: a reply is settled only when foo has finished it', () => {
  it('run 16 B09: the AI page bubble still streaming is not settled, however long it has been quiet', () => {
    const items = reply(cassette.items);
    expect(stillWorking(items)).toBe(true);
    expect(settled({ n: 1, before: 0, items, quietFor: 60_000, quietMs: 6_000 })).toBe(false);
  });

  it('the same reply once the page is ready is settled after the quiet time', () => {
    const items = reply(cassette.items).map((x) => ({ ...x, state: 'complete', pageState: 'ready' }));
    expect(stillWorking(items)).toBe(false);
    expect(settled({ n: 1, before: 0, items, quietFor: 6_000, quietMs: 6_000 })).toBe(true);
    expect(settled({ n: 1, before: 0, items, quietFor: 5_999, quietMs: 6_000 })).toBe(false);
  });

  it('a page still building inside a finished bubble is not settled', () => {
    const items = reply(cassette.items).map((x) => ({ ...x, state: 'complete', pageState: 'building' }));
    expect(stillWorking(items)).toBe(true);
  });

  it('no new reply yet is not settled', () => {
    expect(settled({ n: 0, before: 0, items: [], quietFor: 60_000, quietMs: 6_000 })).toBe(false);
  });

  it('a live web checklist is still working while its read is in flight', () => {
    const items = [{ kind: 'card-plan', state: 'live', text: 'Looking on the web', pageState: null }];
    expect(stillWorking(items)).toBe(true);
    expect(settled({ n: 1, before: 0, items, quietFor: 6_000, quietMs: 6_000 })).toBe(false);
  });
});
