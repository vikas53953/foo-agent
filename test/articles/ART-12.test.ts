// ART-12a (10-2 §D, Article 12): the AI saying "Step 1 done… step 2 done…" moves nothing: only the runner moves steps, the
// badge and the checklist (08-2 §5.4: state lives in the runner; the step turn's say text is not shown).
// ART-12b: a step frozen for 3 min (no progress) → the stuck card at 3:00 ± 5 s (08-2 §5.6 NO_PROGRESS 180 s, 5 s watchdog).
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, stepAct, tool, BILLS_PLAN, type JobHarness, type PlanStepIn } from '../integration/jobs/jobHarness';
import { fooTexts, stuckLine, until } from '../integration/jobs/t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

describe('Article 12: the runner owns progress', () => {
  it('ART-12a: "Step 1 done… step 2 done…" from the AI leaves badge, steps and checklist unchanged', async () => {
    const claim = 'Step 1 done… step 2 done…';
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        {
          match: { purpose: 'step' },
          reply: stepAct({ kind: 'tool', call: { tool: 'gmail.search', args: { query: 'bill' } }, why: 'next' }, claim),
        },
        step({ kind: 'tool', call: { tool: 'fake.site', args: { site: 'stay.example' } }, why: 'next' }, { delayMs: 600_000 }),
      ],
    });
    const userId = h.userSays('Find my bills');
    await until(h, () => h!.calls.length === 1 && h!.cards('checklist').length === 1);
    const checklist = () => h!.cards('checklist').map((c) => String(c.payload));
    const before = { badge: h.message(userId).badge, steps: h.steps().map((s) => s.state), checklist: checklist() };
    // The runner sits in the next (long) turn: nothing it did since says a step is done.
    for (let i = 0; i < 20; i++) {
      h.clock.advance(1_000);
      await until(h, () => true);
    }
    expect(before.badge).toBe('working');
    expect(h.message(userId).badge).toBe(before.badge);
    expect(h.steps().map((s) => s.state)).toEqual(before.steps);
    expect(h.steps().some((s) => s.state === 'done')).toBe(false);
    expect(checklist()).toEqual(before.checklist);
    expect(fooTexts(h).some((x) => x.includes('Step 1 done'))).toBe(false);
  });

  it('ART-12b: a step frozen for 3 min → the stuck card at 3:00 ± 5 s', async () => {
    const plan: PlanStepIn[] = [
      { phraseKey: 'check_site', slots: { site: 'stay.example' } },
      { phraseKey: 'compare', slots: { what: 'stays' } },
    ];
    // The same page read again and again: nothing new comes back, so after the first read nothing is progress.
    const same = Array.from({ length: 15 }, () => tool('fake.site', { site: 'stay.example' }, { delayMs: 20_000 }));
    h = jobHarness({ script: [jobIntake(plan), ...same, stuckLine('The page never changes')] });
    h.userSays('Find a stay');
    await until(h, () => h!.cards('stuck').length === 1, 500);
    const frozenFor = Number(h.cards('stuck')[0]!.created_at) - Number(h.job().last_progress_at);
    expect(frozenFor).toBeGreaterThanOrEqual(180_000 - 5_000);
    expect(frozenFor).toBeLessThanOrEqual(180_000 + 5_000);
  });
});
