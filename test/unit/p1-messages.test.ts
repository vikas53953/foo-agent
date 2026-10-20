// Spec: 02 §F7.1 "Chat" (CR-0021, X-179): one-shot details play once per message, not when a row mounts again on scroll-back
// or loads from history (04 §1.5); 04 §14.4 streamed words fade in (only the text that arrived since the last paint).
import { describe, expect, it } from 'vitest';
import { shouldPlay } from '../../src/renderer/messages/oneShot';
import { fadePieces, textStarts } from '../../src/renderer/messages/streamFade';
import { parseBlocks } from '../../src/renderer/messages/markdownParse';

describe('one-shot details (§F7.1)', () => {
  it('a new row plays when it mounts; the same message mounted again does not', () => {
    const seen = new Set<string>();
    expect(shouldPlay(seen, 'new:c1', true, true, true)).toBe(true);
    seen.add('new:c1');
    expect(shouldPlay(seen, 'new:c1', true, true, true)).toBe(false);
  });

  it('a change detail plays only when the condition turns on while mounted, not when it mounts already on', () => {
    const seen = new Set<string>();
    expect(shouldPlay(seen, 'read:m1', true, false, true)).toBe(false);
    expect(shouldPlay(seen, 'read:m2', false, false, false)).toBe(false);
    expect(shouldPlay(seen, 'read:m2', true, false, false)).toBe(true);
  });
});

describe('streamed words fade (04 §14.4)', () => {
  it('only the text after the last paint fades; earlier pieces keep their keys', () => {
    const first = fadePieces('Diwali is on Sun 8 Nov.', 0, []);
    expect(first).toEqual([{ key: 0, text: 'Diwali is on Sun 8 Nov.', fading: true }]);
    const text = 'Diwali is on Sun 8 Nov. Banks are closed on Mon 9 Nov too.';
    const second = fadePieces(text, 0, [23]);
    expect(second.map((p) => p.text).join('')).toBe(text);
    expect(second.map((p) => p.key)).toEqual([0, 1]);
    const third = fadePieces(`${text} Shall I add both?`, 0, [23, text.length]);
    expect(third.map((p) => p.fading)).toEqual([false, true, true]);
  });

  it('a leaf that starts after earlier text is split by the global offsets', () => {
    expect(fadePieces('world', 6, [8])).toEqual([
      { key: 0, text: 'wo', fading: true },
      { key: 1, text: 'rld', fading: true },
    ]);
  });

  it('text leaves are numbered in reading order across blocks', () => {
    const blocks = parseBlocks('Hello **there**\n\n- one\n- two');
    const { total } = textStarts(blocks);
    expect(total).toBe('Hellothereonetwo'.length + ' '.length);
  });
});
