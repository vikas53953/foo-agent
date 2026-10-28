// Spec: 08-4 §24 item 4 (`{firstName}` is `user.firstName`, or the text `the user` when absent), 08-2 §7.2 part 7
// (`[{name}, {when}]: {text}`). Real Claude on run 40646517889 (QA2): with no first name the user's lines read
// "[You, …]", so the AI took "tumhara naam kya hai?" for its own words and answered "aur tumhara naam?" with
// "Aapka naam kya hai?".
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;
const intakes = (x: JobHarness) => x.turnsJsonl().filter((turn) => turn.purpose === 'intake');

describe('part 7 · a user with no first name is "the user", never "You"', () => {
  it('the conversation names the user\'s earlier line "the user"', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: reply('Chotu.') }] });
    h.userSays('tumhara naam kya hai? ek line mein');
    await h.settle();
    h.userSays('aur tumhara naam? sirf naam batao');
    await h.settle();
    const prompt = String(intakes(h).at(-1)!.prompt);
    expect(prompt).toContain('[the user, ');
    expect(prompt).not.toContain('[You, ');
  });
});
