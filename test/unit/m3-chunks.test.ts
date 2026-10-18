import { describe, expect, it } from 'vitest';
import { bubbleDelayMs, chunkText, messageParts, pacingPlan, paragraphs } from '../../src/renderer/messages/chunks';
import type { MessageRow } from '../../src/shared/types';

const row = (text: string, over: Partial<MessageRow> = {}): MessageRow =>
  ({
    id: 'm_1',
    chatId: 'c_1',
    seq: 2,
    authorKind: 'foo',
    authorId: null,
    kind: 'text',
    text,
    status: 'complete',
    badge: null,
    reactions: [{ by: 'me', emoji: '👍' }],
    attachments: null,
    deletedAt: null,
    createdAt: 0,
    ...over,
  }) as unknown as MessageRow;

describe('04 §12.3 chunking (AT-030)', () => {
  it('AT-030 · a 200-word answer arrives as at most 3 bubbles (stream mode: one)', () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    expect(chunkText(long)).toHaveLength(1);
    const sevenParas = Array.from({ length: 7 }, (_, i) => `Para ${i}.`).join('\n\n');
    const parts = chunkText(sevenParas);
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('Para 2.\n\nPara 3.\n\nPara 4.\n\nPara 5.\n\nPara 6.');
  });

  it('AT-030 · no bubble splits a list, a quote or a code block', () => {
    const text = 'Here you go.\n\n- one\n\n- two\n- three\n\n> a quote\n>\n> more';
    const parts = paragraphs(text);
    expect(parts).toEqual(['Here you go.', '- one\n\n- two\n- three', '> a quote\n>\n> more']);
    const code = 'Plan:\n\n```\nLeave 7:15 AM\n\nReach 9:00 AM\n```';
    expect(paragraphs(code)).toEqual(['Plan:', '```\nLeave 7:15 AM\n\nReach 9:00 AM\n```']);
  });

  it('only finished foo/helper text ≤ 600 chars is chunked; reactions hang on the last part', () => {
    expect(messageParts(row('a\n\nb', { authorKind: 'user' }))).toHaveLength(1);
    expect(messageParts(row('a\n\nb', { status: 'streaming' }))).toHaveLength(1);
    expect(messageParts(row(`${'x'.repeat(600)}\n\nb`))).toHaveLength(1);
    const parts = messageParts(row('First.\n\nSecond.'));
    expect(parts.map((p) => p.text)).toEqual(['First.', 'Second.']);
    expect(parts[0]!.reactions).toEqual([]);
    expect(parts[1]!.reactions).toHaveLength(1);
  });

  it('pacing: clamp(800 + 12 × chars, 800, 2500) ms before the next bubble', () => {
    expect(bubbleDelayMs(0)).toBe(800);
    expect(bubbleDelayMs(50)).toBe(1400);
    expect(bubbleDelayMs(500)).toBe(2500);
    expect(pacingPlan(row('Hello there.\n\nSecond.'))?.delays).toEqual([800 + 12 * 12]);
    expect(pacingPlan(row('one bubble'))).toBeNull();
  });
});
