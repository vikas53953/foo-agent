// Spec: AT-019 (J5: Gmail connected, "Find bills due this week" → a checklist within 2 s and a first result line within 60 s),
// 08-2 §5.3.3 (job created from intake kind 'job'), §5.4.2 (the loop; checklist after 1.5 s when step_count ≥ 2), §5.8 (finish:
// the proof is checked against recorded tool results; the result text posted as one message), 08-1 §4.1.2 (state.json and
// plan.md mirrors after every step), 08-0 §F (badges 👀 → 🛠 → ✅). Fake AI + fake gmail tools (M8 brings the connector).
import { afterEach, describe, expect, it } from 'vitest';
import { BILLS_PLAN, jobHarness, jobIntake, stepDone, step, tool, badgeSets, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const RESULT = 'Two bills are due this week: electricity ₹1,240 by Tue 20 Oct and broadband ₹799 by Thu 22 Oct.';

export function billsScript() {
  return [
    jobIntake(BILLS_PLAN, { title: 'Find bills' }),
    tool('gmail.search', { query: 'subject:bill newer_than:7d' }, { delayMs: 600 }),
    stepDone(0, { delayMs: 600 }),
    tool('gmail.read', { id: 'g1' }, { delayMs: 400 }),
    stepDone(1, { delayMs: 300 }),
    step({ kind: 'done', result: RESULT, proof: { kind: 'emails_read', count: 2, messageIds: ['g1', 'g2'] } }, { delayMs: 300 }),
  ];
}

describe('AT-019 · Find bills due this week', () => {
  it('runs to DONE: checklist within 2 s, the result within 60 s, proof checked, badge ✅', async () => {
    h = jobHarness({ script: billsScript() });
    const sentAt = h.clock.now() + 1_000;
    const userId = h.userSays('Find bills due this week');
    await h.settle(100);

    const job = h.job();
    expect(job.state).toBe('done');
    expect(job.title).toBe('Reading your email');
    expect(job.intent).toBe('read_only');
    expect(job.origin).toBe('user');
    expect(job.user_message_id).toBe(userId);
    expect(JSON.parse(String(job.proof))).toEqual({ kind: 'emails_read', count: 2, messageIds: ['g1', 'g2'] });

    const checklist = h.cards('checklist');
    expect(checklist).toHaveLength(1);
    expect(checklist[0]!.state).toBe('done');
    expect(JSON.parse(String(checklist[0]!.payload))).toEqual({ jobId: job.id });
    const shownAfter = Number(checklist[0]!.created_at) - sentAt;
    expect(shownAfter).toBeGreaterThanOrEqual(1_500);
    expect(shownAfter).toBeLessThanOrEqual(2_000);

    const result = h.message(String(job.result_message_id));
    expect(result.text).toBe(RESULT);
    expect(result.author_kind).toBe('foo');
    expect(Number(result.created_at) - sentAt).toBeLessThanOrEqual(60_000);

    expect(h.steps().map((s) => s.state)).toEqual(['done', 'done']);
    const calls = h.toolCalls();
    expect(calls.map((c) => [c.tool, c.action_class, c.gate, c.outcome])).toEqual([
      ['gmail.search', 'read', 'auto', 'ok'],
      ['gmail.read', 'read', 'auto', 'ok'],
    ]);
    expect(h.message(userId).badge).toBe('done');
    expect(badgeSets(h, userId)).toEqual(['seen', 'working', 'done']);
  });

  it('writes state.json and plan.md after every step (08-1 §4.1.2)', async () => {
    h = jobHarness({ script: billsScript() });
    h.userSays('Find bills due this week');
    await h.settle(100);
    const id = String(h.job().id);
    const state = JSON.parse(h.mirror(id, 'state.json') ?? '{}') as Record<string, unknown>;
    expect(state.schemaVersion).toBe(1);
    expect((state.job as { state: string }).state).toBe('done');
    expect((state.steps as unknown[]).length).toBe(2);
    expect(state.estimate).toEqual({ minutes: 1.5, tokens: 12_000, costPaise: null });
    const plan = h.mirror(id, 'plan.md') ?? '';
    expect(plan.split('\n').slice(0, 4)).toEqual([
      '# Reading your email',
      'Asked: Find bills due this week',
      '1. [x] Read your email',
      '2. [x] Looked for bills due this week',
    ]);
    expect(plan).toContain('Route: api');
  });
});
