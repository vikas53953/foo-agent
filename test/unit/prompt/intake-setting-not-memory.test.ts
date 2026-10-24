// Spec: AT-448 (CR-0058, X-215): 08-4 §24.5 `intake.md`: "memory" only when the message itself asks to remember or forget;
// asking to change a setting ("switch to dark mode") is always "setting", even right after messages about memory.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const line = (kind: string): string => {
  const l = readFileSync('resources/prompts/intake.md', 'utf8')
    .split('\n')
    .find((x) => x.startsWith(`- "${kind}":`));
  expect(l, kind).toBeDefined();
  return l!;
};

describe('AT-448 · a setting ask is a setting, not a memory', () => {
  it('AT-448 "Switch to dark mode" right after two "Remember…" messages is decided as "setting"', () => {
    // Real-AI runs 47fea16 and 8abcdbd (R-dark-hi): the AI answered "memory" and foo said "Not saving this one.".
    expect(line('memory')).toContain('only when the message itself asks to remember or forget something about the user, in any words');
    // Review A: other ways to ask still count, so real memory asks are not lost.
    for (const w of ['"note that …"', '"yaad rakhna …"']) expect(line('memory')).toContain(w);
    expect(line('setting')).toContain(
      'Asking to change one, like "switch to dark mode", is always "setting", even right after messages about memory.',
    );
  });
});
