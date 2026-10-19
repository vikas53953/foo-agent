// Spec: 10-acceptance-1 §B AT-075 (an edit to about-you.md in Notepad is used by the next foo reply), 08-3 §12.2 (the
// watcher reindexes a changed memory file), 08-4 §24.16 (parts 5/5b read memory_index). The real Engine and main's
// EngineBridge over a temp SQLite db; CR-0010 G-M6-21 (an unclaimed memory_confirm card still leaves `asking`); the AI turns are the fake script (08-3 §22.3).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';
import { cardOf, seedCard } from './choice/seedCard';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;

describe('AT-075 · a Notepad edit to about-you.md reaches the next reply', () => {
  it('AT-075 · the edited line is reindexed and the next intake prompt carries the new text, not the old', async () => {
    h = makeHarness({ script: [intake(reply('Okay.')), intake(reply('You live in Mumbai.'))], settings: verified(), tools: {} });
    const x = h;
    const file = path.join(x.dir, 'data', 'memory', 'about-you.md');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '# About you\n- Lives in Pune\n');
    await x.engine.memory.fileChanged('memory/about-you.md');
    await x.idle();
    const row = x.db.prepare('SELECT id, text FROM memory_index').get() as { id: string; text: string };
    expect(row.text).toBe('Lives in Pune');

    // The user opens the file in Notepad and changes the city; the watcher hands the file to the store.
    const ours = readFileSync(file, 'utf8');
    writeFileSync(file, ours.replace('Lives in Pune', 'Lives in Mumbai'));
    await x.engine.memory.fileChanged('memory/about-you.md');
    await x.idle();
    expect(x.db.prepare('SELECT id, text FROM memory_index').all()).toEqual([{ id: row.id, text: 'Lives in Mumbai' }]);

    x.userSays('Where do I live?');
    await x.idle();
    const turn = x
      .turnsJsonl()
      .filter((t) => t.purpose === 'intake')
      .at(-1)!;
    const sent = `${String(turn.system)}\n${String(turn.prompt)}`;
    expect(sent).toContain('Lives in Mumbai');
    expect(sent).not.toContain('Lives in Pune');
  });
});

describe('CR-0010 G-M6-21 · the engine owns memory_confirm cards', () => {
  it('a memory_confirm card no memory seam claims is still moved out of asking (never left open)', async () => {
    h = makeHarness({ script: [], settings: verified() });
    const x = h;
    const card = seedCard(x.db, {
      chatId: x.chatId,
      type: 'choice',
      state: 'asking',
      payload: { purpose: 'memory_confirm', question: 'Remember that?', options: [{ id: 'o1', label: 'Yes' }] },
      now: x.clock.now(),
    });
    x.send('card.answered', { cardId: card.id, answer: { optionId: 'o1' }, choice: 'o1', resolvedBy: 'tap' });
    await x.idle();
    expect(cardOf(x.db, card.id)).toMatchObject({ state: 'answered', resolvedBy: 'tap', answer: { optionId: 'o1' } });
  });
});
