// ART-18a (10-2 §D, Article 18): mid-job "actually make it 12–15" → "Got it, I'll fold that in." and the same job carries on
// with the message in part 10 of its next step turn (08-2 §5.5, 08-4 §24.14).
// ART-18b: "stop", "stop that", "cancel" → AT-077 (08-2 §5.2.1); a message sent during a job is answered before the next
// progress line, in 50 runs. Spoken "stop" is the same text once voice notes land (M12).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { jobHarness, jobIntake, step, stepAct, tool, BILLS_PLAN, type JobHarness } from '../integration/jobs/jobHarness';
import { fooTexts, until } from '../integration/jobs/t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const slow = (n: number, delayMs = 3_000) => Array.from({ length: n }, () => tool('fake.site', { site: 'stay.example' }, { delayMs }));
const stepPrompts = () =>
  h!
    .turnsJsonl()
    .filter((x) => x.purpose === 'step')
    .map((x) => String(x.prompt));

describe('Article 18: the user can always steer or stop', () => {
  it('ART-18a: "actually make it 12–15" mid-job → "Got it, I\'ll fold that in." and the same job continues', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        // Only the turn that carries the steer may finish the job.
        {
          match: { purpose: 'step', promptIncludes: 'actually make it 12–15' },
          reply: stepAct({ kind: 'done', result: 'Done.', unverified: true }),
        },
        ...slow(5),
      ],
    });
    h.userSays('Find my bills');
    await until(h, () => h!.calls.length >= 1);
    const jobId = h.job().id;
    h.userSays('actually make it 12–15');
    await h.settle();
    expect(h.jobs()).toHaveLength(1);
    expect(h.job().id).toBe(jobId);
    expect(h.job().state).toBe('done_unverified');
    expect(fooTexts(h)).toContain(t('thread.steer.folded'));
    const withSteer = stepPrompts().filter((p) => p.includes('actually make it 12–15'));
    expect(withSteer).toHaveLength(1);
    expect(withSteer[0]).toContain('while you work (answer or fold in each one):');
  });

  it.each(['stop', 'stop that', 'cancel'])('ART-18b: "%s" mid-job stops it (AT-077)', async (word) => {
    h = jobHarness({ script: [jobIntake(BILLS_PLAN), ...slow(10)] });
    h.userSays('Find my bills');
    await until(h, () => h!.calls.length >= 1);
    const stopId = h.userSays(word);
    const stopAt = Number(h.message(stopId).created_at);
    await h.settle();
    expect(h.job().state).toBe('cancelled');
    expect(h.job().stop_reason).toBe('user_word');
    expect(h.calls.filter((c) => c.at > stopAt + 1_000)).toHaveLength(0);
    expect(fooTexts(h).at(-1)).toBe(t('thread.stop.report.nothing'));
  });

  it('ART-18b: a message sent during a job is answered before the next progress line (50 runs)', async () => {
    for (let run = 0; run < 50; run++) {
      h = jobHarness({
        script: [
          jobIntake(BILLS_PLAN),
          { match: { purpose: 'step', promptIncludes: 'is it urgent?' }, reply: stepAct({ kind: 'step_done', idx: 0 }) },
          ...slow(4, 500 + 100 * (run % 10)),
          step({ kind: 'done', result: 'Done.', unverified: true }),
        ],
      });
      h.userSays('Find my bills');
      await until(h, () => h!.calls.length >= 1 + (run % 3), 50);
      const before = h.txs.length;
      h.userSays('is it urgent?');
      await h.settle();
      const after = h.txs.slice(before).filter((x) => x.ok);
      const answeredAt = after.findIndex((x) =>
        x.ops.some((op) => op.op === 'insert' && op.table === 'messages' && op.row.text === t('thread.steer.folded')),
      );
      const progressAt = after.findIndex((x) =>
        x.ops.some((op) => op.op === 'update' && op.table === 'steps' && 'state' in op.set && op.set.state === 'done'),
      );
      expect(answeredAt, `run ${run}`).toBeGreaterThanOrEqual(0);
      expect(progressAt, `run ${run}`).toBeGreaterThan(answeredAt);
      h.close();
      h = null;
    }
  }, 60_000);
});
