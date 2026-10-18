// Spec: AT-108 (WORKING needs a choice / approval / payment / sign-in / code → NEEDS YOU, badge ⏳ (SM-A1), pill "Needs you";
// taskbar and toast are M11), AT-109 (answered → WORKING 🛠, the card collapses to its answered state), 08-2 §5.4.1 (NEEDS_YOU
// releases the slot), 08-4 §26.9 item 5 (current step waiting_user, back to running). Approval / payment / sign-in / secret
// cards are test stubs here (M5, M9, M10 build them), opened through the fake.needsUser tool.
import { afterEach, describe, expect, it } from 'vitest';
import { BILLS_PLAN, jobHarness, jobIntake, step, tool, badgeSets, type JobHarness } from './jobHarness';

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
    h.answer(String(card.id));
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
    for (const w of ['first', 'second', 'third', 'fourth']) h.userSays(w);
    await h.settle();
    const states = h.jobs().map((j) => j.state);
    expect(states.filter((s) => s === 'needs_you')).toHaveLength(3);
    expect(states.filter((s) => s === 'done_unverified')).toHaveLength(1);
  });
});
