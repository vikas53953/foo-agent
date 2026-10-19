// ART-11 (10-2 §D, Article 11): every DONE job in foo.db has a proof object, or is done_unverified ("⚠ Not checked live");
// the fake AI claiming "Booked!" with no proof never makes a job DONE (AT-119). 08-2 §5.8.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, tool, type JobHarness, type PlanStepIn } from '../integration/jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const SITE_PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'stay.example' } }, { phraseKey: 'find_proof' }];
const proof = (code: string) => ({ kind: 'confirmation', code, site: 'stay.example', seenInToolCallId: 'tc_000001' });

describe('ART-11 · DONE needs a proof', () => {
  it('"Booked!" with no proof is not DONE; a later checked proof is', async () => {
    h = jobHarness({
      script: [
        jobIntake(SITE_PLAN),
        tool('fake.site', { site: 'stay.example' }),
        step({ kind: 'done', result: 'Booked!' }),
        step({ kind: 'done', result: 'Booked. Reference ABC123.', proof: proof('ABC123') }),
      ],
    });
    h.userSays('Book the stay');
    await h.settle();
    expect(h.job().state).toBe('done');
    expect(h.messages().some((m) => m.text === 'Booked!')).toBe(false);
  });

  it('every done row has a proof; every proof-less finish is done_unverified', async () => {
    h = jobHarness({
      script: [
        jobIntake(SITE_PLAN, { match: 'one' }),
        jobIntake(SITE_PLAN, { match: 'two' }),
        jobIntake(SITE_PLAN, { match: 'three' }),
        // One job at a time, so the first job's tool call is tc_000001 and the second's tc_000002.
        tool('fake.site', { site: 'stay.example' }),
        step({ kind: 'done', result: 'Booked. Reference ABC123.', proof: proof('ABC123') }),
        tool('fake.site', { site: 'stay.example' }),
        step({ kind: 'done', result: 'Booked.', proof: { ...proof('ABC123'), seenInToolCallId: 'tc_000001' } }),
        step({ kind: 'done', result: 'Could not check.', unverified: true }),
      ],
    });
    for (const t of ['one', 'two', 'three']) {
      h.userSays(`job ${t}`);
      await h.settle();
    }
    const rows = h.jobs();
    expect(rows.map((j) => j.state).sort()).toEqual(['done', 'done_unverified', 'done_unverified']);
    for (const j of rows) {
      if (j.state === 'done') expect(JSON.parse(String(j.proof))).toMatchObject({ kind: 'confirmation' });
      else expect(j.proof).toBeNull();
    }
  });
});
