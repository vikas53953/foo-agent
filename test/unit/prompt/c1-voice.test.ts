// Spec: 08-4 §24.2 (identity.md: the foo and helper blocks carry the "How you sound" line; the foo block is one paragraph),
// §24.3 (rules.md: sentence case always, the answer first, a short list for three or more things), 10-2 §C.10, CR-0024 F1 F4 F5.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const P = (f: string) => readFileSync(`resources/prompts/${f}`, 'utf8');

describe('C1 voice in the prompt files (CR-0024)', () => {
  it('AT-422 rules.md asks for sentence case and no longer mirrors the user’s casing', () => {
    expect(P('rules.md')).toContain('Always write in normal sentence case with capital letters, even when the user types in lower case.');
    expect(P('rules.md')).not.toContain("Mirror the user's casing");
  });

  it('AT-423 both identity blocks carry the voice line; the foo block is one paragraph', () => {
    const [foo, helper, ...rest] = P('identity.md').split('\n\n');
    expect(rest).toEqual([]);
    expect(foo!.startsWith('You are {agentName}, a personal helper for {firstName}.')).toBe(true);
    expect(foo).toContain('How you sound: warm, sure and brief');
    expect(foo).toContain('Good: "Your Airtel bill is ₹649, due Sat 24 Oct.');
    expect(helper!.startsWith("You are {helperName}, {firstName}'s helper.")).toBe(true);
    expect(helper).toContain('How you sound: warm, sure and brief.');
  });

  it('AT-424 rules.md puts the answer first and allows a short list for three or more things', () => {
    expect(P('rules.md')).toContain('Put the answer in the first sentence.');
    expect(P('rules.md')).toContain('Use a short list when you give three or more things');
  });
});

describe('C1 intake rules from the real-PC run (CR-0024 F11, F12)', () => {
  it('AT-434 a memory fact is a short note without "the user"', () => {
    expect(P('intake.md')).toContain('Write the fact as a short note without "the user" or their name');
  });

  it('AT-435 writing or sending an email or message is a job, never a draft in say', () => {
    expect(P('intake.md')).toContain('Writing, sending or replying to an email or a message is always a "job" that needs that app');
  });
});
