// Spec: AT-105 (3 WORKING + a 4th → QUEUED, 👀, checklist with the queued caption; never 4 at once), AT-106 (QUEUED and the AI
// not verified in 10 min → a one-word test first, then WORKING 🛠, checklist after 1.5 s), 08-2 §5.3.3 (Plan card when
// est_minutes > 2; the job stays queued until "Go"), §5.4.1, 08-4 §26.3.
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_EPOCH_MS } from '../../../src/shared/clock';
import type { Settings } from '../../../src/shared/settings';
import { VERIFY_LINE } from '../../unit/m3-engine-helpers';
import { BILLS_PLAN, jobHarness, jobIntake, step, stepDone, tool, verified, badgeSets, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const doneUnverified = (extra = {}) => step({ kind: 'done', result: 'Done.', unverified: true }, extra);

describe('three WORKING slots, end to end', () => {
  it('a 4th job is QUEUED with 👀 and its checklist; it starts only when a slot frees', async () => {
    const script = [
      jobIntake(BILLS_PLAN, { match: 'job one' }),
      jobIntake(BILLS_PLAN, { match: 'job two' }),
      jobIntake(BILLS_PLAN, { match: 'job three' }),
      jobIntake(BILLS_PLAN, { match: 'job four' }),
      // Each running job waits 20 s on its first turn, so three hold the slots while the fourth arrives.
      ...[1, 2, 3].map(() => tool('gmail.search', { query: 'bill' }, { delayMs: 20_000 })),
      ...Array.from({ length: 4 }, () => doneUnverified()),
      tool('gmail.search', { query: 'bill' }),
    ];
    h = jobHarness({ script });
    // One chat each: a second message in a chat with a live job would steer it (08-2 §5.2).
    const ids = ['job one', 'job two', 'job three', 'job four'].map((t) => h!.userSaysIn(h!.chat(t.replace(' ', '_')), t));
    // Let the four intakes land, then look before the 20 s turns end.
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 2));
    h.clock.advance(2_000);
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 2));
    const states = h.jobs().map((j) => j.state);
    expect(states.filter((s) => s === 'working')).toHaveLength(3);
    // M5 (T5): the four intakes race across four chats, so any one of them may be the job left waiting; find it by state.
    const queued = h.jobs().filter((j) => j.state === 'queued');
    expect(queued).toHaveLength(1);
    const fourth = queued[0]!;
    expect(ids).toContain(fourth.user_message_id);
    expect(h.message(String(fourth.user_message_id)).badge).toBe('seen');
    const checklists = h.cards('checklist').map((c) => JSON.parse(String(c.payload)) as { jobId: string });
    expect(checklists.some((c) => c.jobId === fourth.id)).toBe(true);

    await h.settle(500);
    expect(h.jobs().every((j) => j.state === 'done_unverified')).toBe(true);
    // Never 4 at once: the 4th started only after another finished.
    const firstEnd = Math.min(
      ...h
        .jobs()
        .filter((j) => j.id !== fourth.id)
        .map((j) => Number(j.finished_at)),
    );
    expect(Number(h.job(String(fourth.id)).started_at)).toBeGreaterThanOrEqual(firstEnd);
  });
});

describe('AT-106 · verify first when the AI is stale', () => {
  it('a one-word test runs before the job turns; then WORKING 🛠 and the checklist at 1.5 s', async () => {
    const stale = (s: Settings): Settings => {
      const v = verified()(s);
      return {
        ...v,
        ai: { ...v.ai, providers: { 'claude-cli': { kind: 'plan', lastVerifiedAt: TEST_EPOCH_MS - 11 * 60_000, lastVerifyOk: true } } },
      };
    };
    h = jobHarness({
      settings: stale,
      script: [
        jobIntake(BILLS_PLAN),
        VERIFY_LINE,
        tool('gmail.search', { query: 'bill' }, { delayMs: 1_000 }),
        stepDone(0, { delayMs: 1_000 }),
        doneUnverified(),
      ],
    });
    const userId = h.userSays('Find bills due this week');
    await h.settle(100);
    const purposes = h.turnsJsonl().map((t) => t.purpose);
    expect(purposes.slice(0, 3)).toEqual(['intake', 'verify', 'step']);
    const job = h.job();
    expect(badgeSets(h, userId).slice(0, 2)).toEqual(['seen', 'working']);
    const checklist = h.cards('checklist')[0]!;
    expect(Number(checklist.created_at) - Number(job.started_at)).toBe(1_500);
  });
});

describe('08-2 §5.3.3 · Plan card', () => {
  it('est_minutes > 2 → Plan card; the job stays queued until Go, then runs', async () => {
    h = jobHarness({
      script: [jobIntake(BILLS_PLAN, { estimate: { minutes: 5 } }), tool('gmail.search', { query: 'bill' }), doneUnverified()],
    });
    h.userSays('Find bills due this week');
    await h.settle();
    expect(h.job().state).toBe('queued');
    expect(Number(h.job().est_minutes)).toBe(5);
    const plan = h.cards('plan')[0]!;
    expect(plan.state).toBe('pending');
    expect(JSON.parse(String(plan.payload))).toEqual({
      title: 'Reading your email',
      steps: ['Read your email', 'Look for bills due this week'],
      minutes: 5,
      costLine: '',
      big: false,
    });
    expect(h.turnsJsonl().filter((t) => t.purpose === 'step')).toHaveLength(0);

    h.answer(String(plan.id), 'go');
    await h.settle();
    expect(h.cards('plan')[0]!.state).toBe('go');
    expect(h.job().state).toBe('done_unverified');
  });
});
