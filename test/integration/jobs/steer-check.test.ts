// Spec: CR-0045 (X-203), 08-4 §26.5 item 2b as amended, §24.13a (steer_check.md, purpose `classify`), 08-2 §5.2 (one live
// job → steer). Real-AI run 21 (main a087f3c, Claude CLI), U23: a table booking waited on "Which city should I look in…?";
// "Make me a simple page that tracks my daily water intake" was steered into it, the card was withdrawn ("→ you changed the
// plan") and the job asked again ("Which kind of place…?") right under the tracker. Every steer_check answer below is the
// Claude CLI's real answer to the CR-0045 prompt (20 of 20 replays right, Wed 21 Oct).
import { afterEach, describe, expect, it } from 'vitest';
import { envelope, intake } from '../../unit/m3-engine-helpers';
import { jobHarness, jobIntake, realPause, step, type JobHarness, type PlanStepIn } from './jobHarness';
import { fooTexts } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'tables.example' } }];
const CITY = { question: 'Which city should I look in for Sat 24 Oct, 8:00 PM?', options: [{ label: 'Delhi' }, { label: 'Bangalore' }] };
const check = (about: 'job' | 'new', promptIncludes: string) => ({
  match: { purpose: 'classify' as const, promptIncludes },
  reply: `<say></say><act>${JSON.stringify({ about })}</act>`,
});
const choices = (x: JobHarness) => x.cards('choice').map((c) => [c.state, JSON.parse(String(c.payload)).question]);

async function waiting(script: Parameters<typeof jobHarness>[0]['script']) {
  h = jobHarness({ script: [jobIntake(PLAN), step({ kind: 'ask', card: CITY }), ...script] });
  h.userSays('Book a table for 2 at an Italian place on Saturday 8 PM');
  await h.settle();
  expect(h.job().state).toBe('needs_you');
  return h;
}

describe('CR-0045 · a message that is not about the waiting job leaves its card alone', () => {
  it('run 21 U23: the water tracker ask gets its own answer; "Which city…?" stays asking and is not asked again', async () => {
    const x = await waiting([
      check('new', 'water intake'),
      intake(envelope('Here is a water tracker with a goal of 8 glasses.'), { match: { purpose: 'intake', promptIncludes: 'water' } }),
    ]);
    const asked = x.userSays('Make me a simple page that tracks my daily water intake with a goal of 8 glasses');
    await x.settle();
    expect(fooTexts(x)).toContain('Here is a water tracker with a goal of 8 glasses.');
    expect(choices(x)).toEqual([['asking', CITY.question]]);
    expect(x.job().state).toBe('needs_you');
    expect(x.message(asked).badge).not.toBe('seen');
    // The steer check is told the job, what it waits for and the message.
    const turn = x.turnsJsonl().find((t) => t.purpose === 'classify');
    expect(turn).toBeTruthy();
  });

  it('"Actually make it 9 PM" (about: job) is still a steer: the card is withdrawn and the job works again', async () => {
    const x = await waiting([
      check('job', '9 PM'),
      step({ kind: 'done', result: 'Booked nothing yet; looking at 9 PM.', unverified: true }),
    ]);
    x.userSays('Actually make it 9 PM');
    await x.settle();
    expect(x.cards('choice')[0]!.state).toBe('superseded');
    expect(fooTexts(x)).toContain('Got it, I’ll fold that in.');
  });

  it("a failed steer check keeps today's steer (the card is withdrawn, nothing is lost)", async () => {
    const x = await waiting([
      { match: { purpose: 'classify' as const }, reply: 'not an envelope' },
      step({ kind: 'done', result: 'Done.', unverified: true }),
    ]);
    x.userSays('Make me a simple page that tracks my daily water intake');
    await x.settle();
    expect(x.cards('choice')[0]!.state).toBe('superseded');
    expect(x.logs.some((l) => l.evt === 'job.steer_check' && l.kind === 'failed')).toBe(true);
  });

  it('a working job takes the steer with no check (the step turn decides, 08-2 §5.5)', async () => {
    h = jobHarness({
      script: [jobIntake(PLAN), step({ kind: 'done', result: 'Done.', unverified: true }, { delayMs: 3_000 })],
    });
    const x = h;
    x.userSays('Book a table for 2 at an Italian place on Saturday 8 PM');
    for (let i = 0; i < 2_000 && x.jobs()[0]?.state !== 'working'; i++) {
      await realPause(2);
      x.clock.advance(100);
    }
    expect(x.job().state).toBe('working');
    x.userSays('make it 9 PM');
    await x.settle();
    expect(x.turnsJsonl().filter((t) => t.purpose === 'classify')).toHaveLength(0);
  });
});
