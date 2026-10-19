// Spec: AT-108 (WORKING needs a choice / approval / payment / sign-in / code → NEEDS YOU, badge ⏳ (SM-A1), pill "Needs you";
// taskbar and toast are M11), AT-109 (answered → WORKING 🛠, the card collapses to its answered state), 08-2 §5.4.1 (NEEDS_YOU
// releases the slot), 08-4 §26.9 item 5 (current step waiting_user, back to running). Approval / payment / sign-in / secret
// cards are test stubs here (M5, M9, M10 build them), opened through the fake.needsUser tool.
import { afterEach, describe, expect, it } from 'vitest';
import type { DbOp } from '../../../src/engine/protocol';
import { BILLS_PLAN, jobHarness, jobIntake, step, tool, badgeSets, type JobHarness, type PlanStepIn } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const pill = (x: JobHarness) => (x.db.prepare('SELECT pill FROM chats WHERE id = ?').get(x.chatId) as { pill: string | null }).pill;

describe('AT-108 / AT-109 · NEEDS YOU and back', () => {
  it('a choice: ⏳, pill "Needs you", step waiting_user; the answer → WORKING 🛠, card answered, Decisions in part 8', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        step({ kind: 'ask', card: { question: 'Which month?', options: [{ label: 'October' }, { label: 'September' }] } }),
        {
          match: { purpose: 'step', promptIncludes: 'Q: Which month? → A: October' },
          reply: '<say></say><act>{"decision":{"kind":"done","result":"Done.","unverified":true},"usedMemoryIds":[]}</act>',
        },
      ],
    });
    const userId = h.userSays('Find bills due this week');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('needs_you');
    const card = h.cards('choice')[0]!;
    expect(card.state).toBe('asking');
    expect(job.needs_you_card_id).toBe(card.id);
    expect(h.message(userId).badge).toBe('waiting');
    expect(pill(h)).toBe('needs_you');
    expect(h.steps().map((s) => s.state)).toEqual(['waiting_user', 'pending']);

    h.answer(String(card.id), 'o1');
    await h.settle();
    const answered = h.cards('choice')[0]!;
    expect(answered.state).toBe('answered');
    expect(answered.resolved_by).toBe('tap');
    expect(badgeSets(h, userId)).toEqual(['seen', 'working', 'waiting', 'working', 'done_unverified']);
    expect(h.job().state).toBe('done_unverified');
  });

  it.each([
    ['approval', 'PENDING', 'APPROVED'],
    ['payment', 'PENDING', 'APPROVED'],
    ['signin', 'waiting', 'signed_in'],
    ['secret', 'asking', 'saved'],
  ])('a %s card (stub): NEEDS YOU ⏳, then answered → WORKING', async (type, open, done) => {
    h = jobHarness({
      script: [jobIntake(BILLS_PLAN), tool('fake.needsUser', { card: type }), step({ kind: 'done', result: 'Done.', unverified: true })],
    });
    const userId = h.userSays('Find bills due this week');
    await h.settle();
    expect(h.job().state).toBe('needs_you');
    const card = h.cards(type)[0]!;
    expect(card.state).toBe(open);
    expect(h.message(userId).badge).toBe('waiting');
    // The approval / payment stubs resume only on an explicit Approve (M5 builds the real cards; a decline cancels).
    h.answer(String(card.id), type === 'approval' || type === 'payment' ? 'approve' : undefined);
    await h.settle();
    expect(h.cards(type)[0]!.state).toBe(done);
    expect(h.job().state).toBe('done_unverified');
  });

  it('a NEEDS YOU job releases its slot (08-2 §5.4.1)', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN, { match: 'first' }),
        jobIntake(BILLS_PLAN, { match: 'second' }),
        jobIntake(BILLS_PLAN, { match: 'third' }),
        jobIntake(BILLS_PLAN, { match: 'fourth' }),
        ...[1, 2, 3].map(() => tool('fake.needsUser', { card: 'approval' })),
        step({ kind: 'done', result: 'Done.', unverified: true }),
      ],
    });
    for (const w of ['first', 'second', 'third', 'fourth']) h.userSaysIn(h.chat(w), w);
    await h.settle();
    const states = h.jobs().map((j) => j.state);
    expect(states.filter((s) => s === 'needs_you')).toHaveLength(3);
    expect(states.filter((s) => s === 'done_unverified')).toHaveLength(1);
  });

  it('an answered NEEDS YOU job waits for a free slot (max 3 WORKING), then resumes ahead of queued jobs', async () => {
    const plan = (what: string): PlanStepIn[] => [{ phraseKey: 'read_email' }, { phraseKey: 'look_for', slots: { what } }];
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const only = (what: string) => ({ match: { purpose: 'step', promptIncludes: `Look for ${what}` } });
    const done = (what: string) => ({ ...step({ kind: 'done', result: `Done ${what}.`, unverified: true }), ...only(what) });
    h = jobHarness({
      script: [
        ...names.map((n) => jobIntake(plan(n), { match: `job ${n}` })),
        {
          ...step({ kind: 'ask', card: { question: 'Which month?', options: [{ label: 'October' }, { label: 'September' }] } }),
          ...only('alpha'),
        },
        done('alpha'),
        ...['beta', 'gamma', 'delta'].flatMap((n) => [{ ...tool('gmail.search', { query: n }, { delayMs: 20_000 }), ...only(n) }, done(n)]),
        done('epsilon'),
      ],
    });
    const ids = names.map((n) => h!.userSaysIn(h!.chat(n), `job ${n}`));
    const jobOf = (i: number) => h!.jobs().find((j) => j.user_message_id === ids[i])!;
    const poll = async (rounds = 60) => {
      for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 2));
    };
    // Polls until the moves land (a slow Windows runner needs more than a fixed number of rounds), at most ~5 s.
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 2_500 && !ok(); i++) await new Promise((r) => setTimeout(r, 2));
    };
    await poll();
    h.clock.advance(2_000);
    await until(() => jobOf(0).state === 'needs_you' && h!.jobs().filter((j) => j.state === 'working').length === 3);
    expect(jobOf(0).state).toBe('needs_you');
    expect(h.jobs().filter((j) => j.state === 'working')).toHaveLength(3);
    expect(jobOf(4).state).toBe('queued');

    h.answer(String(h.cards('choice')[0]!.id), 'o1');
    await until(() => h!.cards('choice')[0]!.state === 'answered');
    await poll();
    expect(h.cards('choice')[0]!.state).toBe('answered');
    expect(jobOf(0).state).toBe('needs_you');
    expect(h.jobs().filter((j) => j.state === 'working')).toHaveLength(3);

    await h.settle(500);
    expect(h.jobs().every((j) => j.state === 'done_unverified')).toBe(true);
    // Replaying every move: never more than 3 WORKING, and the answered job resumed before the queued one started.
    const state = new Map<unknown, string>();
    const order: string[] = [];
    for (const t of h.txs.filter((x) => x.ok))
      for (const op of t.ops)
        if (op.op === 'transition') {
          const { id, to } = op as Extract<DbOp, { op: 'transition' }>;
          if (to === 'working') order.push(`${String(state.get(id) ?? 'queued')}>${String(id)}`);
          state.set(id, to);
          expect([...state.values()].filter((v) => v === 'working').length).toBeLessThanOrEqual(3);
        }
    const resumed = order.indexOf(`needs_you>${String(jobOf(0).id)}`);
    const queuedStart = order.indexOf(`queued>${String(jobOf(4).id)}`);
    expect(resumed).toBeGreaterThanOrEqual(0);
    expect(resumed).toBeLessThan(queuedStart);
  });

  it('an answer that lands while the old turn is still finishing still resumes the job', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        step({ kind: 'ask', card: { question: 'Which month?', options: [{ label: 'October' }, { label: 'September' }] } }),
        step({ kind: 'done', result: 'Done.', unverified: true }),
      ],
    });
    // Answer inside the very db.tx that moves the job to NEEDS_YOU, before the runner writes its mirrors.
    const harness = h;
    const push = harness.txs.push.bind(harness.txs);
    let answered = false;
    harness.txs.push = (...calls) => {
      const n = push(...calls);
      for (const c of calls)
        if (!answered && c.ok && c.ops.some((op) => op.op === 'transition' && (op as { to: string }).to === 'needs_you')) {
          answered = true;
          const card = harness.cards('choice')[0]!;
          harness.answer(String(card.id), 'o1');
        }
      return n;
    };
    harness.userSays('Find bills due this week');
    await harness.settle();
    expect(answered).toBe(true);
    expect(harness.job().state).toBe('done_unverified');
  });

  it('Decline on an approval or payment card (stub) cancels the job (07-2 "declined → cancelled")', async () => {
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        tool('fake.needsUser', { card: 'payment' }),
        step({ kind: 'done', result: 'Done.', unverified: true }),
      ],
    });
    const userId = h.userSays('Pay the electricity bill');
    await h.settle();
    h.answer(String(h.cards('payment')[0]!.id), 'decline');
    await h.settle();
    expect(h.cards('payment')[0]!.state).toBe('DECLINED');
    expect(h.job()).toMatchObject({ state: 'cancelled', stop_reason: 'approval_declined' });
    expect(h.message(userId).badge).toBe('stopped');
    expect(h.turnsJsonl().filter((t) => t.purpose === 'step')).toHaveLength(1);
  });

  it('a typed answer is redacted before it reaches the decisions and plan.md', async () => {
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
    h = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        step({ kind: 'ask', card: { question: 'Which key?', options: [{ label: 'Main' }, { label: 'Backup' }] } }),
        step({ kind: 'done', result: 'Done.', unverified: true }, { delayMs: 5_000 }),
      ],
    });
    h.userSays('Find bills due this week');
    await h.settle();
    const card = h.cards('choice')[0]!;
    h.bridge.send('card.answered', { cardId: String(card.id), text: `use ${secret}`, resolvedBy: 'tap' });
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 2));
    const plan = h.mirror(String(h.job().id), 'plan.md') ?? '';
    expect(plan).toContain('Q: Which key?');
    expect(plan).not.toContain(secret);
    expect(h.turnsJsonl().every((t) => !String(t.prompt).includes(secret))).toBe(true);
    await h.settle();
  });
});
