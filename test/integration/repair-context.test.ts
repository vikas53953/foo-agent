// Spec: CR-0049 (X-207), 08-4 §24.1 `repair` row as amended, 08-2 §7.5 (one repair turn, "same session"). Real-AI run 30
// (main 04f01dd, Claude CLI), B07: "Open the Indian Railways IRCTC website and check the train timings from New Delhi to
// Agra tomorrow morning" got "I didn't get that. Say it another way?". foo keeps no AI session between turns, so the
// repair turn after a bad <act> carried repair.md only: the AI never saw the message, answered kind "reply" with "I can't
// see your last message" (its <say> is ignored, §25.5 item 3), the reply was empty, and CR-0041's retry did the same.
// Now the repair turn carries the failed turn's prompt and reply. REPAIR_BLIND is the CLI's real answer to repair.md alone
// (3 of 3 replays, Thu 22 Oct); REAL_TRAINS is its real intake answer to the B07 message (15 of 15 replays planned a job).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { envelope, jobHarness, jobIntake, step, stepAct, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const IRCTC = 'Open the Indian Railways IRCTC website and check the train timings from New Delhi to Agra tomorrow morning';
const REAL_TRAINS =
  '<say></say>\n<act>{"decision":{"kind":"job","title":"New Delhi to Agra trains, Fri 23 Oct morning","plan":[{"phraseKey":"check_site","slots":{"site":"IRCTC"},"route":"browser"},{"phraseKey":"find_trains","slots":{"site":"IRCTC"},"route":"browser"}],"estimate":{"minutes":3},"routeHint":["browser"],"needsApps":[]},"usedMemoryIds":[]}</act>';
/** The same answer with a slot that is not a string (a time window): the <act> fails zod and the repair turn runs. */
const BAD_TRAINS = REAL_TRAINS.replace(
  '{"site":"IRCTC"},"route":"browser"}]',
  '{"site":"IRCTC","when":{"from":"6 AM","to":"12 PM"}},"route":"browser"}]',
);
const REPAIR_BLIND =
  '<say>I can\'t see your last message on my side, so I can\'t redo that answer. Could you send it again?</say>\n<act>{"decision":{"kind":"reply"},"usedMemoryIds":[]}</act>';

const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);
const prompts = (x: JobHarness, purpose: string) =>
  x
    .turnsJsonl()
    .filter((r) => r.purpose === purpose)
    .map((r) => String(r.prompt));

describe('CR-0049 · the repair turn sees the message and the reply it repairs', () => {
  it('run 30 B07: a bad <act> on the IRCTC ask is repaired into the job, not "I didn\'t get that"', async () => {
    h = jobHarness({
      script: [
        { match: { purpose: 'intake', promptIncludes: 'IRCTC' }, reply: BAD_TRAINS },
        { match: { purpose: 'repair', promptIncludes: 'New Delhi to Agra' }, reply: REAL_TRAINS },
        { match: { purpose: 'repair' }, reply: REPAIR_BLIND, once: false },
        { match: { purpose: 'intake' }, reply: envelope('', { kind: 'reply' }), once: false },
      ],
    });
    h.userSays(IRCTC);
    await h.settle();
    expect(fooTexts(h)).not.toContain(t('thread.reply.empty'));
    expect(h.cards('plan').length).toBe(1);
    const [repair] = prompts(h, 'repair');
    expect(repair).toContain(IRCTC);
    expect(repair).toContain('Your last reply:');
    expect(repair).toContain('"when":{"from":"6 AM"');
    expect(repair).toContain('not valid: Invalid input');
  });

  it('a step whose <act> fails is repaired with the job in view', async () => {
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'check_site', slots: { site: 'trains.example' } }], { match: 'trains' }),
        step({ kind: 'tool', call: { tool: 'fake.read' } }),
        {
          match: { purpose: 'repair', promptIncludes: 'trains.example' },
          reply: stepAct({ kind: 'done', result: 'Two trains before 9 AM.', unverified: true }),
        },
        { match: { purpose: 'repair' }, reply: REPAIR_BLIND, once: false },
      ],
    });
    h.userSays('Check trains on trains.example');
    await h.settle();
    expect(h.job().state).toBe('done_unverified');
    expect(prompts(h, 'repair')[0]).toContain('Your last reply:');
  });
});
