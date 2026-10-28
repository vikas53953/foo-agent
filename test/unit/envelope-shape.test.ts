// Spec: 08-4 §25.5 item 1 (untagged text, stray text); real-AI run 40638245705 (R1, a table ask came back `reply` with no
// say). The tech log names where the words went, by tag order only, never the words.
import { describe, expect, it } from 'vitest';
import { envelopeShape } from '../../src/engine/chat/ChatLane';

const ACT = '<act>{"decision":{"kind":"reply"},"usedMemoryIds":[]}</act>';

describe('envelopeShape · the tag order of an empty-say reply', () => {
  it.each([
    [`<say></say>\n${ACT}`, 'say_empty_before_act'],
    [`<say></say>\n${ACT}\nChotu 😊`, 'say_empty_words_after_act'],
    [`<say></say>\nChotu 😊\n${ACT}`, 'say_empty_words_before_act'],
    ['<say></say><act>{"decision":{"kind":"reply","text":"Chotu"},"usedMemoryIds":[]}</act>', 'say_empty_words_in_act'],
    [`${ACT}\n<say>| a | b |</say>`, 'say_after_act'],
    [ACT, 'act_only'],
    ['| a | b |', 'no_tags'],
    ['<say>| a | b |</say>', 'say_no_act'],
    [`| a | b |\n${ACT}`, 'act_with_untagged_words'],
    ['<act>{"decision":{"kind":"reply"},<say>| a | b |</say>"usedMemoryIds":[]}</act>', 'say_inside_act'],
  ])('%j is %s', (text, shape) => {
    expect(envelopeShape(text)).toBe(shape);
  });
});
