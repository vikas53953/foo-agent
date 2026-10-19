// Spec: AT-084 (the same step fails 3 times → a stuck card with the cost so far and three buttons; the job does not keep
// trying), AT-116 (no step for 3 min, 3 failures, or cost past 2× estimate → NEEDS YOU with the stuck card, badge ⏳; Stop →
// CANCELLED ⛔ stuck_stop, card `stopped`; 15 min unanswered → FAILED ❌, card `timed_out`), 08-2 §5.6 ("Try another way" →
// stuck_count++, counters reset, ROUTE_EXCLUDE; stuck_count ≥ 2 → only Take over / Stop), 08-4 §26.4 (card texts; classify
// turn; fallback), 05-3 §5.19 (payload `{ whatsWrong, spentLine, suggestion, allowOtherWay }`), X-80, SM-A2, SM-A11.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, step, tool, badgeSets, type JobHarness, type PlanStepIn } from './jobHarness';
import { fooTexts, stuckLine, until } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN: PlanStepIn[] = [
  { phraseKey: 'check_site', slots: { site: 'stay.example' } },
  { phraseKey: 'compare', slots: { what: 'stays' } },
];
const failing = (n: number) => Array.from({ length: n }, () => tool('gmail.search', { query: 'stay' }, { delayMs: 1_000 }));
/** The same page read again and again: nothing new comes back, so it is never progress. */
const sameSite = (n: number, delayMs = 20_000) => Array.from({ length: n }, () => tool('fake.site', { site: 'stay.example' }, { delayMs }));
const payloadOf = (c: Record<string, unknown>) =>
  JSON.parse(String(c.payload)) as { whatsWrong: string; spentLine: string; suggestion: string; allowOtherWay: boolean };

describe('AT-084 · three failures in a row', () => {
  it('AT-084: the same step fails 3 times → stuck card with the cost so far and three buttons; no more tries', async () => {
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 10 } },
      script: [jobIntake(PLAN), ...failing(6), stuckLine('The mail search keeps failing')],
    });
    const userId = h.userSays('Find a stay');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('needs_you');
    expect(h.calls).toHaveLength(3);
    const cards = h.cards('stuck');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.state).toBe('asking');
    expect(job.needs_you_card_id).toBe(cards[0]!.id);
    expect(payloadOf(cards[0]!)).toEqual({
      whatsWrong: 'The mail search keeps failing',
      spentLine: t('cards.stuck.spent_line.minutes', { m: 1 }),
      // stay.example is named in the plan and was never opened: "try stay.example instead" (08-4 §26.4 item 2a).
      suggestion: t('cards.stuck.suggestion.try_site', { site: 'stay.example' }),
      allowOtherWay: true,
    });
    // SM-A2: the bubble waits ⏳ while the card is up.
    expect(h.message(userId).badge).toBe('waiting');
    // Nothing more on its own: the clock runs on, no call is made.
    h.clock.advance(60_000);
    await h.settle();
    expect(h.calls).toHaveLength(3);
    expect(h.job().state).toBe('needs_you');
    const classify = h.db.prepare("SELECT * FROM ai_turns WHERE purpose = 'classify'").all() as Record<string, unknown>[];
    expect(classify).toHaveLength(1);
    expect(classify[0]!.job_id).toBe(job.id);
  });

  it('the classify turn failing → the fallback "What\'s wrong" line names the site', async () => {
    h = jobHarness({ tools: { failNext: { 'gmail.search': 10 } }, script: [jobIntake(PLAN), ...failing(3)] });
    h.userSays('Find a stay');
    await h.settle();
    expect(payloadOf(h.cards('stuck')[0]!).whatsWrong).toBe(t('cards.stuck.whats_wrong.fallback', { site: 'this site' }));
  });
});

describe('AT-116 · stuck rules, Stop and the 15-minute timeout', () => {
  it('AT-116: no step for 3 min → stuck card, badge ⏳; Stop on it → CANCELLED stuck_stop, card stopped, badge ⛔', async () => {
    h = jobHarness({
      script: [jobIntake(PLAN), ...sameSite(12), stuckLine('The page never loads')],
    });
    const userId = h.userSays('Find a stay');
    await until(h, () => h!.cards('stuck').length === 1, 1_000);
    expect(h.job().state).toBe('needs_you');
    expect(h.message(userId).badge).toBe('waiting');
    const card = h.cards('stuck')[0]!;
    expect(payloadOf(card).whatsWrong).toBe('The page never loads');

    h.answer(String(card.id), 'stop');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('cancelled');
    expect(job.stop_reason).toBe('stuck_stop');
    expect(h.cards('stuck')[0]!.state).toBe('stopped');
    expect(h.message(userId).badge).toBe('stopped');
    expect(badgeSets(h, userId)).toEqual(['seen', 'working', 'waiting', 'stopped']);
    // G-M4-11: the stop report is the thread.stop.report line.
    expect(fooTexts(h).at(-1)).toBe(t('thread.stop.report.nothing'));
    for (const c of h.cards('checklist')) expect(c.state).toBe('stopped');
  }, 30_000);

  it('AT-116: nobody answers for 15 min → FAILED ❌, stuck card timed_out', async () => {
    h = jobHarness({ tools: { failNext: { 'gmail.search': 10 } }, script: [jobIntake(PLAN), ...failing(3)] });
    const userId = h.userSays('Find a stay');
    await h.settle();
    expect(h.job().state).toBe('needs_you');
    h.clock.advance(15 * 60_000 - 1);
    await h.settle(0);
    expect(h.job().state).toBe('needs_you');
    h.clock.advance(1);
    await h.settle(0);
    expect(h.job().state).toBe('failed');
    expect(h.cards('stuck')[0]!.state).toBe('timed_out');
    expect(h.message(userId).badge).toBe('failed');
  });

  it('AT-116: cost past 2× the estimate → stuck card', async () => {
    const big = { tokensIn: 20_000, tokensOut: 5_000, cacheRead: null, cacheWrite: null, costUsd: null };
    h = jobHarness({
      script: [jobIntake(PLAN), tool('fake.site', { site: 'stay.example' }, { usage: big }), stuckLine('It is costing too much')],
    });
    h.userSays('Find a stay');
    await h.settle();
    // est_tokens = max(2 steps × 6,000) = 12,000; spent 25,000 > 24,000.
    expect(h.job().state).toBe('needs_you');
    expect(h.cards('stuck')).toHaveLength(1);
  });
});

describe('08-2 §5.6 "Try another way"', () => {
  it('resets the counters, adds the site to Avoid, and the job works again; after two, only Take over and Stop', async () => {
    h = jobHarness({
      tools: { blockedSites: ['stay.example'] },
      script: [jobIntake(PLAN), ...sameSite(9, 1_000), stuckLine('Search keeps failing'), stuckLine('Still failing'), stuckLine('Again')],
    });
    h.userSays('Find a stay on stay.example');
    await h.settle();
    for (let round = 1; round <= 2; round++) {
      const card = h.cards('stuck').at(-1)!;
      expect(payloadOf(card).allowOtherWay).toBe(true);
      h.answer(String(card.id), 'other_way');
      await h.settle();
      expect(h.cards('stuck')[round - 1]!.state).toBe('other_way');
      expect(h.job().stuck_count).toBe(round);
    }
    // Three failures each time: 9 calls, 3 stuck cards; the third offers only Take over and Stop.
    expect(h.calls).toHaveLength(9);
    const third = h.cards('stuck');
    expect(third).toHaveLength(3);
    expect(payloadOf(third[2]!).allowOtherWay).toBe(false);
    // An "other_way" answer on it is refused; the card stays open.
    h.answer(String(third[2]!.id), 'other_way');
    await h.settle();
    expect(h.cards('stuck')[2]!.state).toBe('asking');
    const prompts = h
      .turnsJsonl()
      .filter((x) => x.purpose === 'step')
      .map((x) => String(x.prompt));
    expect(prompts.slice(3).every((p) => p.includes('Avoid: stay.example'))).toBe(true);
    expect(prompts.slice(0, 3).some((p) => p.includes('Avoid:'))).toBe(false);
  });

  it('Take over records the choice and the job keeps waiting on the user (the live window is M9)', async () => {
    h = jobHarness({
      tools: { failNext: { 'gmail.search': 10 } },
      script: [jobIntake(PLAN), ...failing(3), step({ kind: 'done', result: 'x', unverified: true })],
    });
    h.userSays('Find a stay');
    await h.settle();
    h.answer(String(h.cards('stuck')[0]!.id), 'take_over');
    await h.settle();
    expect(h.cards('stuck')[0]!.state).toBe('taken_over');
    expect(h.job().state).toBe('needs_you');
    h.clock.advance(20 * 60_000);
    await h.settle(0);
    expect(h.job().state).toBe('needs_you');
  });
});
