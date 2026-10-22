// Spec: CR-0035 (X-193), the real-AI run 7 on main 8eddee7 (B13): a web job went stuck (Stuck card, asking), and the next 8
// messages ("What is a good name for a pet tortoise?", news, …) got 👀 and no reply until a typed "stop". 08-2 §5.2 (the
// runner's branches of onUserMessage), 08-4 §26.5 item 2 (only a sign-in or take-over in progress keeps a steer waiting),
// 05-3 §5.19 (the Stuck card stays until the user answers it).
import { afterEach, describe, expect, it } from 'vitest';
import { envelope, intake } from '../../unit/m3-engine-helpers';
import { jobHarness, jobIntake, realPause, tool, type JobHarness, type PlanStepIn } from './jobHarness';
import { fooTexts, stuckLine } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'museum.example' } }];
const failing = (n: number) => Array.from({ length: n }, () => tool('gmail.search', { query: 'museum' }, { delayMs: 1_000 }));

describe('CR-0035 · a stuck job never swallows the next message', () => {
  it('a question sent while the only job waits on its Stuck card gets its own reply; the card stays', async () => {
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 10 } },
      script: [
        intake(envelope('Try Shelly or Tank.'), { match: { purpose: 'intake', promptIncludes: 'pet tortoise' } }),
        intake(envelope('Chandrayaan news leads today.'), { match: { purpose: 'intake', promptIncludes: 'biggest in India' } }),
        jobIntake(PLAN),
        ...failing(6),
        stuckLine('Searches fail as busy'),
      ],
    });
    h.userSays('Find the opening hours of the National Museum in Delhi');
    await h.settle();
    expect(h.job().state).toBe('needs_you');
    expect(h.cards('stuck')).toHaveLength(1);

    const asked = h.userSays('What is a good name for a pet tortoise?');
    await h.settle();
    expect(fooTexts(h)).toContain('Try Shelly or Tank.');
    expect(h.message(asked).badge).not.toBe('seen');
    // The stuck job and its card are left as they were: the user still decides on them.
    expect(h.cards('stuck')[0]!.state).toBe('asking');
    expect(h.job().state).toBe('needs_you');

    // And the one after it: nothing queues behind the stuck card.
    h.userSays('Which news story is biggest in India today? One line.');
    await h.settle();
    expect(fooTexts(h)).toContain('Chandrayaan news leads today.');
    expect(h.cards('stuck')[0]!.state).toBe('asking');
  });
});

describe('CR-0045 · a message sent while a job is turning stuck is not lost', () => {
  it('run 21 U01: "fun fact about Delhi" sent during the "What\'s wrong" turn gets its own reply', async () => {
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 10 } },
      script: [
        intake(envelope('Delhi has the largest spice market in Asia.'), { match: { purpose: 'intake', promptIncludes: 'fun fact' } }),
        jobIntake(PLAN),
        ...failing(6),
        // The "What's wrong" classify turn takes 5 s; the user writes in that window (run 21: 0.4 s after the stuck log).
        { ...stuckLine('Searches fail as busy'), delayMs: 5_000 },
      ],
    });
    const x = h;
    x.userSays('Find the opening hours of the National Museum in Delhi');
    for (let i = 0; i < 4_000 && !x.logs.some((l) => String(l.evt ?? '').startsWith('job.stuck.')); i++) {
      await realPause(2);
      x.clock.advance(100);
    }
    expect(x.cards('stuck')).toHaveLength(0);
    const asked = x.userSays('Give me one fun fact about Delhi in one sentence');
    await x.settle();
    expect(x.cards('stuck')).toHaveLength(1);
    expect(fooTexts(x)).toContain('Delhi has the largest spice market in Asia.');
    expect(x.message(asked).badge).not.toBe('seen');
  });
});
