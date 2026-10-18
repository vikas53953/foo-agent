// ART-22 (10-2 §D, Article 22): during any job, foo posts nothing between start and result except cards, questions and the
// result. 08-2 §5.4.2 (the runner posts only cards and the result).
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, sixStepScript, step, type JobHarness } from '../integration/jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const fooMessages = (x: JobHarness, after: number) => x.messages().filter((m) => m.author_kind === 'foo' && Number(m.seq) > after);

describe('ART-22 · no chatter during a job', () => {
  it('a 6-step job: only the checklist card and the result', async () => {
    h = jobHarness({ script: sixStepScript() });
    const userId = h.userSays('Make me a list of bills and stays');
    const seq = Number(h.message(userId).seq);
    await h.settle();
    const posted = fooMessages(h, seq);
    const job = h.job();
    expect(posted.filter((m) => m.kind !== 'card').map((m) => m.id)).toEqual([job.result_message_id]);
  });

  it('a job that asks: only the checklist, the question card and the result', async () => {
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'read_email' }, { phraseKey: 'wait_pick' }]),
        step({ kind: 'ask', card: { question: 'Which one?', options: [{ label: 'First' }, { label: 'Second' }] } }, { delayMs: 2_000 }),
        step({ kind: 'done', result: 'Done with the first.', unverified: true }),
      ],
    });
    const userId = h.userSays('Pick a bill for me');
    const seq = Number(h.message(userId).seq);
    await h.settle();
    const choice = h.cards('choice')[0]!;
    h.answer(String(choice.id), 'o1');
    await h.settle();
    const posted = fooMessages(h, seq);
    expect(posted.filter((m) => m.kind !== 'card').map((m) => m.id)).toEqual([h.job().result_message_id]);
    expect(posted.filter((m) => m.kind === 'card')).toHaveLength(2);
  });
});
