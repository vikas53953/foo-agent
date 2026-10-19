// ART-13a (10-2 §D, Article 13): the AI cap hit at ₹1,000 → no further AI call for jobs (AT-083; 08-2 §5.10 pre-call check).
// ART-13c: a loop (3 failures in a row; cost past 2× the estimate) → the job stops trying and tells the user with the stuck
// card (08-2 §5.6, 08-4 §26.4). Routines (also capped) arrive with M11.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, tool, BILLS_PLAN, type JobHarness, type PlanStepIn } from '../integration/jobs/jobHarness';
import { keyBilling, seedSpend, stuckLine } from '../integration/jobs/t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN: PlanStepIn[] = [
  { phraseKey: 'check_site', slots: { site: 'stay.example' } },
  { phraseKey: 'compare', slots: { what: 'stays' } },
];
const aiTurns = () => (h!.db.prepare('SELECT COUNT(*) AS n FROM ai_turns').get() as { n: number }).n;

describe('Article 13: money and loops', () => {
  it('ART-13a: the AI cap hit at ₹1,000 → 0 AI calls for the job, however long it waits', async () => {
    h = jobHarness({
      settings: keyBilling(100_000),
      script: [jobIntake(BILLS_PLAN), step({ kind: 'done', result: 'Done.', unverified: true })],
    });
    seedSpend(h, 100_000);
    h.userSays('Find my bills');
    await h.settle();
    const before = aiTurns();
    h.answer(String(h.cards('plan')[0]!.id), 'go');
    await h.settle();
    h.clock.advance(60 * 60_000);
    await h.settle();
    expect(aiTurns() - before).toBe(0);
    expect(h.job().state).toBe('waiting');
    expect(h.job().waiting_reason).toBe('spend_cap');
  });

  it('ART-13c: 3 failures in a row → the job stops trying and the stuck card tells the user', async () => {
    const failing = Array.from({ length: 6 }, () => tool('gmail.search', { query: 'stay' }, { delayMs: 1_000 }));
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 10 } },
      script: [jobIntake(PLAN), ...failing, stuckLine('Search keeps failing')],
    });
    h.userSays('Find a stay');
    await h.settle();
    expect(h.calls).toHaveLength(3);
    expect(h.job().state).toBe('needs_you');
    expect(h.cards('stuck')).toHaveLength(1);
  });

  it('ART-13c: cost past 2× the estimate → the job stops trying and the stuck card tells the user', async () => {
    const big = { tokensIn: 20_000, tokensOut: 5_000, cacheRead: null, cacheWrite: null, costUsd: null };
    h = jobHarness({
      script: [
        jobIntake(PLAN),
        tool('fake.site', { site: 'stay.example' }, { usage: big }),
        tool('fake.site', { site: 'other.example' }),
        stuckLine('It is costing too much'),
      ],
    });
    h.userSays('Find a stay');
    await h.settle();
    expect(h.calls).toHaveLength(1);
    expect(h.job().state).toBe('needs_you');
    expect(h.cards('stuck')).toHaveLength(1);
  });
});
