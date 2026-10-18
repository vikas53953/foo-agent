// 06-1 §2.3 Card 2a (🎲 fills the field from "the built-in list of 200 short friendly names"), G-M12-15 rules: 200 unique
// names, 3–8 letters, no AI-product or assistant names. The dice itself (no repeat in a session) is T4's.
import { describe, expect, it } from 'vitest';
import { loadNames } from '../../../src/main/setup/resources';

describe('M12 names list', () => {
  it('has 200 unique names of 3–8 letters', () => {
    const names = loadNames('resources');
    expect(names).toHaveLength(200);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(200);
    for (const n of names) expect(n).toMatch(/^\p{L}{3,8}$/u);
  });

  it('holds no AI-product, assistant or foo name', () => {
    const banned = [
      'foo',
      'claude',
      'chatgpt',
      'gemini',
      'copilot',
      'siri',
      'alexa',
      'cortana',
      'jarvis',
      'grok',
      'bard',
      'ollama',
      'llama',
    ];
    for (const n of loadNames('resources')) expect(banned).not.toContain(n.toLowerCase());
  });
});
